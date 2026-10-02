import { NextRequest, NextResponse } from 'next/server';
import { getAdminUsername } from '@/lib/auth-helper';
import { db } from '@/db';
import { recipients, campaigns } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const username = await getAdminUsername(req);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const format = req.nextUrl.searchParams.get('format') || 'xlsx';
    const campaignId = req.nextUrl.searchParams.get('campaignId');

    const campaignFilter = campaignId ? eq(recipients.campaignId, Number(campaignId)) : undefined;

    const rows = await db
      .select({
        id: recipients.id,
        label: recipients.label,
        phone: recipients.phone,
        cabang: recipients.cabang,
        waStatus: recipients.waStatus,
        waSentAt: recipients.waSentAt,
        waMessageId: recipients.waMessageId,
        campaignId: recipients.campaignId,
        campaignName: campaigns.name,
        isSubmitted: sql<boolean>`EXISTS(SELECT 1 FROM submissions s WHERE s.recipient_id = ${recipients.id})`,
        createdAt: recipients.createdAt,
      })
      .from(recipients)
      .leftJoin(campaigns, eq(recipients.campaignId, campaigns.id))
      .where(campaignFilter);

    if (format === 'csv') {
      const headers = ['ID', 'Nama', 'No. WhatsApp', 'Cabang', 'Status WA', 'Waktu Kirim', 'ID Pesan', 'Kampanye', 'Sudah Isi Form', 'Tanggal Daftar'];
      const csvRows = rows.map((r) => [
        r.id,
        r.label,
        r.phone || '',
        r.cabang || '',
        r.waStatus || 'pending',
        r.waSentAt ? new Date(r.waSentAt).toLocaleString('id-ID') : '',
        r.waMessageId || '',
        r.campaignName || '',
        r.isSubmitted ? 'Ya' : 'Tidak',
        new Date(r.createdAt).toLocaleString('id-ID'),
      ]);

      const csv = [headers, ...csvRows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="export-penerima-${Date.now()}.csv"`,
        },
      });
    }

    const data = rows.map((r) => ({
      ID: r.id,
      Nama: r.label,
      'No. WhatsApp': r.phone || '',
      Cabang: r.cabang || '',
      'Status WA': r.waStatus || 'pending',
      'Waktu Kirim': r.waSentAt ? new Date(r.waSentAt).toLocaleString('id-ID') : '',
      'ID Pesan': r.waMessageId || '',
      Kampanye: r.campaignName || '',
      'Sudah Isi Form': r.isSubmitted ? 'Ya' : 'Tidak',
      'Tanggal Daftar': new Date(r.createdAt).toLocaleString('id-ID'),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Penerima');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="export-penerima-${Date.now()}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Gagal mengekspor data' }, { status: 500 });
  }
}
