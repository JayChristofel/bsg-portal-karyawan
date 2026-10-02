import { customType, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { encrypt, decrypt } from '@/lib/crypto';

// Custom encrypted type: Automatically encrypts on INSERT/UPDATE, decrypts on SELECT
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: string) {
    if (!value) return '';
    return encrypt(value);
  },
  fromDriver(value: string) {
    if (!value) return '';
    return decrypt(value);
  },
});

export const pegawai = pgTable('pegawai', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  name: text('name').notNull(),
  nip: encryptedText('nip').notNull(),
  jabatanSk: encryptedText('jabatan_sk').notNull(),
  jabatanSekarang: encryptedText('jabatan_sekarang').notNull(),
  cabang: encryptedText('cabang').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  deviceType: text('device_type'),
  os: text('os'),
  browser: text('browser'),
  screenResolution: text('screen_resolution'),
  language: text('language'),
  referrer: text('referrer'),
  sessionId: text('session_id'),
  event: text('event').default('submit'),
  timeOnPage: integer('time_on_page').default(0),
  pagePath: text('page_path').default('/'),
  asnIsp: text('asn_isp'),
  approxLocation: text('approx_location'),
  connectionType: text('connection_type'),
});

export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Broadcast recipients — no token, tracks WA delivery via message.ack webhook
export const recipients = pgTable('recipients', {
  id: serial('id').primaryKey(),
  label: text('label').notNull(),                                         // Nama / label pegawai
  phone: text('phone'),                                                   // Nomor WhatsApp
  cabang: text('cabang'),                                                 // Kantor Cabang / Unit Kerja
  message: text('message'),                                               // Pesan yang dikirim
  waMessageId: text('wa_message_id'),                                     // ID pesan dari GOWA
  waStatus: text('wa_status').default('pending'),                        // 'pending' | 'sent' | 'delivered' | 'read'
  waSentAt: timestamp('wa_sent_at', { withTimezone: true }),             // Waktu kirim
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const webhookLogs = pgTable('webhook_logs', {
  id: serial('id').primaryKey(),
  deviceId: text('device_id'),
  event: text('event').notNull(),
  payload: text('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Key-value settings store (e.g. GOWA gateway connection config, editable from admin UI)
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
