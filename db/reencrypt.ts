/**
 * Re-encrypt every encrypted column after rotating ENCRYPTION_KEY.
 *
 * Covers `pegawai` (nip, jabatan_sk, jabatan_sekarang, cabang) and every encrypted
 * value in `settings` (SMTP password / API key, WhatsApp gateway password).
 *
 * Usage (keys via environment, so they do not land in shell history or `ps`):
 *   OLD_ENCRYPTION_KEY="<old>" NEW_ENCRYPTION_KEY="<new>" npm run db:reencrypt           # dry run
 *   OLD_ENCRYPTION_KEY="<old>" NEW_ENCRYPTION_KEY="<new>" npm run db:reencrypt -- --apply # commit
 *
 * PROCEDURE
 *   1. Take a database backup.
 *   2. Put the app in maintenance (or accept that writes during the run are
 *      re-checked, see below) -- the app keeps the OLD key until step 5, so it can
 *      still read everything this script has not touched yet.
 *   3. Dry run, then --apply.
 *   4. Run it a second time: it must report 0 migrated and 0 failed. A row created
 *      by the live app after the snapshot is encrypted with the old key and is
 *      picked up by this second run.
 *   5. Only then set ENCRYPTION_KEY to the new value and redeploy.
 *
 * Each row is rewritten atomically (all of its columns or none) under a row lock,
 * and only if it is still what the snapshot saw; otherwise it is reported as
 * changed and left for the next run.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

import crypto from 'node:crypto';
import postgres from 'postgres';

interface Target {
  table: string;
  pk: string;
  columns: string[];
}

const TARGETS: Target[] = [
  { table: 'pegawai', pk: 'id', columns: ['nip', 'jabatan_sk', 'jabatan_sekarang', 'cabang'] },
  { table: 'settings', pk: 'key', columns: ['value'] },
];

const PREFIX = 'gcm1';
const LEGACY_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i;

function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error('Key must be at least 32 characters.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Plaintext, or null when the value is not an encrypted payload (genuine plaintext).
 * Throws when it IS an encrypted payload but cannot be opened with `key`.
 */
function tryDecrypt(value: string, key: Buffer): string | null {
  if (!value) return null;

  let parts: string[];
  if (value.startsWith(PREFIX + ':')) {
    parts = value.split(':').slice(1);
    if (parts.length !== 3) throw new Error('malformed ciphertext');
  } else if (LEGACY_RE.test(value)) {
    parts = value.split(':');
  } else {
    return null;
  }

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

type Row = Record<string, string | number | null>;

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };

  const argvKeys = arg('old') !== undefined || arg('new') !== undefined;
  if (argvKeys) {
    console.warn('⚠️  Key lewat argumen terlihat di `ps` dan riwayat shell. Pakai OLD_ENCRYPTION_KEY / NEW_ENCRYPTION_KEY.');
  }
  const oldKey = process.env.OLD_ENCRYPTION_KEY || arg('old');
  const newKey = process.env.NEW_ENCRYPTION_KEY || arg('new');
  const apply = args.includes('--apply');

  if (!oldKey || !newKey) {
    console.error('\n❌ OLD_ENCRYPTION_KEY dan NEW_ENCRYPTION_KEY wajib diisi.\n');
    process.exit(1);
  }
  if (oldKey === newKey) {
    console.error('\n❌ Key lama dan baru sama; tidak ada yang perlu dirotasi.\n');
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

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const { table, pk, columns } of TARGETS) {
      const rows = await sql<Row[]>`SELECT * FROM ${sql(table)}`;
      console.log(`   ${table}: ${rows.length} baris`);

      for (const row of rows) {
        const id = row[pk] as string | number;
        const updates: Record<string, string> = {};
        let rowFailed = false;

        for (const col of columns) {
          const current = row[col];
          if (typeof current !== 'string' || !current) continue;

          try {
            const plaintext = tryDecrypt(current, oldBuf);
            if (plaintext === null) {
              skipped++; // genuine plaintext
              continue;
            }
            updates[col] = encrypt(plaintext, newBuf);
          } catch {
            // Already on the NEW key (idempotent re-run)?
            try {
              tryDecrypt(current, newBuf);
              skipped++;
            } catch {
              rowFailed = true;
              console.error(`   ✗ ${table} ${pk}=${id} ${col}: tidak bisa didekripsi dengan key lama maupun baru`);
            }
          }
        }

        // A row is migrated whole or not at all: never leave old- and new-key columns mixed.
        if (rowFailed) {
          failed++;
          continue;
        }
        if (Object.keys(updates).length === 0) continue;

        if (!apply) {
          migrated++;
          continue;
        }

        try {
          const ok = await sql.begin(async (tx) => {
            const [locked] = await tx<Row[]>`
              SELECT * FROM ${tx(table)} WHERE ${tx(pk)} = ${id} FOR UPDATE`;
            if (!locked) return false;
            // Compare-and-set: bail if the live app changed the row since the snapshot.
            for (const col of Object.keys(updates)) {
              if (locked[col] !== row[col]) return false;
            }
            await tx`UPDATE ${tx(table)} SET ${tx(updates)} WHERE ${tx(pk)} = ${id}`;
            // Round-trip check before the transaction commits.
            const [after] = await tx<Row[]>`SELECT * FROM ${tx(table)} WHERE ${tx(pk)} = ${id}`;
            for (const col of Object.keys(updates)) {
              tryDecrypt(after[col] as string, newBuf);
            }
            return true;
          });
          if (ok) migrated++;
          else {
            failed++;
            console.error(`   ✗ ${table} ${pk}=${id}: berubah saat proses berjalan, jalankan ulang`);
          }
        } catch (err) {
          failed++;
          console.error(`   ✗ ${table} ${pk}=${id}: ${(err as Error).message}`);
        }
      }
    }

    // Final sweep: anything still readable only with the OLD key was missed (e.g. a
    // row inserted by the live app mid-run). Applies only after real writes.
    let stragglers = 0;
    if (apply) {
      for (const { table, columns } of TARGETS) {
        const rows = await sql<Row[]>`SELECT * FROM ${sql(table)}`;
        for (const row of rows) {
          for (const col of columns) {
            const v = row[col];
            if (typeof v !== 'string' || !v) continue;
            try {
              tryDecrypt(v, newBuf);
            } catch {
              stragglers++;
            }
          }
        }
      }
    }

    console.log(`\n   ✓ ${apply ? 'dimigrasi' : 'akan dimigrasi'} : ${migrated}`);
    console.log(`   · dilewati  : ${skipped}`);
    console.log(`   ✗ gagal     : ${failed}`);
    if (apply) console.log(`   ⚠ belum terbaca key baru: ${stragglers}`);
    console.log('');

    if (!apply) {
      console.log('   Ini dry run. Tambahkan --apply untuk menulis.\n');
    } else if (failed === 0 && stragglers === 0) {
      console.log('   ✅ Semua nilai terbaca dengan key baru.');
      console.log('   Jalankan sekali lagi (harus 0 dimigrasi, 0 gagal), lalu ganti ENCRYPTION_KEY di environment.\n');
    } else {
      console.error('   ⚠️  Masih ada yang belum bermigrasi. Jalankan ulang; JANGAN ganti ENCRYPTION_KEY dulu.\n');
    }
    if (failed > 0 || stragglers > 0) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('\n[x] Gagal:', err.message);
  process.exit(1);
});
