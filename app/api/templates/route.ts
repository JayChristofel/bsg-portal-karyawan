import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { messageTemplates } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const templates = await db
      .select()
      .from(messageTemplates)
      .orderBy(desc(messageTemplates.updatedAt));
    return NextResponse.json({ templates });
  } catch (error: any) {
    console.error('Templates GET error:', error);
    return NextResponse.json({ error: 'Gagal memuat template' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = (body.name || '').trim();
    const category = (body.category || 'umum').trim();
    const body_ = (body.body || '').trim();

    if (!name || !body_) {
      return NextResponse.json({ error: 'Nama dan isi template wajib diisi.' }, { status: 400 });
    }

    const [template] = await db
      .insert(messageTemplates)
      .values({ name, category, body: body_ })
      .returning();

    const username = await getAdminUsername(req);
    await logAudit(username || 'unknown', 'save_template', `Template "${name}" (ID: ${template.id})`);

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error('Templates POST error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan template' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = Number(body.id);
    const name = (body.name || '').trim();
    const category = (body.category || 'umum').trim();
    const body_ = (body.body || '').trim();

    if (!id || !name || !body_) {
      return NextResponse.json({ error: 'ID, nama, dan isi template wajib diisi.' }, { status: 400 });
    }

    const [template] = await db
      .update(messageTemplates)
      .set({ name, category, body: body_, updatedAt: new Date() })
      .where(eq(messageTemplates.id, id))
      .returning();

    if (!template) {
      return NextResponse.json({ error: 'Template tidak ditemukan.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAudit(username || 'unknown', 'update_template', `Template "${name}" (ID: ${id})`);

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error('Templates PUT error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui template' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!id) {
      return NextResponse.json({ error: 'ID template wajib diisi.' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(messageTemplates)
      .where(eq(messageTemplates.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Template tidak ditemukan.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAudit(username || 'unknown', 'delete_template', `Template "${deleted.name}" (ID: ${id})`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Templates DELETE error:', error);
    return NextResponse.json({ error: 'Gagal menghapus template' }, { status: 500 });
  }
}
