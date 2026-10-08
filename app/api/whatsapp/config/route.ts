import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getGowaConfig, saveGowaConfig, listDevices, validateGatewayUrl, GOWA_CONFIG_KEYS, DEFAULT_GOWA_CONFIG } from '@/lib/whatsapp';
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
    // Never return the gateway password in plaintext — only whether one is set.
    return NextResponse.json({
      config: {
        baseUrl: config.baseUrl,
        deviceId: config.deviceId,
        username: config.username || '',
        hasPassword: Boolean(config.password),
        password: '',
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
    if (/[\s/\\]/.test(deviceId)) {
      return NextResponse.json({ error: 'Device ID tidak boleh mengandung spasi, "/" atau "\\".' }, { status: 400 });
    }

    // SSRF guard: the gateway URL is a server-side fetch target.
    const validated = validateGatewayUrl(baseUrl);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    await saveGowaConfig({ baseUrl: validated.url, deviceId, username });

    // Simpan password terenkripsi agar tidak disimpan plaintext.
    // Kosongkan field password bila tidak dikirim, agar tidak menimpa nilai lama.
    if (password) {
      await db
        .insert(settings)
        .values({ key: GOWA_CONFIG_KEYS.password, value: encrypt(password) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: encrypt(password), updatedAt: new Date() },
        });
    }

    return NextResponse.json({ version: '2.1', code: 'SUCCESS', message: 'Konfigurasi gateway berhasil disimpan.' });
  } catch (error: any) {
    console.error('WA config POST error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan konfigurasi gateway', detail: error?.message || String(error) }, { status: 500 });
  }
}
