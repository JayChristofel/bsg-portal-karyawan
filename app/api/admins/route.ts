import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { admins } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { hashPassword, MAX_PASSWORD_LENGTH } from '@/lib/auth';
import { readJsonObject, parseId } from '@/lib/validate';

// Shared by create and rename so both enforce the same shape.
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
// Names that would make audit entries ambiguous (see PUBLIC_ACTOR in lib/audit).
const RESERVED_USERNAMES = new Set(['public', 'webhook', 'unknown', 'system']);

function usernameProblem(name: string): string | null {
  if (!USERNAME_RE.test(name)) {
    return 'Username hanya boleh huruf, angka, titik, underscore, atau strip (3-32 karakter).';
  }
  if (RESERVED_USERNAMES.has(name.toLowerCase())) return 'Username ini dicadangkan.';
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string; cause?: { code?: string } })?.code === '23505' ||
    (err as { cause?: { code?: string } })?.cause?.code === '23505';
}
import { logAuditForRequest, logAuditThrottled } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await db
      .select({ id: admins.id, username: admins.username, createdAt: admins.createdAt })
      .from(admins)
      .orderBy(desc(admins.createdAt));

    await logAuditThrottled(
      req,
      username,
      'view_admins',
      `Melihat daftar admin (${rows.length} baris)`,
    );

    return NextResponse.json({ admins: rows });
  } catch (error: unknown) {
    console.error('Admins GET error:', error);
    return NextResponse.json({ error: 'Could not load the admin list' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
    }
    const newUsername = body.username.trim();
    const password = body.password;

    if (!newUsername || !password) {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
    }
    const problem = usernameProblem(newUsername);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password minimal 8 karakter.' }, { status: 400 });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Password maksimal ${MAX_PASSWORD_LENGTH} karakter.` }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    // The unique index is the real guard: a check-then-insert would race.
    const [admin] = await db
      .insert(admins)
      .values({ username: newUsername, passwordHash })
      .onConflictDoNothing({ target: admins.username })
      .returning();
    if (!admin) {
      return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
    }

    await logAuditForRequest(
      req,
      username,
      'create_admin',
      `Admin baru "${newUsername}" (ID: ${admin.id})`,
    );

    return NextResponse.json({ admin: { id: admin.id, username: admin.username, createdAt: admin.createdAt } });
  } catch (error: unknown) {
    console.error('Admins POST error:', error);
    return NextResponse.json({ error: 'Could not create the admin' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = parseId(req.nextUrl.searchParams.get('id'));
    if (id === null) {
      return NextResponse.json({ error: 'A valid admin ID is required.' }, { status: 400 });
    }

    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found.' }, { status: 404 });
    }

    if (admin.username === username) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
    }

    await db.delete(admins).where(eq(admins.id, id));

    await logAuditForRequest(
      req,
      username,
      'delete_admin',
      `Admin "${admin.username}" (ID: ${id}) dihapus`,
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Admins DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the admin' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = parseId(req.nextUrl.searchParams.get('id'));
    if (id === null) {
      return NextResponse.json({ error: 'A valid admin ID is required.' }, { status: 400 });
    }

    const body = await readJsonObject(req);
    const newUsername = typeof body?.username === 'string' ? body.username.trim() : '';

    if (!newUsername) {
      return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
    }
    const problem = usernameProblem(newUsername);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    const [target] = await db.select().from(admins).where(eq(admins.id, id));
    if (!target) {
      return NextResponse.json({ error: 'Admin not found.' }, { status: 404 });
    }

    let updated: typeof admins.$inferSelect;
    try {
      [updated] = await db
        .update(admins)
        .set({ username: newUsername })
        .where(eq(admins.id, id))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
      }
      throw err;
    }

    await logAuditForRequest(
      req,
      username,
      'update_admin',
      `Username admin "${target.username}" diubah menjadi "${updated.username}" (ID: ${id})`,
    );

    return NextResponse.json({ admin: { id: updated.id, username: updated.username, createdAt: updated.createdAt } });
  } catch (error: unknown) {
    console.error('Admins PUT error:', error);
    return NextResponse.json({ error: 'Could not update the admin' }, { status: 500 });
  }
}
