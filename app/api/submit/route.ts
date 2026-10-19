import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import { logAudit, PUBLIC_ACTOR } from '@/lib/audit';
import {
  getClientIp,
  getUserAgent,
  parseUserAgent,
  getApproxLocation,
  getAsnIsp,
  checkIpRateLimit,
} from '@/lib/proxy';
import { readJsonObject, str, boundedInt } from '@/lib/validate';

// Funnel stages the public page may report; anything else is stored as 'submit'.
const ALLOWED_EVENTS = new Set(['open', 'start', 'submit']);

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const userAgent = getUserAgent(req).slice(0, 500);

  // Rate limit: max 5 requests per 60s per IP
  const rateLimit = await checkIpRateLimit('submit', clientIp, 60, 5);
  if (rateLimit.limited) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Request body must be a JSON object.' },
        { status: 400 }
      );
    }

    const name = str(body.name, 200);
    const nip = str(body.nip ?? body.nik, 50);
    const jabatanSk = str(body.jabatan_sk ?? body.jabatanSk, 200);
    const jabatanSekarang = str(body.jabatan_sekarang ?? body.jabatanSekarang, 200);
    const cabang = str(body.cabang, 200);

    if (!name || !nip || !jabatanSk || !jabatanSekarang || !cabang) {
      return NextResponse.json(
        { success: false, error: 'Semua kolom wajib diisi.' },
        { status: 400 }
      );
    }

    // Telemetry. Device, OS, browser, location and network come from the request
    // itself (User-Agent / CDN headers): a client-supplied value there is just a
    // forged one. Only what the browser alone can know is taken from the body.
    const parsedUa = parseUserAgent(userAgent);

    const deviceType = parsedUa.deviceType;
    const os = parsedUa.os;
    const browser = parsedUa.browser;
    const approxLocation = getApproxLocation(req).slice(0, 150);
    const asnIsp = getAsnIsp(req).slice(0, 150);

    const screenResolution = str(body.screen_resolution, 50) || '-';
    const language = str(body.language, 30) || '-';
    const referrer = (str(body.referrer, 255) || req.headers.get('referer') || 'Direct').slice(0, 255);
    const sessionId = str(body.session_id, 100) || null;
    const rawEvent = str(body.event, 50);
    const event = ALLOWED_EVENTS.has(rawEvent) ? rawEvent : 'submit';
    const timeOnPage = boundedInt(body.time_on_page, 0, 86_400, 0); // seconds, max one day
    const pagePath = str(body.page_path, 100) || '/';
    const connectionType = str(body.connection_type, 50) || '-';

    // Insert record with AES-256-GCM encryption on sensitive columns handled by customType
    const [created] = await db.insert(pegawai).values({
      name,
      nip,
      jabatanSk,
      jabatanSekarang,
      cabang,
      ipAddress: clientIp,
      userAgent: userAgent,
      deviceType,
      os,
      browser,
      screenResolution,
      language,
      referrer,
      sessionId,
      event,
      timeOnPage,
      pagePath,
      asnIsp,
      approxLocation,
      connectionType,
    })
    .returning({ id: pegawai.id });

    // The public form has no admin session, so the actor is the literal
    // 'public'. The record id correlates this entry with the employee row; the
    // NIP itself stays out of the plaintext audit log.
    await logAudit(
      PUBLIC_ACTOR,
      'public_submit',
      `Form jabatan diisi — ID: ${created?.id ?? '-'}, cabang: ${cabang}, event: ${event}`,
      getClientIp(req),
    );

    return NextResponse.json({ success: true, message: 'Data recorded' });
  } catch (error: unknown) {
    console.error('Submit error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not save the record to the database.' },
      { status: 500 }
    );
  }
}
