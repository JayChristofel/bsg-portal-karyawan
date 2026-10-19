import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { messageTemplates } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logAuditForRequest, logAuditThrottled } from '@/lib/audit';
import { readJsonObject, str, parseId } from '@/lib/validate';

const MAX_TEMPLATE_BODY = 4000;

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

    const listActor = await getAdminUsername(req);
    if (listActor) {
      await logAuditThrottled(
        req,
        listActor,
        'view_templates',
        `Melihat daftar template (${templates.length} baris)`,
      );
    }

    return NextResponse.json({ templates });
  } catch (error: unknown) {
    console.error('Templates GET error:', error);
    return NextResponse.json({ error: 'Could not load templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    const name = str(body.name, 200);
    const category = str(body.category, 50) || 'umum';
    const body_ = str(body.body, MAX_TEMPLATE_BODY);

    if (!name || !body_) {
      return NextResponse.json({ error: 'Template name and body are required.' }, { status: 400 });
    }

    const [template] = await db
      .insert(messageTemplates)
      .values({ name, category, body: body_ })
      .returning();

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'save_template',
      `Template "${name}" (ID: ${template.id})`,
    );

    return NextResponse.json({ template });
  } catch (error: unknown) {
    console.error('Templates POST error:', error);
    return NextResponse.json({ error: 'Could not save the template' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    const id = parseId(body.id);
    const name = str(body.name, 200);
    const category = str(body.category, 50) || 'umum';
    const body_ = str(body.body, MAX_TEMPLATE_BODY);

    if (id === null || !name || !body_) {
      return NextResponse.json({ error: 'ID, name, and template body are required.' }, { status: 400 });
    }

    const [template] = await db
      .update(messageTemplates)
      .set({ name, category, body: body_, updatedAt: new Date() })
      .where(eq(messageTemplates.id, id))
      .returning();

    if (!template) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'update_template',
      `Template "${name}" (ID: ${id})`,
    );

    return NextResponse.json({ template });
  } catch (error: unknown) {
    console.error('Templates PUT error:', error);
    return NextResponse.json({ error: 'Could not update the template' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = parseId(req.nextUrl.searchParams.get('id'));
    if (id === null) {
      return NextResponse.json({ error: 'A valid template ID is required.' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(messageTemplates)
      .where(eq(messageTemplates.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    }

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'delete_template',
      `Template "${deleted.name}" (ID: ${id})`,
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Templates DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the template' }, { status: 500 });
  }
}
