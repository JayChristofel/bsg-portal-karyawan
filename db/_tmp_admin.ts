import { db } from './index';
import { admins } from './schema';

async function main() {
  const rows = await db.select({ id: admins.id, username: admins.username }).from(admins);
  console.log('Admins:', JSON.stringify(rows));
  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
