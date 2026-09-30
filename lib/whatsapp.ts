const GOWA_BASE_URL = process.env.WHATSAPP_API_URL || 'https://wa-gowa.samrifa.com';
const DEVICE_ID = process.env.WHATSAPP_DEVICE_ID || 'portal-pegawai';

async function gowaFetch(path: string, options: RequestInit = {}) {
  const url = `${GOWA_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': DEVICE_ID,
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  return res.json();
}

export async function getDeviceStatus() {
  return gowaFetch(`/devices/${DEVICE_ID}/status`);
}

export async function listDevices() {
  return gowaFetch('/devices', { headers: {} }); // no X-Device-Id needed
}

export async function getQRCode(): Promise<{ code: string; results?: { qr_url?: string; qr_link?: string; code?: string; qr_duration?: number } }> {
  return gowaFetch(`/devices/${DEVICE_ID}/login`);
}

export async function reconnectDevice() {
  return gowaFetch(`/devices/${DEVICE_ID}/reconnect`, { method: 'POST' });
}

export async function logoutDevice() {
  return gowaFetch(`/devices/${DEVICE_ID}/logout`, { method: 'POST' });
}

export interface SendMessagePayload {
  phone: string;
  message: string;
}

export async function sendMessage(phone: string, message: string) {
  // Normalize phone: remove +, spaces, dashes; convert leading 0 to 62
  let normalized = phone.replace(/[\s\-\+\(\)]/g, '');
  if (normalized.startsWith('0')) {
    normalized = '62' + normalized.slice(1);
  }

  return gowaFetch('/send/message', {
    method: 'POST',
    body: JSON.stringify({ phone: normalized, message }),
  });
}

export async function getDeviceWebhook() {
  return gowaFetch(`/devices/${DEVICE_ID}/webhook`);
}

export async function setDeviceWebhook(webhook_url: string, webhook_secret?: string, webhook_events?: string) {
  return gowaFetch(`/devices/${DEVICE_ID}/webhook`, {
    method: 'PATCH',
    body: JSON.stringify({
      webhook_url,
      ...(webhook_secret !== undefined ? { webhook_secret } : {}),
      ...(webhook_events !== undefined ? { webhook_events } : {}),
    }),
  });
}

export { DEVICE_ID, GOWA_BASE_URL };

