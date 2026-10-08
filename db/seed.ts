import { loadEnvConfig } from '@next/env';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PassThrough } from 'node:stream';

// Load environment variables from .env.local and .env
loadEnvConfig(process.cwd());

import { db } from './index';
import { admins } from './schema';
import { hashPassword } from '../lib/auth';
import { eq } from 'drizzle-orm';

async function main() {
  // SECURITY: never accept the password as a CLI argument — argv is visible to
  // every local user via `ps` and is persisted in shell history. Username may
  // still be passed positionally; password is always prompted for.
  const args = process.argv.slice(2);
  let username = args[0];
  let password: string | undefined;

  if (args.length > 1) {
    console.error('\n⚠️  Password tidak lagi diterima sebagai argumen CLI (ekspos di process list / shell history).');
    console.error('    Jalankan `npm run db:seed -- <username>` dan masukkan password saat diminta.\n');
    process.exit(1);
  }

  // Hidden prompt: write through a muted stream so the password never echoes.
  const muted = new PassThrough();
  muted._write = (chunk, encoding, callback) => callback();

  const rl = readline.createInterface({ input, output: muted, terminal: true });
  try {
    console.log('\n🔐 Setup Akun Administrator Portal Pegawai');
    console.log('─────────────────────────────────────────');
    if (!username) {
      rl.close();
      const visible = readline.createInterface({ input, output });
      username = (await visible.question('Masukkan Username Admin: ')).trim();
      visible.close();
    }
    password = (await rl.question('Masukkan Password: ')).trim();
    console.log('');
  } finally {
    rl.close();
  }

  if (!username || !password) {
    console.error('\n❌ Username dan password tidak boleh kosong.\n');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL tidak ditemukan!');
    console.error('Pastikan file .env.local sudah dibuat dan berisi DATABASE_URL Supabase yang valid.\n');
    process.exit(1);
  }

  console.log(`\n[*] Menghubungkan ke database Supabase...`);
  console.log(`[*] Memeriksa akun '${username}'...`);

  const existing = await db
    .select()
    .from(admins)
    .where(eq(admins.username, username))
    .limit(1);

  const passwordHash = hashPassword(password);

  if (existing.length > 0) {
    console.log(`[!] Akun '${username}' sudah ada di database. Memperbarui password...`);
    await db
      .update(admins)
      .set({ passwordHash })
      .where(eq(admins.username, username));
    console.log(`[✓] Sukses! Password untuk admin '${username}' berhasil diperbarui di Supabase.\n`);
  } else {
    console.log(`[*] Menambahkan admin baru '${username}'...`);
    await db.insert(admins).values({
      username,
      passwordHash,
    });
    console.log(`[✓] Sukses! Akun admin '${username}' berhasil dibuat di Supabase.\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n[x] Gagal melakukan seed admin:', err.message || err);
  process.exit(1);
});
