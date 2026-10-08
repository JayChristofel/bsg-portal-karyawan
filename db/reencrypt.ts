/**
 * Re-encrypt sensitive columns after rotating ENCRYPTION_KEY.
 *
 * Usage:
 *   npm run db:reencrypt -- --old="<old key>" --new="<new key>"            # dry run
 *   npm run db:reencrypt -- --old="<old key>" --new="<new key>" --apply    # commit
 *
 * Run this BEFORE changing ENCRYPTION_KEY in .env. Once the key is rotated the
 * old ciphertexts are unrecoverable without the old key.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

import crypto from 'node:crypto';
import postgres from 'postgres';

type Column = 'nip' | 'jabatan_sk' | 'jabatan_sekarang' | 'cabang';
const ENCRYPTED_COLUMNS: Column[] = ['nip', 'jabatan_sk', 'jabatan_sekarang', 'cabang'];
const PREFIX = 'gcm1';
const LEGACY_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i;

function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error('Key must be at least 32 characters.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/** Returns plaintext, or null when the value is not an encrypted payload. */
function tryDecrypt(value: string, key: Buffer): string | null {
  if (!value) return null;

  let parts: string[];
  if (value.startsWith(PREFIX + ':')) {
    parts = value.split(':').slice(1);
  } else if (LEGACY_RE.test(value)) {
    parts = value.split(':');
  } else {
    return null; // genuine plaintext, nothing to do
  }

  if (parts.length !== 3) return null;

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'hex'));
  decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]).toString('utf8');
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [PREFIX, iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };

  const oldKey = arg('old') || process.env.OLD_ENCRYPTION_KEY;
  const newKey = arg('new') || process.env.NEW_ENCRYPTION_KEY;
  const apply = args.includes('--apply');

  if (!oldKey || !newKey) {
    console.error('\n❌ --old dan --new wajib diisi.');
    console.error('   Contoh: npm run db:reencrypt -- --old="lama" --new="baru"\n');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL tidak ditemukan.\n');
    process.exit(1);
  }

  const oldBuf = deriveKey(oldKey);
  const newBuf = deriveKey(newKey);

  const sql = postgres(process.env.DATABASE_URL, { prepare: false });

  console.log(`\n🔄 Mode: ${apply ? 'APPLY (menulis ke DB)' : 'DRY RUN (tidak menulis)'}\n`);

  try {
    const rows = await sql<({ id: number } & Record<string, string>)[]>`SELECT * FROM pegawai`;
    console.log(`   ${rows.length} baris ditemukan\n`);

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const updates: Record<string, string> = {};

      for (const col of ENCRYPTED_COLUMNS) {
        const current = (row as Record<string, string>)[col];
        if (!current) continue;

        let plaintext: string | null = null;
        try {
          plaintext = tryDecrypt(current, oldBuf);
        } catch {
          // May already be encrypted with the NEW key (idempotent re-run).
          try {
            tryDecrypt(current, newBuf);
            skipped++;
            continue;
          } catch {
            failed++;
            console.error(`   ✗ id=${row.id} ${col}: gagal decrypt dengan key lama maupun baru`);
            continue;
          }
        }

        if (plaintext === null) {
          skipped++; // already plaintext
          continue;
        }

        updates[col] = encrypt(plaintext, newBuf);
      }

      if (Object.keys(updates).length === 0) continue;

      if (apply) {
        await sql.begin(async (tx) => {
          for (const [col, value] of Object.entries(updates)) {
            await tx`UPDATE pegawai SET ${tx(col)} = ${value} WHERE id = ${row.id}`;
          }
        });
      }
      migrated++;
    }

    console.log(`\n   ✓ dimigrasi : ${migrated}`);
    console.log(`   · dilewati  : ${skipped}`);
    console.log(`   ✗ gagal     : ${failed}\n`);

    if (!apply) {
      console.log('   Ini dry run. Tambahkan --apply untuk menulis.\n');
    } else if (failed === 0) {
      console.log('   ✅ Selesai. Sekarang ganti ENCRYPTION_KEY di .env dengan nilai --new.\n');
    } else {
      console.error('   ⚠️  Ada baris gagal. Jangan rotasi ENCRYPTION_KEY di .env.\n');
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('\n[x] Gagal:', err.message);
  process.exit(1);
});