'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Copy,
  Info,
  Link2,
  LogOut,
  Plug,
  PlugZap,
  QrCode,
  Radio,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Terminal,
  Webhook,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SectionCard, PageHeader } from '../components/ui';
import { cn } from '@/lib/utils';

interface DeviceStatusResult {
  device_id?: string;
  is_connected?: boolean;
  is_logged_in?: boolean;
  name?: string;
}

interface WebhookLogItem {
  id: number;
  deviceId: string | null;
  event: string;
  payload: unknown;
  createdAt: string;
}

type Notice = { tone: 'ok' | 'err' | 'info'; text: string };

function Field({
  label,
  htmlFor,
  placeholder,
  value,
  onChange,
  type = 'text',
  hint,
  autoComplete,
}: {
  label: string;
  htmlFor: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <Input
        id={htmlFor}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CodeBlock({ content, maxHeight = '12rem' }: { content: string; maxHeight?: string }) {
  return (
    <pre
      className="tabular overflow-auto rounded-lg border border-border/60 bg-background/60 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground"
      style={{ maxHeight }}
    >
      {content}
    </pre>
  );
}

export default function WhatsAppGatewayPage() {
  const [status, setStatus] = React.useState<DeviceStatusResult | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = React.useState(true);
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  const [isLoadingQr, setIsLoadingQr] = React.useState(false);
  const [qrCountdown, setQrCountdown] = React.useState(30);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const [webhookUrl, setWebhookUrl] = React.useState('');
  const [webhookSecret, setWebhookSecret] = React.useState('');
  const [webhookEvents, setWebhookEvents] = React.useState('');
  const [isSavingWebhook, setIsSavingWebhook] = React.useState(false);
  const [webhookLogs, setWebhookLogs] = React.useState<WebhookLogItem[]>([]);
  const [isLoadingWebhook, setIsLoadingWebhook] = React.useState(false);

  const [testPhone, setTestPhone] = React.useState('');
  const [testMsg, setTestMsg] = React.useState(
    'Yth. Bapak/Ibu Pegawai,\n\nMohon segera melakukan pengkinian data mandiri pegawai melalui tautan resmi internal berikut:\nhttps://portal-pegawai.internal\n\nTerima kasih,\nDivisi Kepegawaian & SDM',
  );
  const [isSending, setIsSending] = React.useState(false);
  const [sendResult, setSendResult] = React.useState<unknown>(null);

  const [gatewayUrl, setGatewayUrl] = React.useState('');
  const [gatewayDeviceId, setGatewayDeviceId] = React.useState('');
  const [gatewayUsername, setGatewayUsername] = React.useState('');
  const [gatewayPassword, setGatewayPassword] = React.useState('');
  const [isSavingConfig, setIsSavingConfig] = React.useState(false);
  const [isTestingConfig, setIsTestingConfig] = React.useState(false);
  const [configTestResult, setConfigTestResult] = React.useState<unknown>(null);

  const countdownRef = React.useRef<number | null>(null);

  const fetchStatus = React.useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/whatsapp/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.results ?? null);
      }
    } catch {
      setStatus(null);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const fetchWebhookData = React.useCallback(async () => {
    setIsLoadingWebhook(true);
    try {
      const res = await fetch('/api/whatsapp/webhook', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setWebhookUrl(data.config.webhook_url || '');
          setWebhookSecret(data.config.webhook_secret || '');
          setWebhookEvents(data.config.webhook_events || '');
        }
        setWebhookLogs(data.logs ?? []);
      }
    } catch (err) {
      console.error('Fetch webhook error:', err);
    } finally {
      setIsLoadingWebhook(false);
    }
  }, []);

  const fetchConfig = React.useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/config', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setGatewayUrl(data.config?.baseUrl || '');
        setGatewayDeviceId(data.config?.deviceId || '');
        setGatewayUsername(data.config?.username || '');
        setGatewayPassword(data.config?.password || '');
      }
    } catch (err) {
      console.error('Fetch config error:', err);
    }
  }, []);

  const fetchQr = React.useCallback(async () => {
    setIsLoadingQr(true);
    setNotice(null);
    try {
      const res = await fetch('/api/whatsapp/qr');
      const data = await res.json();

      if (res.ok) {
        // Same-origin proxy path returned by the API; no scheme rewriting here,
        // since the gateway URL may legitimately be plain HTTP.
        setQrUrl(data.qrLink ?? null);
        setQrCountdown(data.qrDuration || 30);
        return;
      }

      if (data?.alreadyConnected) {
        // Healthy gateway, device already paired — not a failure.
        setQrUrl(null);
        setNotice({ tone: 'ok', text: data.message });
        return;
      }

      setQrUrl(null);
      setNotice({
        tone: 'err',
        text: data?.error || 'Could not load the QR code from the gateway.',
      });
    } catch {
      setQrUrl(null);
      setNotice({ tone: 'err', text: 'Unexpected error while loading the QR code.' });
    } finally {
      setIsLoadingQr(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchStatus();
    void fetchWebhookData();
    void fetchConfig();
  }, [fetchStatus, fetchWebhookData, fetchConfig]);

  const isConnected = Boolean(status?.is_connected || status?.is_logged_in);

  // QR auto-refresh countdown
  React.useEffect(() => {
    if (!qrUrl || isConnected) return;
    countdownRef.current = window.setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          void fetchQr();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
    };
  }, [qrUrl, isConnected, fetchQr]);

  const handleReconnect = async () => {
    setNotice({ tone: 'info', text: 'Requesting device reconnect…' });
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconnect' }),
      });
      const data = await res.json();
      setNotice({ tone: 'ok', text: data.message || 'Perintah reconnect terkirim.' });
      void fetchStatus();
    } catch {
      setNotice({ tone: 'err', text: 'Could not reach the gateway to reconnect.' });
    }
  };

  const handleLogoutDevice = async () => {
    if (!window.confirm('Putuskan tautan WhatsApp dari perangkat portal-pegawai?')) return;
    setNotice({ tone: 'info', text: 'Logging the device out…' });
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      const data = await res.json();
      setNotice({ tone: 'ok', text: data.message || 'Perangkat berhasil diputuskan.' });
      setQrUrl(null);
      void fetchStatus();
    } catch {
      setNotice({ tone: 'err', text: 'Could not log the device out.' });
    }
  };

  const handleSaveWebhook = async () => {
    setIsSavingWebhook(true);
    setNotice(null);
    try {
      const res = await fetch('/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_url: webhookUrl,
          webhook_secret: webhookSecret,
          webhook_events: webhookEvents,
        }),
      });
      const data = await res.json();
      if (data.code === 'SUCCESS' || res.ok) {
        setNotice({ tone: 'ok', text: 'Webhook configuration saved to GOWA.' });
        void fetchWebhookData();
      } else {
        setNotice({
          tone: 'err',
          text: `Gagal menyimpan webhook: ${data.message || data.error}`,
        });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!gatewayUrl.trim()) {
      setNotice({ tone: 'err', text: 'URL gateway wajib diisi.' });
      return;
    }
    if (!gatewayDeviceId.trim()) {
      setNotice({ tone: 'err', text: 'Device ID wajib diisi.' });
      return;
    }
    setIsSavingConfig(true);
    setNotice(null);
    setConfigTestResult(null);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: gatewayUrl.trim(),
          deviceId: gatewayDeviceId.trim(),
          username: gatewayUsername.trim(),
          password: gatewayPassword,
        }),
      });
      const data = await res.json();
      if (data.code === 'SUCCESS' || res.ok) {
        setNotice({ tone: 'ok', text: 'Gateway configuration saved.' });
        void fetchStatus();
      } else {
        setNotice({
          tone: 'err',
          text: `Gagal menyimpan konfigurasi: ${data.error || data.message}`,
        });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestConfig = async () => {
    setIsTestingConfig(true);
    setConfigTestResult(null);
    try {
      await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: gatewayUrl.trim(),
          deviceId: gatewayDeviceId.trim(),
          username: gatewayUsername.trim(),
          password: gatewayPassword,
        }),
      });

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      });
      const data = await res.json();
      setConfigTestResult(data);

      if (data.authOk) {
        setNotice({
          tone: 'ok',
          text: 'Gateway connection and authentication succeeded. Scan the QR code to register the device.',
        });
        void fetchStatus();
      } else {
        const msg = data?.message || data?.error || 'respons tidak dikenal';
        setNotice({
          tone: 'err',
          text: `Autentikasi gagal: ${msg}. Pastikan username/password Basic Auth benar.`,
        });
      }
    } catch (err) {
      setConfigTestResult({ error: (err as Error).message });
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsTestingConfig(false);
    }
  };

  const handleUseCurrentHost = () => {
    setWebhookUrl(`${window.location.origin}/api/webhook/whatsapp`);
  };

  const handleTestSend = async () => {
    if (!testPhone.trim()) {
      setNotice({ tone: 'err', text: 'Masukkan nomor telepon tujuan.' });
      return;
    }
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, message: testMsg }),
      });
      setSendResult(await res.json());
    } catch (err) {
      setSendResult({ error: (err as Error).message || 'Failed to send message' });
    } finally {
      setIsSending(false);
    }
  };

  const refreshAll = () => {
    void fetchStatus();
    void fetchWebhookData();
    setNotice({ tone: 'info', text: 'Data gateway diperbarui.' });
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="WhatsApp Gateway Management"
        description="Integrasi pengiriman pesan otomatis dan penerimaan webhook event WhatsApp multi-device (GOWA)."
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={isLoadingStatus}>
            {isLoadingStatus ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : (
              <Plug aria-hidden="true" />
            )}
            Refresh Semua
          </Button>
        }
      />

      {notice ? (
        <div
          role="status"
          className={cn(
            'mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
            notice.tone === 'ok' && 'border-accent/30 bg-accent/10 text-accent',
            notice.tone === 'err' && 'border-destructive/30 bg-destructive/10 text-destructive',
            notice.tone === 'info' && 'border-chart-2/30 bg-chart-2/10 text-chart-2',
          )}
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{notice.text}</span>
        </div>
      ) : null}

      {/* ── Gateway configuration ─────────────────────────────── */}
      <SectionCard
        title="GOWA Gateway Connection Settings"
        description="Set the endpoint URL, Device ID, and HTTP Basic Auth credentials. Stored in the database and used by every WhatsApp feature."
        className="mb-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Gateway Endpoint URL"
            htmlFor="gw-url"
            placeholder="Contoh: https://107.23.128.93"
            value={gatewayUrl}
            onChange={setGatewayUrl}
          />
          <Field
            label="Device ID"
            htmlFor="gw-device"
            placeholder="Contoh: portal-pegawai"
            value={gatewayDeviceId}
            onChange={setGatewayDeviceId}
          />
          <Field
            label="Basic Auth Username (optional)"
            htmlFor="gw-user"
            placeholder="Leave blank if the gateway has no Basic Auth"
            value={gatewayUsername}
            onChange={setGatewayUsername}
            autoComplete="off"
          />
          <Field
            label="Basic Auth Password (optional)"
            htmlFor="gw-pass"
            placeholder="Leave blank if the gateway has no Basic Auth"
            value={gatewayPassword}
            onChange={setGatewayPassword}
            type="password"
            autoComplete="new-password"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void handleSaveConfig()} disabled={isSavingConfig}>
            <Save aria-hidden="true" />
            {isSavingConfig ? 'Saving…' : 'Save Configuration'}
          </Button>
          <Button variant="outline" onClick={() => void handleTestConfig()} disabled={isTestingConfig}>
            <PlugZap aria-hidden="true" />
            {isTestingConfig ? 'Testing…' : 'Test Connection'}
          </Button>
        </div>

        {configTestResult ? (
          <div className="mt-4">
            <CodeBlock content={JSON.stringify(configTestResult, null, 2)} maxHeight="10rem" />
          </div>
        ) : null}
      </SectionCard>

      {/* ── Device status + QR ────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="WhatsApp Device Status"
          actions={
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5 border px-2 py-0 text-[10px] font-semibold',
                isLoadingStatus
                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                  : isConnected
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-destructive/30 bg-destructive/10 text-destructive',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  isLoadingStatus
                    ? 'bg-amber-400 animate-pulse'
                    : isConnected
                      ? 'bg-accent'
                      : 'bg-destructive',
                )}
                aria-hidden="true"
              />
              {isLoadingStatus ? 'Checking' : isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          }
        >
          <dl className="divide-y divide-border/50">
            {[
              { label: 'Device ID', value: status?.device_id || 'portal-pegawai', mono: true },
              {
                label: 'Login Status',
                value: status?.is_logged_in ? 'Logged In' : 'Not Signed In',
                tone: status?.is_logged_in ? 'ok' : 'err',
              },
              {
                label: 'Socket Connection Status',
                value: status?.is_connected ? 'Connected' : 'Disconnected',
                tone: status?.is_connected ? 'ok' : 'err',
              },
              { label: 'Gateway Endpoint', value: gatewayUrl || '—', mono: false },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd
                  className={cn(
                    'min-w-0 truncate text-sm',
                    row.mono && 'tabular text-chart-2',
                    row.tone === 'ok' && 'font-medium text-accent',
                    row.tone === 'err' && 'font-medium text-destructive',
                    !row.mono && !row.tone && 'text-foreground',
                  )}
                  title={typeof row.value === 'string' ? row.value : undefined}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void handleReconnect()}>
              <RefreshCw aria-hidden="true" />
              Reconnect
            </Button>
            <Button size="sm" variant="outline" onClick={() => void fetchQr()} disabled={isLoadingQr}>
              <QrCode aria-hidden="true" />
              Tampilkan QR Code
            </Button>
            {isConnected ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleLogoutDevice()}
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut aria-hidden="true" />
                Putuskan WhatsApp
              </Button>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Scan the WhatsApp Web QR Code">
          {isConnected ? (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent/15">
                <CheckCircle2 className="size-7 text-accent" aria-hidden="true" />
              </span>
              <p className="text-base font-semibold text-foreground">WhatsApp Telah Terhubung!</p>
              <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                Perangkat <span className="tabular">portal-pegawai</span> aktif dan siap digunakan untuk
                mengirim notifikasi atau tautan kampanye.
              </p>
            </div>
          ) : qrUrl ? (
            <div className="flex flex-col items-center">
              <div className="rounded-xl bg-white p-3 shadow-xl shadow-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="WhatsApp QR code for linking the device" className="size-52" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Kadaluarsa dalam{' '}
                <span className="tabular font-semibold text-chart-3">{qrCountdown}s</span> (auto-refresh)
              </p>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => void fetchQr()}>
                <RefreshCw aria-hidden="true" />
                Refresh QR Now
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-secondary/60">
                <Smartphone className="size-7 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="max-w-xs text-xs text-muted-foreground">
                Use the button below to request an authentication QR from WhatsApp.
              </p>
              <Button className="mt-4" onClick={() => void fetchQr()} disabled={isLoadingQr}>
                <QrCode aria-hidden="true" />
                {isLoadingQr ? 'Loading QR Code…' : 'Show QR Code'}
              </Button>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Info className="size-3.5 text-accent" aria-hidden="true" />
              Device Linking Instructions
            </p>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
              <li>Open WhatsApp on your phone.</li>
              <li>
                Tap <b className="text-foreground">Menu</b> or{' '}
                <b className="text-foreground">Settings</b> → <b className="text-foreground">Linked Device</b>.
              </li>
              <li>
                Tap <b className="text-foreground">Link Device</b>, then point your camera at the QR code above.
              </li>
            </ol>
          </div>
        </SectionCard>
      </div>

      {/* ── Webhook ──────────────────────────────────────────── */}
      <SectionCard
        title="GOWA Webhook Settings"
        description="GOWA sends WhatsApp events (connection status, incoming messages, etc.) to this endpoint via HTTP POST."
        className="mb-4"
        actions={
          <Button size="sm" variant="outline" onClick={handleUseCurrentHost}>
            <Copy aria-hidden="true" />
            Pakai URL Domain Saat Ini
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Webhook Target URL"
            htmlFor="wh-url"
            placeholder="https://domain-anda/api/webhook/whatsapp"
            value={webhookUrl}
            onChange={setWebhookUrl}
          />
          <Field
            label="Webhook Secret Key (optional)"
            htmlFor="wh-secret"
            placeholder="HMAC SHA-256 secret key"
            value={webhookSecret}
            onChange={setWebhookSecret}
            autoComplete="off"
          />
          <Field
            label="Filter Events (optional)"
            htmlFor="wh-events"
            placeholder="message,connection,message.ack"
            value={webhookEvents}
            onChange={setWebhookEvents}
            hint="Pisahkan dengan koma. Kosong = semua event."
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void handleSaveWebhook()} disabled={isSavingWebhook}>
            <Save aria-hidden="true" />
            {isSavingWebhook ? 'Saving…' : 'Save Webhook Configuration'}
          </Button>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Webhook className="size-3" aria-hidden="true" />
            Receiver internal: <code className="tabular">/api/webhook/whatsapp</code>
          </span>
        </div>

        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Radio className="size-3.5 text-accent" aria-hidden="true" />
              Log Aktivitas Webhook ({webhookLogs.length})
            </h3>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void fetchWebhookData()}
              disabled={isLoadingWebhook}
            >
              <RefreshCw aria-hidden="true" />
              Refresh Log
            </Button>
          </div>

          {webhookLogs.length === 0 ? (
            <p className="rounded-lg bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground">
              Belum ada event webhook yang diterima. Event akan muncul di sini setelah GOWA mengirim data.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {webhookLogs.map((log) => (
                <li key={log.id} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="border-chart-2/30 bg-chart-2/10 text-[10px] text-chart-2">
                        {log.event}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        Device: {log.deviceId || 'portal-pegawai'}
                      </span>
                    </span>
                    <span className="tabular text-[11px] text-muted-foreground/80">{log.createdAt}</span>
                  </div>
                  <CodeBlock
                    maxHeight="5rem"
                    content={
                      typeof log.payload === 'object'
                        ? JSON.stringify(log.payload, null, 2)
                        : String(log.payload)
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      {/* ── Test send ────────────────────────────────────────── */}
      <SectionCard
        title="Test Message Delivery"
        description="Kirim pesan percobaan untuk memastikan koneksi WhatsApp Gateway berfungsi."
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Field
              label="Target WhatsApp Number"
              htmlFor="test-phone"
              placeholder="08123456789 atau 628123456789"
              value={testPhone}
              onChange={setTestPhone}
            />
            <div className="space-y-1.5">
              <Label htmlFor="test-msg">Message Body</Label>
              <textarea
                id="test-msg"
                rows={6}
                value={testMsg}
                onChange={(e) => setTestMsg(e.target.value)}
                className="w-full resize-vertical rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <Button onClick={() => void handleTestSend()} disabled={isSending}>
              <Send aria-hidden="true" />
              {isSending ? 'Sending…' : 'Send Test Message'}
            </Button>
          </div>

          <div>
            <Label htmlFor="send-log" className="mb-1.5 block">
              Log Respons Gateway
            </Label>
            <CodeBlock
              maxHeight="16rem"
              content={
                sendResult
                  ? JSON.stringify(sendResult, null, 2)
                  : '// Delivery response log will appear here...'
              }
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}