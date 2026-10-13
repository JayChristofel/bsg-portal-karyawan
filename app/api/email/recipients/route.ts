import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/db';
import { emailRecipients } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId') ? Number(searchParams.get('campaignId')) : undefined;

    let query = db.select().from(emailRecipients);

    if (campaignId !== undefined) {
      query = query.where(eq(emailRecipients.campaignId, campaignId));
    }

    const recipients = await query.orderBy(desc(emailRecipients.createdAt));
    return NextResponse.json({ recipients });
  } catch (error: any) {
    console.error('Email recipients GET error:', error);
    return NextResponse.json({ error: 'Could not load recipients' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, email, cabang, campaignId } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'name and email are required.' }, { status: 400 });
    }

    const [recipient] = await db
      .insert(emailRecipients)
      .values({ name, email, cabang, campaignId, status: 'pending' })
      .returning();

    return NextResponse.json({ recipient });
  } catch (error: any) {
    console.error('Email recipients POST error:', error);
    return NextResponse.json({ error: 'Could not create the recipient' }, { status: 500 });
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
      return NextResponse.json({ error: 'Recipient ID is required.' }, { status: 400 });
    }

    const [deleted] = await db
      .delete(emailRecipients)
      .where(eq(emailRecipients.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Recipient not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Email recipients DELETE error:', error);
    return NextResponse.json({ error: 'Could not delete the recipient' }, { status: 500 });
  }
}