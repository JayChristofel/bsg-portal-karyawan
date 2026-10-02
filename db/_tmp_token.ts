import { createSessionToken } from '@/lib/session';

async function main() {
  const token = await createSessionToken('admin');
  console.log(token);
  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
