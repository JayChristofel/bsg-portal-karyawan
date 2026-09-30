import { loadEnvConfig } from '@next/env';

// Ensure environment variables from .env.local are loaded in standalone scripts
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || '';

// Connection client for Postgres / Supabase Transaction Pooler (port 6543)
const client = postgres(connectionString, {
  prepare: false,
});

export const db = drizzle(client, { schema });
