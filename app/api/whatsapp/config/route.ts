import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getGowaConfig, saveGowaConfig, listDevices, GOWA_CONFIG_KEYS, DEFAULT_GOWA_CONFIG } from '@/lib/whatsapp';
import { db } from '@/db';
import { settings } from '@/db/schema';
import { encrypt, decrypt } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getGowaConfig();
    return NextResponse.json({
      config: {
        baseUrl: config.baseUrl,
        deviceId: config.deviceId,
        username: config.username || '',
        password: config.password || '',
      },
      defaults: {
        baseUrl: DEFAULT_GOWA_CONFIG.baseUrl,
        deviceId: DEFAULT_GOWA_CONFIG.deviceId,
      },
    });
  } catch (error: any) {
    console.error('WA config GET error:', error);
    return NextResponse.json({ error: 'Gagal memuat konfigurasi gateway' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (body.action === 'test') {
      try {
        const config = await getGowaConfig();
        const result = await listDevices(config);
        const authOk = result?.code === 'SUCCESS' || result?.code === 'OK';
        return NextResponse.json({ ...result, authOk });
      } catch (testErr: any) {
        console.error('WA config TEST error:', testErr?.message, '| cause:', testErr?.cause?.code, testErr?.cause?.message);
        return NextResponse.json({
          version: '2.1',
          error: 'Gagal menguji koneksi ke gateway',
          detail: testErr?.message,
          cause: testErr?.cause?.code || testErr?.cause?.message,
        }, { status: 500 });
      }
    }

    const baseUrl = (body.baseUrl || '').trim();
    const deviceId = (body.deviceId || '').trim();
    const username = (body.username || '').trim();
    const password = body.password !== undefined ? String(body.password) : '';

    if (!baseUrl) {
      return NextResponse.json({ error: 'URL gateway wajib diisi.' }, { status: 400 });
    }
    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID wajib diisi.' }, { status: 400 });
    }
    try {
      new URL(baseUrl);
    } catch {
      return NextResponse.json({ error: 'URL gateway tidak valid.' }, { status: 400 });
    }

    await saveGowaConfig({ baseUrl, deviceId, username });

    // Simpan password terenkripsi agar tidak disimpan plaintext
    await db
      .insert(settings)
      .values({ key: GOWA_CONFIG_KEYS.password, value: password ? encrypt(password) : '' })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: password ? encrypt(password) : '', updatedAt: new Date() },
      });

    return NextResponse.json({ version: '2.1', code: 'SUCCESS', message: 'Konfigurasi gateway berhasil disimpan.' });
  } catch (error: any) {
    console.error('WA config POST error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan konfigurasi gateway', detail: error?.message || String(error) }, { status: 500 });
  }
}
