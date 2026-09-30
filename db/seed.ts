import { loadEnvConfig } from '@next/env';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// Load environment variables from .env.local and .env
loadEnvConfig(process.cwd());

import { db } from './index';
import { admins } from './schema';
import { hashPassword } from '../lib/auth';
import { eq } from 'drizzle-orm';

async function main() {
  const args = process.argv.slice(2);
  let username = args[0];
  let password = args[1];

  // If arguments not provided via CLI, ask interactively
  if (!username || !password) {
    const rl = readline.createInterface({ input, output });
    try {
      console.log('\n🔐 Setup Akun Administrator Portal Pegawai');
      console.log('─────────────────────────────────────────');
      if (!username) {
        username = (await rl.question('Masukkan Username Admin: ')).trim();
      }
      if (!password) {
        password = (await rl.question('Masukkan Password: ')).trim();
      }
    } finally {
      rl.close();
    }
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
