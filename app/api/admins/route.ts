import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { admins } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

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
      return NextResponse.json({ error: 'Username dan password wajib diisi.' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password minimal 8 karakter.' }, { status: 400 });
    }

    const [existing] = await db.select().from(admins).where(eq(admins.username, newUsername));
    if (existing) {
      return NextResponse.json({ error: 'Username sudah digunakan.' }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const [admin] = await db.insert(admins).values({ username: newUsername, passwordHash }).returning();

    await logAudit(username, 'create_admin', `Admin baru "${newUsername}" (ID: ${admin.id})`);

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
      return NextResponse.json({ error: 'ID admin wajib diisi.' }, { status: 400 });
    }

    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found.' }, { status: 404 });
    }

    if (admin.username === username) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
    }

    await db.delete(admins).where(eq(admins.id, id));

    await logAudit(username, 'delete_admin', `Admin "${admin.username}" (ID: ${id}) dihapus`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Admins DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the admin' }, { status: 500 });
  }
}
