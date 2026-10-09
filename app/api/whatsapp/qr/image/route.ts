import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getGowaConfig, validateGatewayUrl } from '@/lib/whatsapp';
import { gatewayFetch } from '@/lib/gowa-tls';
import { getAdminUsername } from '@/lib/auth-helper';
import { logAuditForRequest } from '@/lib/audit';

/**
 * Streams the pairing QR image through the app.
 *
 * The browser cannot load GOWA's qr_link directly: the gateway sits behind
 * nginx with HTTP Basic Auth, which an <img> tag cannot supply. Proxying keeps
 * the request same-origin with the admin session and lets the server attach
 * credentials.
 *
 * `src` is fully user-supplied, so it is constrained to the configured gateway
 * origin (plus an explicit allowlist) and re-checked for private ranges.
 * Without those checks this endpoint would be an open proxy for any admin.
 */

export function isAllowedQrHost(hostname: string, gatewayHost: string): boolean {
  const host = hostname.toLowerCase();
  if (host === gatewayHost) return true;

  const extra = (process.env.GOWA_QR_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return extra.includes(host);
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const src = req.nextUrl.searchParams.get('src');
  if (!src) {
    return NextResponse.json({ error: 'Missing src parameter.' }, { status: 400 });
  }

  let target: URL;
  const actor = (await getAdminUsername(req)) || 'unknown';

  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ error: 'Malformed QR image URL.' }, { status: 400 });
  }

  // Reuse the outbound guard so a crafted src cannot reach loopback,
  // link-local, or cloud-metadata addresses.
  const validated = validateGatewayUrl(target.toString());
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const config = await getGowaConfig();
  const gatewayHost = new URL(config.baseUrl).hostname.toLowerCase();

  if (!isAllowedQrHost(target.hostname, gatewayHost)) {
    return NextResponse.json(
      { error: 'QR image host is not the configured gateway host. Add it to GOWA_QR_ALLOWED_HOSTS if intended.' },
      { status: 400 },
    );
  }

  const headers: Record<string, string> = { Accept: 'image/*' };
  if (config.username || config.password) {
    headers.Authorization =
      'Basic ' + Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64');
  }

  try {
    const upstream = await gatewayFetch(target.toString(), { headers });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Gateway returned ${upstream.status} for the QR image.` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Gateway did not return an image.' },
        { status: 502 },
      );
    }

    void logAuditForRequest(req, actor, 'view_qr_image', 'Mengambil gambar QR pairing dari gateway');

    return new NextResponse(upstream.body as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // QR codes rotate; never let a stale one be cached.
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: any) {
    console.error('WA QR image proxy error:', err?.message, '| cause:', err?.cause?.code);
    return NextResponse.json(
      { error: 'Could not load the QR image from the gateway.' },
      { status: 502 },
    );
  }
}