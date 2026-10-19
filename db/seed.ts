import { loadEnvConfig } from '@next/env';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PassThrough } from 'node:stream';

// Load environment variables from .env.local and .env
loadEnvConfig(process.cwd());

import { db } from './index';
import { admins } from './schema';
import { hashPassword, MAX_PASSWORD_LENGTH } from '../lib/auth';
import { eq } from 'drizzle-orm';

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

async function promptVisible(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

// Hidden prompt: write through a muted stream so the password never echoes.
async function promptHidden(question: string): Promise<string> {
  process.stdout.write(question);
  const muted = new PassThrough();
  muted._write = (_chunk, _encoding, callback) => callback();
  const rl = readline.createInterface({ input, output: muted, terminal: true });
  try {
    return await rl.question('');
  } finally {
    rl.close();
    console.log('');
  }
}

async function main() {
  // SECURITY: never accept the password as a CLI argument — argv is visible to
  // every local user via `ps` and is persisted in shell history. Username may
  // still be passed positionally; password is always prompted for.
  const args = process.argv.slice(2);

  if (args.length > 1) {
    console.error('\n⚠️  Password tidak lagi diterima sebagai argumen CLI (ekspos di process list / shell history).');
    console.error('    Jalankan `npm run db:seed -- <username>` dan masukkan password saat diminta.\n');
    process.exit(1);
  }

  console.log('\n🔐 Setup Akun Administrator Portal Pegawai');
  console.log('─────────────────────────────────────────');
  const username = (args[0] ?? (await promptVisible('Masukkan Username Admin: '))).trim();
  // Not trimmed: the login form does not trim either, so trimming here would make a
  // password with leading/trailing spaces impossible to type back in.
  const password = await promptHidden('Masukkan Password: ');

  if (!username || !password) {
    console.error('\n❌ Username dan password tidak boleh kosong.\n');
    process.exit(1);
  }
  if (!USERNAME_RE.test(username)) {
    console.error('\n❌ Username hanya boleh huruf, angka, titik, underscore, atau strip (3-32 karakter).\n');
    process.exit(1);
  }
  if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
    console.error(`\n❌ Password harus 8-${MAX_PASSWORD_LENGTH} karakter.\n`);
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

  const passwordHash = await hashPassword(password);

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
