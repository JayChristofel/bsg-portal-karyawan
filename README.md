# Portal Pengkinian Data Pegawai

Sistem Portal Pengkinian Data Pegawai & Simulasi Security Awareness internal yang dibangun dengan **Next.js (App Router)**, **Drizzle ORM**, **Supabase (PostgreSQL)**, dan **AES-256-GCM End-to-End Encryption**, dioptimalkan untuk deployment di **Vercel**.

---

## 🚀 Fitur Utama

1. **Portal Publik (`/` atau `/?t=[token]`):**
   - Tampilan identik 100% Microsoft 365 Enterprise Portal (Mobile-First & Desktop Responsive).
   - Dropdown custom pencarian Kantor Cabang & KCP berdasarkan kategori unit kerja.
   - **Awareness Tracking Otomatis:**
     - Event `open` otomatis dikirim saat link personalisasi dibuka.
     - Event `start` otomatis dikirim saat tombol *Mulai Pengkinian Data* diklik.
     - Event `submit` tercatat saat form berhasil disimpan.
2. **Keamanan Data (End-to-End Encryption):**
   - Kolom sensitif (`nip`, `jabatan_sk`, `jabatan_sekarang`, `cabang`) otomatis dienkripsi dengan **AES-256-GCM** sebelum disimpan ke database Supabase.
   - Didekripsi otomatis saat dibuka oleh administrator yang sah di dashboard.
3. **Autentikasi & Proteksi Rute (`proxy.ts`):**
   - Sesuai standar Next.js terbaru via `proxy.ts` (menggantikan middleware lama).
   - Sesi aman dengan HTTP-Only JWT Cookie (`session`) bertanda tangan HMAC-SHA256 (`jose`).
   - Hash password menggunakan PBKDF2-SHA256 dengan 600.000 iterasi.
   - **Kredensial admin tidak disimpan di `.env` atau config**, melainkan di database.
4. **Dashboard Admin (`/admin`):**
   - Rekapitulasi data pegawai secara real-time.
   - Tambah data manual, inline edit (✏️), dan hapus data (🗑️).
   - Ekspor data ke format Excel CSV dengan UTF-8 BOM (`/api/export.csv`).
5. **Manajemen Kampanye (`/admin/campaign`):**
   - Generator link simulasi awareness massal (satu nama per baris).
   - Funnel analitik pelacakan: *Total Penerima → Dibuka → Mulai Isi → Submit*.

---

## 🛠️ Persiapan & Instalasi

### 1. Buat Tabel di Supabase
Skema didefinisikan di `db/schema.ts` dan diterapkan lewat migrasi di folder `drizzle/`.

**DB baru** — jalankan semua migrasi berurutan (SQL Editor Supabase atau `psql`):
```
drizzle/0000_talented_daredevil.sql
drizzle/0001_broadcast_warmup_tables.sql
```
**DB yang sudah ada** — `0001` bersifat idempoten (aman dijalankan ulang): ia membuat
tabel broadcast/warm-up bila belum ada, menggabungkan baris ganda `send_counters`, lalu
memasang primary key `(number_id, day)`. **Backup dulu**, coba di staging, baru produksi.

> Jangan jalankan `db/schema.sql` (sudah usang). Setelah mengubah `db/schema.ts`,
> buat migrasi baru dengan `npm run db:generate` dan review SQL-nya sebelum diterapkan.

