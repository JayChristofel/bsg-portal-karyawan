import { loadEnvConfig } from '@next/env';

// Load environment variables from .env.local and .env
loadEnvConfig(process.cwd());

import { db } from './index';
import { pegawai, recipients } from './schema';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL tidak ditemukan di .env.local!');
    process.exit(1);
  }

  console.log('[*] Memulai seeding data contoh (dummy data)...');

  const samplePegawai = [
    {
      name: 'Ahmad Fauzi',
      nip: '198503152010011002',
      jabatanSk: 'Kepala Bagian TI & Operasional',
      jabatanSekarang: 'Kepala Bagian TI & Operasional',
      cabang: 'Kantor Pusat BSG',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      token: null,
    },
    {
      name: 'Siti Rahmawati',
      nip: '199207222018022004',
      jabatanSk: 'Staf Customer Service',
      jabatanSekarang: 'Plt. Pemimpin KCP',
      cabang: 'Cabang Utama',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      token: null,
    },
    {
      name: 'Christian Pangemanan',
      nip: '199011042015031001',
      jabatanSk: 'Staf Operasional',
      jabatanSekarang: 'Staf Operasional & Kliring',
      cabang: 'Cabang Tomohon',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      token: null,
    },
  ];

  for (const p of samplePegawai) {
    await db.insert(pegawai).values(p);
  }

  console.log(`[✓] Berhasil menambahkan ${samplePegawai.length} data pegawai contoh (terenkripsi AES-256-GCM otomatis).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[x] Gagal seeding dummy data:', err.message || err);
  process.exit(1);
});
