'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

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
  payload: any;
  createdAt: string;
}

export default function WhatsAppGatewayPage() {
  const [status, setStatus] = useState<DeviceStatusResult | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [qrCountdown, setQrCountdown] = useState<number>(30);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookEvents, setWebhookEvents] = useState('');
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [webhookLogsList, setWebhookLogsList] = useState<WebhookLogItem[]>([]);
  const [isLoadingWebhook, setIsLoadingWebhook] = useState(false);

  // Test send state
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState(
    'Yth. Bapak/Ibu Pegawai,\n\nMohon segera melakukan pengkinian data mandiri pegawai melalui tautan resmi internal berikut:\nhttps://portal-pegawai.internal\n\nTerima kasih,\nDivisi Kepegawaian & SDM'
  );
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data.results || null);
      }
    } catch {
      setStatus(null);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const fetchWebhookData = useCallback(async () => {
    setIsLoadingWebhook(true);
    try {
      const res = await fetch('/api/whatsapp/webhook');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setWebhookUrl(data.config.webhook_url || '');
          setWebhookSecret(data.config.webhook_secret || '');
          setWebhookEvents(data.config.webhook_events || '');
        }
        setWebhookLogsList(data.logs || []);
      }
    } catch (err) {
      console.error('Fetch webhook error:', err);
    } finally {
      setIsLoadingWebhook(false);
    }
  }, []);

  const fetchQr = useCallback(async () => {
    setIsLoadingQr(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/whatsapp/qr');
      if (res.ok) {
        const data = await res.json();
        let link = data?.results?.qr_link || data?.results?.qr_url || null;
        if (link && link.startsWith('http://')) {
          link = link.replace('http://', 'https://');
        }
        setQrUrl(link);
        const duration = data?.results?.qr_duration || 30;
        setQrCountdown(duration);
      } else {
        setActionMessage('Gagal mengambil QR. Pastikan server GOWA aktif.');
      }
    } catch {
      setActionMessage('Terjadi kesalahan saat memuat QR Code.');
    } finally {
      setIsLoadingQr(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchWebhookData();
  }, [fetchStatus, fetchWebhookData]);

  // Countdown timer for QR
  useEffect(() => {
    if (qrUrl && !status?.is_connected) {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        setQrCountdown((prev) => {
          if (prev <= 1) {
            fetchQr(); // auto-refresh when expired
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [qrUrl, status?.is_connected, fetchQr]);

  const handleReconnect = async () => {
    setActionMessage('Meminta reconnect ke perangkat...');
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconnect' }),
      });
      const data = await res.json();
      setActionMessage(data.message || 'Perintah reconnect terkirim.');
      fetchStatus();
    } catch {
      setActionMessage('Gagal menghubungi gateway untuk reconnect.');
    }
  };

  const handleLogoutDevice = async () => {
    if (!confirm('Putuskan tautan WhatsApp dari perangkat portal-pegawai?')) return;
    setActionMessage('Memutuskan perangkat...');
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      const data = await res.json();
      setActionMessage(data.message || 'Perangkat berhasil diputuskan.');
      setQrUrl(null);
      fetchStatus();
    } catch {
      setActionMessage('Gagal logout perangkat.');
    }
  };

  const handleSaveWebhook = async () => {
    setIsSavingWebhook(true);
    setActionMessage(null);
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
        setActionMessage('✅ Konfigurasi webhook berhasil disimpan ke GOWA.');
        fetchWebhookData();
      } else {
        setActionMessage(`❌ Gagal menyimpan webhook: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setActionMessage(`❌ Error: ${err.message}`);
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleUseCurrentHost = () => {
    if (typeof window !== 'undefined') {
      const autoUrl = `${window.location.origin}/api/webhook/whatsapp`;
      setWebhookUrl(autoUrl);
    }
  };

  const handleTestSend = async () => {
    if (!testPhone.trim()) {
      alert('Masukkan nomor telepon tujuan.');
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
      const data = await res.json();
      setSendResult(data);
    } catch (err: any) {
      setSendResult({ error: err.message || 'Gagal mengirim pesan' });
    } finally {
      setIsSending(false);
    }
  };

  const isConnected = Boolean(status?.is_connected || status?.is_logged_in);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            📱 WhatsApp Gateway Management
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Integrasi pengiriman pesan otomatis dan penerimaan webhook event WhatsApp multi-device (GOWA).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              fetchStatus();
              fetchWebhookData();
              setActionMessage('Data gateway diperbarui.');
            }}
            style={{
              background: '#334155',
              border: 'none',
              color: '#f8fafc',
              padding: '8px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔄 Refresh Semua
          </button>
        </div>
      </div>

      {actionMessage && (
        <div style={{ padding: '12px 16px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', color: '#38bdf8', fontSize: '13px', marginBottom: '20px' }}>
          ℹ️ {actionMessage}
        </div>
      )}

      {/* Grid: Status & QR Scan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '20px', marginBottom: '28px' }}>
        {/* Device Status Card */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
              Status Perangkat WhatsApp
            </h2>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                background: isConnected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isConnected ? '#4ade80' : '#f87171',
                border: `1px solid ${isConnected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              ● {isLoadingStatus ? 'Memeriksa...' : isConnected ? 'Terhubung (Online)' : 'Terputus (Offline)'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 0', borderBottom: '1px solid #334155' }}>
              <span style={{ color: '#94a3b8' }}>Device ID:</span>
              <code style={{ color: '#38bdf8' }}>{status?.device_id || 'portal-pegawai'}</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 0', borderBottom: '1px solid #334155' }}>
              <span style={{ color: '#94a3b8' }}>Status Login:</span>
              <span style={{ color: status?.is_logged_in ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                {status?.is_logged_in ? 'Logged In' : 'Belum Login'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 0', borderBottom: '1px solid #334155' }}>
              <span style={{ color: '#94a3b8' }}>Status Koneksi Soket:</span>
              <span style={{ color: status?.is_connected ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                {status?.is_connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 0' }}>
              <span style={{ color: '#94a3b8' }}>Gateway Endpoint:</span>
              <span style={{ color: '#cbd5e1' }}>https://107.23.128.93</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleReconnect}
              style={{
                background: '#0078d4',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ⚡ Reconnect
            </button>
            <button
              onClick={fetchQr}
              style={{
                background: '#0f766e',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              📷 Tampilkan QR Code
            </button>
            {isConnected && (
              <button
                onClick={handleLogoutDevice}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#f87171',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Putuskan WhatsApp
              </button>
            )}
          </div>
        </div>

        {/* QR Code Scanner Card */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#f8fafc', alignSelf: 'flex-start' }}>
            📷 Pindai QR Code WhatsApp Web
          </h2>

          {isConnected ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 16px' }}>
                ✓
              </div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>
                WhatsApp Telah Terhubung!
              </div>
              <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '320px', margin: '0 auto' }}>
                Perangkat <code>portal-pegawai</code> aktif dan siap digunakan untuk mengirim notifikasi atau link kampanye.
              </p>
            </div>
          ) : qrUrl ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', display: 'inline-block', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt="WhatsApp QR Code"
                  style={{ width: '220px', height: '220px', display: 'block' }}
                />
              </div>
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#94a3b8' }}>
                Kadaluarsa dalam: <b style={{ color: '#facc15' }}>{qrCountdown}s</b> (auto-refresh)
              </div>
              <button
                onClick={fetchQr}
                style={{
                  marginTop: '10px',
                  background: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                🔄 Refresh QR Sekarang
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '36px 20px' }}>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
                Klik tombol di bawah untuk meminta QR Code autentikasi dari WhatsApp.
              </p>
              <button
                onClick={fetchQr}
                disabled={isLoadingQr}
                style={{
                  background: '#0078d4',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {isLoadingQr ? 'Memuat QR Code...' : '📷 Tampilkan QR Code'}
              </button>
            </div>
          )}

          {/* Instructions */}
          <div style={{ width: '100%', marginTop: '20px', padding: '14px', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px' }}>
              💡 Petunjuk Menautkan Perangkat:
            </div>
            <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#94a3b8', lineHeight: '1.6' }}>
              <li>Buka aplikasi WhatsApp di smartphone Anda.</li>
              <li>Ketuk <b>Menu (titik tiga)</b> atau <b>Pengaturan</b> &rarr; <b>Perangkat Tertaut</b>.</li>
              <li>Ketuk <b>Tautkan Perangkat</b> lalu arahkan kamera ke QR Code di atas.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Webhook Configuration Card */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
              🔗 Konfigurasi Webhook GOWA
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
              GOWA akan mengirim event WhatsApp (status koneksi, pesan masuk, dll.) via HTTP POST ke endpoint ini.
            </p>
          </div>
          <button
            onClick={handleUseCurrentHost}
            style={{
              background: '#334155',
              border: 'none',
              color: '#38bdf8',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⚡ Pasang URL Domain Saat Ini
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Webhook Target URL
            </label>
            <input
              type="text"
              placeholder="Contoh: https://portal-pegawai.vercel.app/api/webhook/whatsapp"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Webhook Secret Key (Opsional)
            </label>
            <input
              type="text"
              placeholder="Kunci rahasia HMAC SHA-256"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Filter Events (Opsional, pisahkan koma)
            </label>
            <input
              type="text"
              placeholder="Contoh: message,connection,message.ack (kosong = semua)"
              value={webhookEvents}
              onChange={(e) => setWebhookEvents(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleSaveWebhook}
            disabled={isSavingWebhook}
            style={{
              background: '#0078d4',
              color: '#fff',
              padding: '9px 18px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {isSavingWebhook ? 'Menyimpan...' : '💾 Simpan Konfigurasi Webhook'}
          </button>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Endpoint internal receiver: <code>/api/webhook/whatsapp</code>
          </span>
        </div>

        {/* Webhook Activity Stream */}
        <div style={{ marginTop: '24px', borderTop: '1px solid #334155', paddingTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
              📡 Log Aktivitas Webhook Diterima ({webhookLogsList.length})
            </h3>
            <button
              onClick={fetchWebhookData}
              disabled={isLoadingWebhook}
              style={{
                background: '#334155',
                color: '#cbd5e1',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              🔄 Refresh Log
            </button>
          </div>

          {webhookLogsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '12px', background: '#0f172a', borderRadius: '6px' }}>
              Belum ada event webhook yang diterima. Event akan muncul di sini setelah GOWA mengirim data.
            </div>
          ) : (
            <div style={{ maxHeight: '240px', overflowY: 'auto', background: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
              {webhookLogsList.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #1e293b',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ background: '#334155', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginRight: '8px' }}>
                        {log.event}
                      </span>
                      <span style={{ color: '#94a3b8' }}>Device: {log.deviceId || 'portal-pegawai'}</span>
                    </div>
                    <span style={{ color: '#64748b', fontSize: '11px' }}>{log.createdAt}</span>
                  </div>
                  <pre
                    style={{
                      margin: '4px 0 0',
                      padding: '6px',
                      background: '#1e293b',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#cbd5e1',
                      overflowX: 'auto',
                      maxHeight: '80px',
                    }}
                  >
                    {typeof log.payload === 'object' ? JSON.stringify(log.payload, null, 2) : log.payload}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Test Send Message Card */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '24px' }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
          ✉️ Uji Coba Pengiriman Pesan WhatsApp
        </h2>
        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#94a3b8' }}>
          Kirim pesan percobaan ke nomor pegawai untuk memastikan koneksi WhatsApp Gateway berfungsi dengan baik.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Nomor WhatsApp Tujuan
              </label>
              <input
                type="text"
                placeholder="Contoh: 08123456789 atau 628123456789"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Isi Pesan
              </label>
              <textarea
                rows={6}
                value={testMsg}
                onChange={(e) => setTestMsg(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <button
              onClick={handleTestSend}
              disabled={isSending}
              style={{
                background: '#25d366',
                color: '#0f172a',
                padding: '10px 20px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {isSending ? 'Mengirim...' : '🚀 Kirim Pesan Uji Coba'}
            </button>
          </div>

          {/* Result log */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Log Respons Gateway
            </label>
            <div
              style={{
                width: '100%',
                minHeight: '190px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '12px',
                color: '#cbd5e1',
                fontFamily: 'monospace',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                boxSizing: 'border-box',
              }}
            >
              {sendResult ? JSON.stringify(sendResult, null, 2) : '// Log respons pengiriman akan muncul di sini...'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
