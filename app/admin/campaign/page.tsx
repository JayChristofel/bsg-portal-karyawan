'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface CampaignRow {
  id: number;
  token: string;
  label: string;
  phone: string | null;
  waSentAt: string | null;
  createdAt: string;
  status: string;
  openedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
}

export default function CampaignPage() {
  const [data, setData] = useState<CampaignRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);

  // Message template
  const [msgTemplate, setMsgTemplate] = useState(
    'Yth. Bapak/Ibu {nama},\n\nSehubungan dengan pengkinian berkas dan administrasi kepegawaian internal, mohon kesediaan Bapak/Ibu untuk memverifikasi dan mengisi formulir pengkinian data mandiri melalui tautan resmi berikut:\n\n{link}\n\nBatas waktu pengisian adalah 3 hari kerja sejak pesan ini diterima.\n\nTerima kasih atas kerja samanya.\nDivisi Kepegawaian & SDM'
  );
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Sending status map for individual rows
  const [sendingMap, setSendingMap] = useState<Record<number, boolean>>({});

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/recipients');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerate = async () => {
    const lines = inputText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!lines.length) {
      alert('Masukkan minimal satu data pegawai.');
      return;
    }

    // Support: "Nama, 08123456789" or just "Nama"
    const items = lines.map((line) => {
      const parts = line.split(',');
      if (parts.length >= 2) {
        return {
          label: parts[0].trim(),
          phone: parts.slice(1).join(',').trim(),
        };
      }
      return {
        label: line,
        phone: '',
      };
    });

    setIsGenerating(true);
    try {
      const res = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.success) {
        setInputText('');
        fetchData();
      } else {
        alert(json.error || 'Gagal membuat penerima kampanye.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/?t=${token}`;
    navigator.clipboard.writeText(link).then(() => {
      alert('Tautan berhasil disalin ke clipboard!');
    }).catch(() => {});
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus target penerima ini dari kampanye?')) return;
    try {
      const res = await fetch(`/api/recipients/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        fetchData();
      } else {
        alert(json.error || 'Gagal menghapus penerima.');
      }
    } catch {
      alert('Terjadi kesalahan saat menghapus.');
    }
  };

  const handleSendWA = async (row: CampaignRow) => {
    if (!row.phone) {
      const phoneInput = prompt(`Masukkan nomor WhatsApp untuk ${row.label} (contoh: 08123456789):`);
      if (!phoneInput || !phoneInput.trim()) return;
      row.phone = phoneInput.trim();
      // Save phone
      await fetch(`/api/recipients/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: row.phone }),
      });
    }

    setSendingMap((prev) => ({ ...prev, [row.id]: true }));
    try {
      const origin = window.location.origin;
      const personalizedLink = `${origin}/?t=${row.token}`;
      const message = msgTemplate
        .replace('{nama}', row.label)
        .replace('{link}', personalizedLink);

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: row.phone,
          message,
        }),
      });

      const json = await res.json();
      if (json.code === 'SUCCESS' || json.code === 'OK' || json.results?.message_id || json.message?.toLowerCase().includes('success')) {
        // Mark as sent in DB
        await fetch(`/api/recipients/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ waSent: true }),
        });
        alert(`✅ Pesan WhatsApp berhasil dikirim ke ${row.label} (${row.phone})!`);
        fetchData();
      } else {
        alert(`❌ Gagal mengirim WA: ${json.message || 'Pastikan WhatsApp Gateway terhubung.'}`);
      }
    } catch (err: any) {
      alert(`❌ Terjadi kesalahan: ${err.message}`);
    } finally {
      setSendingMap((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const handleBulkSendWA = async () => {
    const targets = data.filter((r) => r.phone && !r.waSentAt);
    if (targets.length === 0) {
      alert('Tidak ada penerima dengan nomor WA yang belum dikirimi pesan.');
      return;
    }

    if (!confirm(`Kirim pesan WhatsApp ke ${targets.length} penerima sekarang?`)) return;

    setIsBulkSending(true);
    let successCount = 0;
    const origin = window.location.origin;

    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      setBulkProgress(`Mengirim ${i + 1} dari ${targets.length} (${row.label})...`);

      try {
        const personalizedLink = `${origin}/?t=${row.token}`;
        const message = msgTemplate
          .replace('{nama}', row.label)
          .replace('{link}', personalizedLink);

        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: row.phone, message }),
        });

        const json = await res.json();
        if (json.code === 'SUCCESS' || json.code === 'OK' || json.results?.message_id || json.message?.toLowerCase().includes('success')) {
          await fetch(`/api/recipients/${row.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ waSent: true }),
          });
          successCount++;
        }
      } catch {
        // continue
      }

      // Small delay between sends to prevent rate-limit
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    setIsBulkSending(false);
    setBulkProgress(null);
    alert(`Proses selesai. Berhasil mengirim pesan ke ${successCount} dari ${targets.length} penerima.`);
    fetchData();
  };

  const total = data.length;
  const opened = data.filter((r) => r.openedAt).length;
  const started = data.filter((r) => r.startedAt).length;
  const submitted = data.filter((r) => r.submittedAt).length;
  const waSentCount = data.filter((r) => r.waSentAt).length;

  const getStatusBadge = (row: CampaignRow) => {
    if (row.submittedAt) {
      return (
        <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
          ✅ Selesai Submit
        </span>
      );
    }
    if (row.startedAt) {
      return (
        <span style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
          ✍️ Mulai Isi Form
        </span>
      );
    }
    if (row.openedAt) {
      return (
        <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
          👀 Link Dibuka
        </span>
      );
    }
    return (
      <span style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
        ⏳ Belum Dibuka
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            🎯 Kampanye Awareness & Tracking Form
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Kirim tautan pengkinian data berkas ke pegawai via WhatsApp dan pantau interaksi mereka secara real-time.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowTemplateModal(!showTemplateModal)}
            style={{
              background: '#334155',
              color: '#f8fafc',
              padding: '9px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            📝 Template Pesan WA
          </button>
          <button
            onClick={handleBulkSendWA}
            disabled={isBulkSending}
            style={{
              background: '#25d366',
              color: '#0f172a',
              padding: '9px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isBulkSending ? 'Mengirim Massal...' : '🚀 Kirim WA Massal'}
          </button>
        </div>
      </div>

      {bulkProgress && (
        <div style={{ padding: '12px 16px', background: 'rgba(37, 211, 102, 0.15)', border: '1px solid rgba(37, 211, 102, 0.3)', borderRadius: '8px', color: '#4ade80', fontSize: '13px', marginBottom: '20px' }}>
          ⏳ {bulkProgress}
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Total Target</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>{total}</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Terkirim via WA</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#25d366' }}>{waSentCount}</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Link Dibuka</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#38bdf8' }}>{opened}</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Mulai Mengisi</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#facc15' }}>{started}</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Selesai Submit</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#4ade80' }}>{submitted}</div>
        </div>
      </div>

      {/* Template Modal / Drawer */}
      {showTemplateModal && (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#f8fafc' }}>Konfigurasi Template Pesan WhatsApp</h3>
            <button
              onClick={() => setShowTemplateModal(false)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕ Tutup
            </button>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#94a3b8' }}>
            Gunakan variabel <code>{'{nama}'}</code> untuk nama pegawai, dan <code>{'{link}'}</code> untuk tautan unik formulir.
          </p>
          <textarea
            rows={6}
            value={msgTemplate}
            onChange={(e) => setMsgTemplate(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
          />
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                setShowTemplateModal(false);
                alert('Template pesan disimpan untuk sesi ini.');
              }}
              style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              Simpan Template
            </button>
          </div>
        </div>
      )}

      {/* Add Targets Input Card */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '6px' }}>
          Tambah Target Penerima (Format: <code>Nama Pegawai, Nomor WhatsApp</code> atau cukup <code>Nama Pegawai</code>)
        </label>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#94a3b8' }}>
          Satu baris per pegawai. Contoh: <code>Budi Santoso, 081234567890</code>
        </p>
        <textarea
          rows={3}
          placeholder={'Budi Santoso, 081234567890\nSiti Aminah, 085298765432\nRudi Hartono'}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', marginBottom: '12px' }}
        />
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
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
          {isGenerating ? 'Memproses...' : '➕ Daftarkan Target'}
        </button>
      </div>

      {/* Campaign Target Table */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Pegawai</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>No. WhatsApp</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Status Respon</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Status Kirim WA</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Waktu Interaksi</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600, textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Memuat data kampanye...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Belum ada target kampanye terdaftar. Tambahkan daftar nama di atas.
                  </td>
                </tr>
              ) : (
                data.map((row) => {
                  const isSendingThis = sendingMap[row.id];
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{row.label}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Token: {row.token}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {row.phone ? (
                          <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{row.phone}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>- Belum disetel -</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {getStatusBadge(row)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {row.waSentAt ? (
                          <span style={{ color: '#4ade80', fontSize: '12px' }}>
                            ✓ Terkirim ({row.waSentAt})
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                            Belum dikirim
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '11px', color: '#94a3b8' }}>
                        <div>Buka: {row.openedAt || '-'}</div>
                        <div>Mulai: {row.startedAt || '-'}</div>
                        <div>Submit: {row.submittedAt || '-'}</div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            onClick={() => handleSendWA(row)}
                            disabled={isSendingThis}
                            title="Kirim pesan ke WhatsApp"
                            style={{
                              background: '#25d366',
                              color: '#0f172a',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {isSendingThis ? '...' : '📲 Kirim WA'}
                          </button>
                          <button
                            onClick={() => copyLink(row.token)}
                            title="Salin Link Khusus"
                            style={{
                              background: '#334155',
                              color: '#cbd5e1',
                              border: 'none',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            📋
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            title="Hapus Target"
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              color: '#f87171',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
