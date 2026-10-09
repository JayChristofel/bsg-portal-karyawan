# Roadmap Modul Admin

Dokumen internal — bahasa Indonesia, istilah teknis dalam English.
Internal document — Indonesian prose, English technical terms.

---

## 1. Modul yang Sudah Ada

| Route | Nama | Fungsi |
|---|---|---|
| `/admin` | Overview | Metrik kampanye, tren read rate, submit rate |
| `/admin/pegawai` | Employees | Data pegawai + audit lingkungan |
| `/admin/campaign` | Mass Messaging | Terima pesan massal via WhatsApp |
| `/admin/campaigns` | Campaigns | Kelola kampanye terjadwal |
| `/admin/templates` | Message Templates | Pustaka template pesan |
| `/admin/tracking` | Delivery Tracking | Status pengiriman real-time |
| `/admin/whatsapp` | WhatsApp Gateway | Konfigurasi koneksi GOWA |
| `/admin/admins` | Admin Accounts | Kelola akun administrator |
| `/admin/audit` | Audit Log | Jejak aktivitas administrator |

**Tabel database:** `pegawai`, `recipients`, `campaigns`, `messageTemplates`,
`recipientStatusHistory`, `webhookLogs`, `auditLog`, `admins`, `settings`.

---

## 2. Celah Fungsional yang Teridentifikasi

### 2.1 Campaign dan Recipient belum terhubung

`recipients.campaignId` ada di schema, dan `POST /api/campaigns/[id]/recipients`
sudah ada di server — tapi **tidak ada halaman yang memanggilnya**. Akibatnya:

- Modul Campaigns bisa membuat kampanye, tapi tidak bisa menempelkan penerima
- Kolom `campaignId` praktis selalu `NULL`
- Mass Messaging mengirim ad-hoc, terpisah dari konsep campaign

**Status:** endpoint siap, UI belum ada.

### 2.2 Tidak ada alur review / verification

Tabel `pegawai` tidak punya kolom `status`. Form yang diisi pegawai langsung
**diterima** ke database tanpa diverifikasi siapa pun. Tidak ada
`pending` / `approved` / `rejected` dengan alasan.

Seluruh premis project ini adalah koreksi data jabatan, tapi tidak ada mekanisme
untuk memastikan data yang masuk benar. Beban trust diletakkan pada pegawai.

### 2.3 Edit/hapus data pegawai tidak tercatat

`app/api/pegawai/[id]/route.ts` handler `PUT` dan `DELETE` **tidak memanggil
`logAudit` sama sekali**. Admin bisa menimpa jabatan atau menghapus record secara
permanen tanpa jejak siapa, kapan, dari mana.

**Status:** sudah ditangani (lihat §4, Audit logging).

### 2.4 Tidak ada deduplikasi NIP

`app/api/submit/route.ts` hanya `insert`, tanpa query kecocokan. Satu pegawai
bisa submit berkali-kali; untuk update harus delete record lama secara manual.

### 2.5 Delete permanen, tidak ada undo

Tidak ada `deletedAt` atau arsip. Salah klik = hilang.

### 2.6 Tidak ada role-based access control

Tabel `admins` hanya berisi `id`, `username`, `passwordHash`, `createdAt`.
Tidak ada role. Siapa pun yang login punya akses penuh, termasuk konfigurasi
gateway dan halaman kelola admin.

### 2.7 Telemetri dikumpulkan tapi tidak dianalisis

Setiap submission menyimpan 21 field. Yang **tidak** muncul sebagai agregasi
di mana pun:

```
device_type · screen_resolution · session_id · time_on_page
asn_isp · approx_location · connection_type · referrer
```

Semuanya hanya terlihat per-row di modal detail. Berguna untuk deteksi anomali:
banyak akun dari IP sama, lokasi tak wajar, pengisian di luar jam kerja.

---

## 3. Usulan Fitur

### Batch A — Correctness (prioritas tertinggi)

| Fitur | Alasan |
|---|---|
| Alur review (`pending`/`approved`/`rejected` + alasan) | Tanpa ini semua data hasil campaigning tidak terverifikasi |
| Audit trail untuk seluruh CRUD | Sudah dikerjakan — lihat §4 |
| Soft delete + restore | Menghilangkan risiko salah hapus |
| Deduplikasi NIP | Mencegah record bertumpuk |
| Riwayat perubahan per pegawai | Siapa mengubah jabatan dari A ke B, kapan |

Batch A1 dan A2 sebaiknya jadi satu paket — kalau ada review tapi edit-nya
tidak tercatat, reviewnya tidak bisa dipercaya.

### Batch B — Efisiensi Kerja

| Fitur | Alasan |
|---|---|
| Bulk review | Review ratusan pegawai satu-satu tidak realistis |
| Filter "perlu perhatian" | NIP tidak cocok MASTER, jabatan SK ≠ jabatan sekarang, duplikat |
| Simpan filter | Admin sering pakai kombinasi yang sama |
| Import master pegawai dari HRIS | Menghemat entry manual |
| Batch edit cabang | Sudah ada di Mass Messaging, belum di Employees |

### Batch C — Analytics & Reporting

| Fitur | Data pendukung |
|---|---|
| Peringatan anomali | Banyak akun dari IP/sesi sama, lokasi tak wajar |
| Statistik perangkat/lokasi | `device_type`, `asn_isp`, `approx_location` sudah ada |
| Grafik waktu pengisian | Melihat kapan pegawai mengisi |
| Dashboard date range | Dashboard sekarang tidak punya filter periode |
| Laporan PDF | Untuk keperluan audit/tata kelola |

### Batch D — Operasional

| Fitur | Alasan |
|---|---|
| Lampirkan penerima ke campaign | Endpoint sudah ada, UI belum |
| Campaign berulang | Jadwal mingguan otomatis |
| A/B test template | Uji mana yang lebih tinggi read rate |
| Notifikasi gateway down | Kalau gateway mati tidak ada yang tahu |
| Template approval | Hindari template salah terkirim ke seluruh bank |
| Role & permission | Semua admin sekarang punya akses penuh |

---

## 4. Status Implementasi Terakhir

### Audit logging — selesai

Semua endpoint yang ada di `app/api/` sekarang menulis ke `auditLog`:

| Kelompok | Action |
|---|---|
| Autentikasi | `login`, `login_failed`, `logout` |
| Admin | `create_admin`, `update_admin`, `delete_admin`, `view_admins`, `view_admin_activity` |
| Data pegawai | `create_employee`, `update_employee`, `delete_employee`, `public_submit` |
| Broadcast | `import_recipients`, `update_recipient`, `delete_recipient`, `view_recipients`, `view_delivery_history` |
| Kampanye | `create_campaign`, `update_campaign`, `delete_campaign`, `assign_recipients`, `send_campaign`, `send_message`, `view_campaigns`, `view_tracking` |
| Template | `save_template`, `update_template`, `delete_template`, `view_templates` |
| Gateway | `view_gateway_config`, `update_gateway_config`, `view_gateway_status`, `request_qr`, `view_qr_image`, `view_webhook_config`, `update_webhook_config` |
| Ekspor | `export_recipients`, `export_employee_records` |
| Audit | `view_audit_log` |
| Keamanan | `webhook_invalid_signature` |

Aturan yang berlaku:

- **Read ikut tercatat**, termasuk polling. Ini keputusan sadar, bukan
  kelalaian — memang ada biaya.
- Detail `update_employee` memuat seluruh field lama → baru: `name`, `nip`,
  `jabatanSk`, `jabatanSekarang`, `cabang` (lihat `describeChanges`).
- IP diambil dari request lewat `getClientIp(req)`; header proxy hanya dipercaya
  bila `TRUST_PROXY_HEADERS=1`.
- `view_*` untuk admin memakai actor dari session cookie; `public_submit`
  memakai `PUBLIC_ACTOR`, dan `webhook_invalid_signature` memakai `webhook`.
- Nilai rahasia tidak masuk log: konfigurasi gateway hanya mencatat
  "password diperbarui / tidak berubah".

**Volume note:** polling 8 detik + seluruh read tercatat = ribuan baris per
hari. `auditLog` sudah di-index pada `createdAt`, `(adminUsername, createdAt
DESC)`, dan `action`; `/api/audit` memakai server-side pagination, sorting, dan
filter (`page`, `pageSize`, `sort`, `dir`, `admin`, `action`, `search`, `from`,
`to`). Facet dropdown diambil dari seluruh tabel, bukan hanya halaman aktif.
Tidak ada auto-purge — seluruh log disimpan.

Label English di `ACTION_LABEL`/`ACTION_STYLE` pada `app/admin/audit/page.tsx`
adalah sumber kebenaran untuk tampilan. Detail di dalam `detail` masih
mengikuti bahasa saat event dicatat (campuran Indonesia/English).

### Admin Accounts — selesai

`/admin/admins` memakai tabel dengan aksi View / Edit / Delete:

- `PUT /api/admins?id=N` untuk update username (password tidak diubah, tidak ada
  reset password).
- `GET /api/admins/[id]/activity` untuk riwayat aktivitas sebuah akun.
- Delete wajib mengetik username konfirmasi lewat `AlertDialog`; akun yang
  sedang dipakai tidak bisa dihapus (dibatasi API, bukan hanya UI).
- Akun yang sedang login diberi badge "You" dari `GET /api/auth/me`.

**Catatan:** riwayat aktivitas dicocokkan ke username saat ini. Kalau sebuah
akun di-rename, baris lama tetap memakai username sebelumnya dan hanya terlihat
di halaman Audit Log utama — mengikuti akun secara tahan rename perlu kolom
`adminId` di `auditLog`.

## 5. Catatan Teknis

### Gateway TLS

Gateway GOWA memakai sertifikat self-signed di belakang nginx. `lib/gowa-tls.ts`
menangani trust dengan CA-pinning via `undici.Agent`, scoped hanya ke gateway —
verifikasi TLS untuk host lain (Supabase, webhook) tetap aktif.

**Preflight Tailwind sengaja dimatikan di public portal.** Preflight mengeset
`line-height: 1.5` pada `html`, sedangkan desain portal dibangun di atas default
`normal`. Mengaktifkannya mengubah tinggi setiap line box — diukur tombol jadi
46px vs 40px. Yang di-import hanya `theme.css` dan `utilities.css`.

Verifikasi migrasi portal ke Tailwind dilakukan lewat screenshot per-viewport
dan perbandingan piksel: 0.0000% berbeda di mobile, tablet, dan desktop.

### Password admin

PBKDF2-SHA256 dengan `salt$digest` (`lib/auth.ts`). Reset password individual
belum tersedia — akun dihapus lalu dibuat ulang.