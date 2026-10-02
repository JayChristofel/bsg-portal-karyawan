-- ==============================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR PORTAL PEGAWAI
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Table: pegawai (Data Pengkinian Pegawai dengan kolom terenkripsi AES-256-GCM)
CREATE TABLE IF NOT EXISTS pegawai (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    name TEXT NOT NULL,
    nip TEXT NOT NULL,                 -- Terenkripsi AES-256-GCM
    jabatan_sk TEXT NOT NULL,          -- Terenkripsi AES-256-GCM
    jabatan_sekarang TEXT NOT NULL,    -- Terenkripsi AES-256-GCM
    cabang TEXT NOT NULL,              -- Terenkripsi AES-256-GCM
    ip_address TEXT,
    user_agent TEXT,
    token TEXT                         -- Token tracking kampanye (jika ada)
);

CREATE INDEX IF NOT EXISTS idx_pegawai_created_at ON pegawai (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pegawai_token ON pegawai (token);

-- 2. Table: admins (Akun Administrator)
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,       -- Hash PBKDF2-SHA256 (format: salt$digest)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Table: recipients (Penerima Kampanye Security Awareness)
CREATE TABLE IF NOT EXISTS recipients (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Table: settings (Konfigurasi aplikasi yang bisa diubah dari UI admin)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipients_token ON recipients (token);

-- 4. Table: events (Event Tracking: Link Dibuka & Mulai Mengisi)
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL,
    event_type TEXT NOT NULL,          -- 'open' atau 'start'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_token ON events (token);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);
