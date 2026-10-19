import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { emailTemplates } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logAuditForRequest, logAuditThrottled } from '@/lib/audit';
import { readJsonObject, str, parseId } from '@/lib/validate';

const MAX_HTML = 500_000;
const MAX_TEXT = 100_000;

const longText = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const templates = await db
      .select()
      .from(emailTemplates)
      .orderBy(desc(emailTemplates.createdAt));

    const listActor = await getAdminUsername(req);
    if (listActor) {
      await logAuditThrottled(
        req,
        listActor,
        'view_email_templates',
        `Melihat daftar template email (${templates.length} baris)`,
      );
    }

    return NextResponse.json({ templates });
  } catch (error: any) {
    console.error('Email templates GET error:', error);
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
    const subject = str(body.subject, 300).replace(/[\r\n]+/g, ' ');
    const htmlBody = longText(body.htmlBody, MAX_HTML).trim();
    const textBody = longText(body.textBody, MAX_TEXT);

    if (!name || !htmlBody) {
      return NextResponse.json({ error: 'Template name and HTML body are required.' }, { status: 400 });
    }

    const [template] = await db
      .insert(emailTemplates)
      .values({ name, category, subject, htmlBody, textBody })
      .returning();

    const username = await getAdminUsername(req);
    await logAuditForRequest(
      req,
      username ?? 'unknown',
      'save_template',
      `Template "${name}" (ID: ${template.id})`,
    );

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error('Email templates POST error:', error);
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
    const subject = str(body.subject, 300).replace(/[\r\n]+/g, ' ');
    const htmlBody = longText(body.htmlBody, MAX_HTML).trim();
    // Only touch the plain-text part when the caller sent one; otherwise an edit of the
    // HTML would silently keep (or, before, never update) the text version.
    const textBody = body.textBody === undefined ? undefined : longText(body.textBody, MAX_TEXT);

    if (id === null || !name || !htmlBody) {
      return NextResponse.json({ error: 'ID, name, and HTML body are required.' }, { status: 400 });
    }

    const [template] = await db
      .update(emailTemplates)
      .set({ name, category, subject, htmlBody, ...(textBody !== undefined && { textBody }), updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
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
  } catch (error: any) {
    console.error('Email templates PUT error:', error);
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
      .delete(emailTemplates)
      .where(eq(emailTemplates.id, id))
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
  } catch (error: any) {
    console.error('Email templates DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the template' }, { status: 500 });
  }
}