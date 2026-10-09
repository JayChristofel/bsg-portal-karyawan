import { loadEnvConfig } from '@next/env';

// Ensure environment variables from .env.local are loaded in standalone scripts
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || '';

// Supabase's pooler refuses plaintext connections ("SSL connection is
// required"), but its connection string does not always carry sslmode. Resolve
// it here instead of relying on every environment remembering to add it; a
// local socket-based Postgres still opts out via sslmode=disable.
function resolveSsl(url: string): boolean | 'require' | undefined {
  const sslmode = url.match(/[?&]sslmode=([^&]+)/)?.[1];
  if (sslmode === 'disable' || sslmode === 'allow') return false;
  if (sslmode === 'verify-ca' || sslmode === 'verify-full' || sslmode === 'require') return 'require';
  if (url.includes('sslmode=')) return undefined;

  const host = url.match(/@([^:/?]+)/)?.[1] ?? '';
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  return isLocal ? false : 'require';
}

// Connection client for Postgres / Supabase Transaction Pooler (port 6543)
const client = postgres(connectionString, {
  prepare: false,
  ssl: resolveSsl(connectionString),
});

export const db = drizzle(client, { schema });
