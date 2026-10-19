import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pegawai } from '@/db/schema';
import { desc, lt } from 'drizzle-orm';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest, logAuditThrottled } from '@/lib/audit';
import { readJsonObject, str, parsePageParams } from '@/lib/validate';
import { APP_TZ } from '@/lib/time';

export async function GET(req: NextRequest) {
  const actor = await getAdminUsername(req);
  if (!actor) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const { limit, before } = parsePageParams(req.nextUrl.searchParams);
    // One extra row tells whether another page exists.
    const fetched = await db
      .select()
      .from(pegawai)
      .where(before === null ? undefined : lt(pegawai.id, before))
      .orderBy(desc(pegawai.id))
      .limit(limit + 1);
    const rows = fetched.slice(0, limit);
    const nextBefore = fetched.length > limit ? rows[rows.length - 1].id : null;

    if (before === null) {
      await logAuditThrottled(req, actor, 'view_employees', 'Melihat daftar data pegawai');
    }

    return NextResponse.json({
      nextBefore,
      rows: rows.map((r) => ({
        id: r.id,
        created_at: r.createdAt
          ? new Date(r.createdAt).toLocaleString('id-ID', { timeZone: APP_TZ }) + ' WITA'
          : '-',
        created_at_raw: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        name: r.name,
        nip: r.nip,
        jabatan_sk: r.jabatanSk,
        jabatan_sekarang: r.jabatanSekarang,
        cabang: r.cabang,
        ip_address: r.ipAddress,
        user_agent: r.userAgent,
        // Missing telemetry is shown as missing, never invented.
        device_type: r.deviceType || '-',
        os: r.os || '-',
        browser: r.browser || '-',
        screen_resolution: r.screenResolution || '-',
        language: r.language || '-',
        referrer: r.referrer || '-',
        session_id: r.sessionId || '-',
        event: r.event || 'submit',
        time_on_page: r.timeOnPage ?? 0,
        page_path: r.pagePath || '/',
        asn_isp: r.asnIsp || '-',
        approx_location: r.approxLocation || '-',
        connection_type: r.connectionType || '-',
      })),
    });
  } catch (error: unknown) {
    console.error('Fetch employee records error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not read data from the database.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const actor = await getAdminUsername(req);
  if (!actor) {
    return NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    const name = str(body.name, 200);
    const nip = str(body.nip ?? body.nik, 50);
    const jabatanSk = str(body.jabatan_sk ?? body.jabatanSk, 200);
    const jabatanSekarang = str(body.jabatan_sekarang ?? body.jabatanSekarang, 200);
    const cabang = str(body.cabang, 200);

    if (!name || !nip || !jabatanSk || !jabatanSekarang || !cabang) {
      return NextResponse.json(
        { success: false, error: 'All fields are required.' },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(pegawai)
      .values({
        name,
        nip,
        jabatanSk,
        jabatanSekarang,
        cabang,
        ipAddress: '-',
        userAgent: `Admin manual (${actor})`,
        deviceType: 'Desktop (Admin)',
        os: 'Admin Console',
        browser: 'Admin Console',
        screenResolution: '-',
        language: 'id-ID',
        referrer: 'Admin Portal',
        event: 'manual_entry',
        timeOnPage: 0,
        pagePath: '/admin/pegawai',
        asnIsp: 'Internal Network',
        approxLocation: 'Kantor Pusat Bank SulutGo',
        connectionType: 'LAN / Corporate',
      })
      .returning();

    await logAuditForRequest(
      req,
      actor,
      'create_employee',
      `Data pegawai "${name}" (ID: ${created?.id ?? '-'}) ditambahkan manual`,
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Manual insert error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not add the record to the database.' },
      { status: 500 }
    );
  }
}