### 2. Konfigurasi Environment Variables
Salin template `.env.example` menjadi `.env.local`:
```bash
cp .env.example .env.local
```
Lalu isi nilainya. Variabel wajib:
```env
# 1. URL Koneksi Supabase Pooler (Gunakan Transaction Pooler port 6543)
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

# 2. Kunci Enkripsi AES-256-GCM (string acak minimal 32 karakter; buat dengan `openssl rand -hex 32`)
ENCRYPTION_KEY=""

# 3. Kunci Rahasia JWT Session Admin (minimal 32 karakter)
JWT_SECRET=""
```
Variabel integrasi WhatsApp/email dan opsi lain (lihat `.env.example`):
`WHATSAPP_API_URL`, `WHATSAPP_DEVICE_ID`, `WHATSAPP_API_USERNAME`, `WHATSAPP_API_PASSWORD`,
`WHATSAPP_WEBHOOK_SECRET`, `GOWA_ALLOWED_HOSTS` (sebaiknya diisi di produksi), `TRUST_PROXY_HEADERS`, `APP_URL`, `CRON_SECRET`
(dipakai untuk `{link}` di pesan otomatis). Konfigurasi SMTP hanya diisi dari halaman admin
(`/admin/email/config`) dan disimpan terenkripsi di tabel `settings`; variabel `SMTP_*` tidak dibaca aplikasi.

### 3. Buat Akun Admin Pertama Kali (Seed CLI)
Jalankan perintah berikut; password diminta lewat prompt tersembunyi (tidak boleh lewat argumen
karena terlihat di `ps` dan riwayat shell):
```bash
npm run db:seed -- <username>
```
Username 3-32 karakter (huruf, angka, `.`, `_`, `-`), password 8-256 karakter. Menjalankan perintah
yang sama untuk username yang sudah ada akan mengganti passwordnya.

---

## 💻 Menjalankan Server Lokal

```bash
# Mode Development
npm run dev

# Build Production
npm run build

# Menjalankan Production Build
npm run start
```
Buka browser di:
- Form Pegawai: `http://localhost:3000`
- Admin Login: `http://localhost:3000/login`
- Dashboard: `http://localhost:3000/admin`
- Kampanye: `http://localhost:3000/admin/campaign`

---

## 🧪 Test & Lint

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # Biome (ESLint tidak dipakai: typescript-eslint belum mendukung TypeScript 7)
npm test            # unit test
```
Test integrasi (`__tests__/integration`) menjalankan SQL dan route sungguhan, jadi butuh Postgres
**kosong khusus test** yang sudah dimigrasi (`drizzle/*.sql`). Tanpa `TEST_DATABASE_URL` test itu dilewati.
Test akan `TRUNCATE` tabel, jadi **jangan arahkan ke database berisi data nyata**:
```bash
TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/portal_test npm test
```

**Stress test + benchmark** (`__tests__/stress`, database test yang sama, `STRESS_SCALE=5` untuk 5x volume):
```bash
TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/portal_test npm run bench
```
Empat skenario, tiap skenario punya kriteria lulus: kirim massal 25 worker (tanpa kirim ganda, kuota pas, tidak ada
yang menggantung di `sending`), badai webhook ack (status tidak mundur, tanpa 5xx), banjir form publik (batas 5/menit
per IP tepat), dan baca data besar (semua baris terbaca sekali, p95 < 1,5 dtk). Angka berasal dari DB lokal dan gateway
palsu, jadi bandingkan antar-run, bukan dengan produksi.

---

## ☁️ Deployment ke Vercel

1. Push repository ini ke GitHub / GitLab.
2. Impor project di **Vercel Dashboard**.
3. Di tab **Environment Variables** Vercel, tambahkan minimal `DATABASE_URL`, `ENCRYPTION_KEY`, `JWT_SECRET`
   (plus variabel WhatsApp bila broadcast dipakai).
4. (Opsional, untuk antrean auto-resume) set `CRON_SECRET`, lalu jadwalkan `GET /api/cron/auto-resume`
   di `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/cron/auto-resume", "schedule": "*/5 * * * *" }] }
   ```
   Jadwal per 5 menit butuh plan **Pro** (plan Hobby hanya mengizinkan cron harian dan menolak deploy
   dengan jadwal lebih sering). Tiap pemanggilan hanya mengirim yang muat dalam satu invokasi
   (jeda 60-120 detik per pesan, maksimum 300 detik), lalu berhenti sendiri; jadwal yang mengulang.
   Pemicu hanya berjalan bila perangkat WhatsApp terhubung dan masih dalam jam kirim (WITA).
5. Klik **Deploy**. Aplikasi langsung live secara serverless dengan performa maksimal!
