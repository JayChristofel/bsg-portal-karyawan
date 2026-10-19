import { loadEnvConfig } from '@next/env';

// Ensure environment variables from .env.local are loaded in standalone scripts
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  // Do not hand postgres('') to the driver: an empty URL silently falls back to
  // localhost:5432 and could connect to an unrelated local database.
  console.error('[db] DATABASE_URL is not set; every query will fail until it is configured.');
}

let warnedUnverified = false;

// Supabase's pooler refuses plaintext connections ("SSL connection is
// required"), but its connection string does not always carry sslmode. Resolve
// it here instead of relying on every environment remembering to add it; a
// local socket-based Postgres still opts out via sslmode=disable.
//
// Certificate verification is opt-in via DATABASE_SSL_CA (PEM of the server's CA):
// the Supabase pooler certificate is not in Node's default trust store, so turning
// verification on unconditionally would break existing deployments. Without it,
// `verify-ca` / `verify-full` are treated as `require` -- encrypted, NOT verified --
// and a warning says so instead of pretending otherwise.
function resolveSsl(url: string): boolean | 'require' | { ca: string; rejectUnauthorized: true } | undefined {
  const sslmode = url.match(/[?&]sslmode=([^&]+)/)?.[1];
  if (sslmode === 'disable' || sslmode === 'allow') return false;

  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n');
  if (ca) return { ca, rejectUnauthorized: true };

  if (sslmode === 'verify-ca' || sslmode === 'verify-full') {
    if (!warnedUnverified) {
      warnedUnverified = true;
      console.warn(
        `[db] sslmode=${sslmode} requested but DATABASE_SSL_CA is not set: the connection ` +
          'is encrypted but the server certificate is NOT verified.',
      );
    }
    return 'require';
  }
  if (sslmode === 'require') return 'require';
  if (url.includes('sslmode=')) return undefined;

  const host = url.match(/@([^:/?]+)/)?.[1] ?? '';
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  return isLocal ? false : 'require';
}

// Connection client for Postgres / Supabase Transaction Pooler (port 6543).
// Cached on globalThis so dev hot reloads do not open a new pool per reload.
const globalForDb = globalThis as unknown as { __pgClient?: ReturnType<typeof postgres> };

const client =
  globalForDb.__pgClient ??
  postgres(connectionString || 'postgres://missing-database-url.invalid/db', {
    prepare: false,
    ssl: resolveSsl(connectionString),
    // Each serverless instance holds its own pool; keep it small so many
    // instances cannot exhaust the pooler.
    max: process.env.VERCEL === '1' ? 5 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });
