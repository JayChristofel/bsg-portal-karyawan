import { db } from './index';
import { sql } from 'drizzle-orm';

async function main() {
  const cols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'settings' ORDER BY ordinal_position
  `);
  console.log('Kolom tabel settings:', JSON.stringify(cols));
  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
