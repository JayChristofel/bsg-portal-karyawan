import { db } from '@/db';
import { auditLog } from '@/db/schema';

export async function logAudit(
  adminUsername: string,
  action: string,
  detail?: string,
  ipAddress?: string,
) {
  try {
    await db.insert(auditLog).values({
      adminUsername,
      action,
      detail: detail || null,
      ipAddress: ipAddress || null,
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
