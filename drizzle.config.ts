import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read .env.local on its own; without this `db:push` would run
// against an empty URL whenever DATABASE_URL is not already exported in the shell.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
});
