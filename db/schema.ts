import {
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { encrypt, safeDecrypt, DECRYPT_FAILED } from '@/lib/crypto';

// Custom encrypted type: Automatically encrypts on INSERT/UPDATE, decrypts on SELECT
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: string) {
    if (!value) return '';
    // A placeholder from a failed read must never overwrite the real ciphertext.
    if (value === DECRYPT_FAILED) {
      throw new Error('Refusing to persist the decrypt-failure placeholder.');
    }
    return encrypt(value);
  },
  fromDriver(value: string) {
    if (!value) return '';
    return safeDecrypt(value);
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
  campaignId: integer('campaign_id'),                                    // FK ke campaigns (null = broadcast ad-hoc)
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

// Message templates library (reusable WA message templates with spintax support)
export const messageTemplates = pgTable('message_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').default('umum'),
  body: text('body').notNull(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Campaigns — groups of recipients with a template, schedule, and send status
export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').default('draft'), // 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
  templateId: integer('template_id'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Audit log — tracks admin actions for security and accountability
export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    adminUsername: text('admin_username').notNull(),
    action: text('action').notNull(), // 'login' | 'send_message' | 'save_template' | 'create_campaign' | etc.
    detail: text('detail'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The audit page sorts newest-first and filters by admin. With read
    // polling logged every 8s this table grows by thousands of rows a day, so
    // both queries need index support or the page degrades over time.
    index('audit_log_created_at_idx').on(t.createdAt),
    index('audit_log_admin_username_idx').on(t.adminUsername),
  ],
);

// Recipient status history — timeline of status transitions for real-time tracking
export const recipientStatusHistory = pgTable('recipient_status_history', {
  id: serial('id').primaryKey(),
  recipientId: integer('recipient_id').notNull(),
  status: text('status').notNull(), // 'pending' | 'sent' | 'delivered' | 'read'
  messageId: text('message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Email Recipients — penerima email untuk campaign
export const emailRecipients = pgTable('email_recipients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  cabang: text('cabang'),
  campaignId: integer('campaign_id'),
  status: text('status').default('pending'), // pending|sent|delivered|bounced|failed
  messageId: text('message_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Email Campaigns — kampanye email
export const emailCampaigns = pgTable('email_campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  status: text('status').default('draft'), // draft|scheduled|sending|sent|cancelled
  templateId: integer('template_id'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  totalRecipients: integer('total_recipients').default(0),
  sentCount: integer('sent_count').default(0),
  failCount: integer('fail_count').default(0),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Email Templates — library template email (HTML + text)
export const emailTemplates = pgTable('email_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').default('umum'),
  subject: text('subject').notNull(),
  htmlBody: text('html_body').notNull(),
  textBody: text('text_body'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Email Delivery Logs — tracking pengiriman
export const emailLogs = pgTable('email_logs', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id'),
  recipientId: integer('recipient_id'),
  event: text('event').notNull(), // sent|delivered|opened|clicked|bounced
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Auto-resume runs — one row per background drain of the pending queue.
//
// Auto-resume sends from the business number with no browser attached, so its
// progress has to be inspectable from the admin UI. Without a row here the
// operator cannot tell whether messages are still going out.
export const autoResumeRuns = pgTable('auto_resume_runs', {
  id: serial('id').primaryKey(),
  status: text('status').notNull().default('running'), // running | completed | stopped | error
  trigger: text('trigger').default('reconnect'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  // Bumped on every send; a 'running' row with an old heartbeat belongs to a dead worker.
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).defaultNow().notNull(),
  messagesSent: integer('messages_sent').default(0),
  queuedRemaining: integer('queued_remaining').default(0),
  stopReason: text('stop_reason'), // quota | time_window | empty | device_error | cancelled
  detail: text('detail'),
  createdBy: text('created_by'),
});

// Broadcast Session State — batch progress tracking
export const broadcastSessions = pgTable('broadcast_sessions', {
  id: serial('id').primaryKey(),
  channel: text('channel').notNull(), // 'whatsapp' | 'email'
  totalTargets: integer('total_targets').notNull(),
  totalSent: integer('total_sent').default(0),
  batchSent: integer('batch_sent').default(0),
  currentBatch: integer('current_batch').default(1),
  totalBatches: integer('total_batches').default(1),
  isOnBreak: boolean('is_on_break').default(false),
  breakEndTime: timestamp('break_end_time', { withTimezone: true }),
  isOutsideTimeWindow: boolean('is_outside_time_window').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Sending-number warm-up registry. One row per number that sends through the
// gateway; `pairedAt` is when it was first seen, which anchors the age ladder.
export const warmupNumbers = pgTable('warmup_numbers', {
  numberId: text('number_id').primaryKey(),
  label: text('label'),
  pairedAt: timestamp('paired_at', { withTimezone: true }).defaultNow().notNull(),
  dailyLimitOverride: integer('daily_limit_override'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Per-day send counters. Composite primary key makes the daily roll-over
// implicit: a new UTC day is simply a new row.
export const sendCounters = pgTable(
  'send_counters',
  {
    numberId: text('number_id').notNull(),
    day: text('day').notNull(), // YYYY-MM-DD (UTC)
    sent: integer('sent').default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.numberId, t.day] })],
);

// Fixed-window counters for rate limiting. Lives in the database because on
// Vercel each request may hit a different instance, so memory is not shared.
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
  count: integer('count').notNull().default(0),
});
