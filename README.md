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
Buka **Supabase Dashboard** -> **SQL Editor**, lalu jalankan seluruh isi skrip:
```sql
db/schema.sql
```
Skrip ini akan membuat tabel `pegawai`, `admins`, `recipients`, dan `events` beserta index-nya.

### 2. Konfigurasi Environment Variables
Salin template `.env.example` menjadi `.env.local`:
```bash
cp .env.example .env.local
```
Lalu isi nilainya:
```env
# 1. URL Koneksi Supabase Pooler (Gunakan Transaction Pooler port 6543)
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

# 2. Kunci Enkripsi AES-256-GCM (string acak minimal 32 karakter)
ENCRYPTION_KEY="kunci-rahasia-enkripsi-data-sensitif-anda"

# 3. Kunci Rahasia JWT Session Admin
JWT_SECRET="kunci-rahasia-jwt-session-admin"
```

### 3. Buat Akun Admin Pertama Kali (Seed CLI)
Jalankan perintah berikut di terminal (tanpa perlu mencatat password di file `.env`):
```bash
npm run db:seed <username> <password>
```
*Contoh:*
```bash
npm run db:seed admin PasswordSuperAman123!
```

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

## ☁️ Deployment ke Vercel

1. Push repository ini ke GitHub / GitLab.
2. Impor project di **Vercel Dashboard**.
3. Di tab **Environment Variables** Vercel, tambahkan 3 variabel berikut:
   - `DATABASE_URL`
   - `ENCRYPTION_KEY`
   - `JWT_SECRET`
4. Klik **Deploy**. Aplikasi langsung live secara serverless dengan performa maksimal!
