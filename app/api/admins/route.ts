import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { admins } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth';
import { logAudit, logAuditForRequest } from '@/lib/audit';

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

    void logAuditForRequest(
      req,
      username,
      'view_admins',
      `Melihat daftar admin (${rows.length} baris)`,
    );

    return NextResponse.json({ admins: rows });
  } catch (error: any) {
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
    const body = await req.json();
    const newUsername = (body.username || '').trim();
    const password = body.password || '';

    if (!newUsername || !password) {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password minimal 8 karakter.' }, { status: 400 });
    }

    const [existing] = await db.select().from(admins).where(eq(admins.username, newUsername));
    if (existing) {
      return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const [admin] = await db.insert(admins).values({ username: newUsername, passwordHash }).returning();

    await logAuditForRequest(
      req,
      username,
      'create_admin',
      `Admin baru "${newUsername}" (ID: ${admin.id})`,
    );

    return NextResponse.json({ admin: { id: admin.id, username: admin.username, createdAt: admin.createdAt } });
  } catch (error: any) {
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
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ error: 'Admin ID is required.' }, { status: 400 });
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
  } catch (error: any) {
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
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ error: 'Admin ID is required.' }, { status: 400 });
    }

    const body = await req.json();
    const newUsername = (body.username || '').trim();

    if (!newUsername) {
      return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(newUsername)) {
      return NextResponse.json(
        { error: 'Username hanya boleh huruf, angka, titik, underscore, atau strip (3-32 karakter).' },
        { status: 400 }
      );
    }

    const [target] = await db.select().from(admins).where(eq(admins.id, id));
    if (!target) {
      return NextResponse.json({ error: 'Admin not found.' }, { status: 404 });
    }

    const [clash] = await db.select().from(admins).where(eq(admins.username, newUsername));
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
    }

    const [updated] = await db
      .update(admins)
      .set({ username: newUsername })
      .where(eq(admins.id, id))
      .returning();

    void logAuditForRequest(
      req,
      username,
      'update_admin',
      `Username admin "${target.username}" diubah menjadi "${updated.username}" (ID: ${id})`,
    );

    return NextResponse.json({ admin: { id: updated.id, username: updated.username, createdAt: updated.createdAt } });
  } catch (error: any) {
    console.error('Admins PUT error:', error);
    return NextResponse.json({ error: 'Could not update the admin' }, { status: 500 });
  }
}
