'use client';

import React, { useState, useEffect, useCallback } from 'react';

export interface RecipientRow {
  id: number;
  label: string;
  phone: string | null;
  message: string | null;
  waMessageId: string | null;
  waStatus: 'pending' | 'sent' | 'delivered' | 'read' | string;
  waSentAt: string | null;
  createdAt: string;
}

export default function BroadcastPage() {
  const [data, setData] = useState<RecipientRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);

  // Status Filter: 'all' | 'pending' | 'sent' | 'read'
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'sent' | 'read'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Message template
  const [msgTemplate, setMsgTemplate] = useState(
    'Yth. Bapak/Ibu {nama},\n\nSehubungan dengan pengkinian berkas dan administrasi kepegawaian internal Bank SulutGo, mohon kesediaan Bapak/Ibu untuk mengisi formulir pengkinian data mandiri melalui tautan portal resmi berikut:\n\n{link}\n\nBatas waktu pengisian adalah 3 hari kerja sejak pesan ini diterima.\n\nTerima kasih atas kerja samanya.\nDivisi SDM / Human Capital'
  );
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Sending status map for individual rows
  const [sendingMap, setSendingMap] = useState<Record<number, boolean>>({});

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const res = await fetch('/api/recipients');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-poll status updates every 8 seconds (background refresh for message.ack updates)
    const interval = setInterval(() => {
      fetchData(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRegisterTargets = async () => {
    const lines = inputText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!lines.length) {
      alert('Masukkan minimal satu data pegawai.');
      return;
    }

    // Support: "Nama, 08123456789" or "Nama"
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
        alert(json.error || 'Gagal mendaftarkan penerima broadcast.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus penerima ini dari daftar broadcast?')) return;
    try {
      const res = await fetch(`/api/recipients/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        fetchData();
      } else {
        alert(json.error || 'Gagal menghapus.');
      }
    } catch {
      alert('Terjadi kesalahan saat menghapus.');
    }
  };

  const handleSendWA = async (row: RecipientRow) => {
    let targetPhone = row.phone;
    if (!targetPhone) {
      const phoneInput = prompt(`Masukkan nomor WhatsApp untuk ${row.label} (contoh: 08123456789):`);
      if (!phoneInput || !phoneInput.trim()) return;
      targetPhone = phoneInput.trim();
      await fetch(`/api/recipients/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone }),
      });
    }

    setSendingMap((prev) => ({ ...prev, [row.id]: true }));
    try {
      const origin = window.location.origin;
      const portalLink = `${origin}/`;
      const message = msgTemplate
        .replace('{nama}', row.label)
        .replace('{link}', portalLink);

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: row.id,
          phone: targetPhone,
          message,
        }),
      });

      const json = await res.json();
      if (json.isSuccess || json.code === 'SUCCESS' || json.code === 'OK' || json.message_id) {
        alert(`✅ Pesan WhatsApp berhasil dikirim ke ${row.label} (${targetPhone})!`);
        fetchData();
      } else {
        alert(`❌ Gagal mengirim: ${json.message || 'Periksa koneksi WhatsApp Gateway'}`);
      }
    } catch (err: any) {
      alert(`❌ Terjadi kesalahan: ${err.message}`);
    } finally {
      setSendingMap((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const handleBulkSendWA = async () => {
    // Target any with phone number who hasn't been sent yet or still pending
    const targets = data.filter((r) => r.phone && (r.waStatus === 'pending' || !r.waSentAt));
    if (targets.length === 0) {
      alert('Tidak ada penerima dengan nomor WhatsApp yang berstatus Pending.');
      return;
    }

    if (!confirm(`Kirim broadcast WhatsApp ke ${targets.length} penerima berstatus Pending sekarang?`)) return;

    setIsBulkSending(true);
    let successCount = 0;
    const origin = window.location.origin;
    const portalLink = `${origin}/`;

    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      setBulkProgress(`Mengirim ${i + 1} dari ${targets.length} (${row.label})...`);

      try {
        const message = msgTemplate
          .replace('{nama}', row.label)
          .replace('{link}', portalLink);

        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: row.id,
            phone: row.phone,
            message,
          }),
        });

        const json = await res.json();
        if (json.isSuccess || json.code === 'SUCCESS' || json.code === 'OK' || json.message_id) {
          successCount++;
        }
      } catch {
        // continue to next recipient
      }

      // 1.5s delay between sends to prevent WhatsApp rate-limit / spam detection
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    setIsBulkSending(false);
    setBulkProgress(null);
    alert(`Broadcast selesai. Berhasil mengirim ke ${successCount} dari ${targets.length} penerima.`);
    fetchData();
  };

  // Metrics computation
  const total = data.length;
  const pendingCount = data.filter((r) => !r.waStatus || r.waStatus === 'pending').length;
  const sentCount = data.filter((r) => r.waStatus === 'sent' || r.waStatus === 'delivered').length;
  const readCount = data.filter((r) => r.waStatus === 'read').length;
  const readRate = (total - pendingCount) > 0 ? Math.round((readCount / (total - pendingCount)) * 100) : 0;

  // Filtering data
  const filteredData = data.filter((row) => {
    // Tab filter
    if (activeTab === 'pending' && row.waStatus && row.waStatus !== 'pending') return false;
    if (activeTab === 'sent' && row.waStatus !== 'sent' && row.waStatus !== 'delivered') return false;
    if (activeTab === 'read' && row.waStatus !== 'read') return false;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchLabel = row.label.toLowerCase().includes(q);
      const matchPhone = (row.phone || '').toLowerCase().includes(q);
      return matchLabel || matchPhone;
    }
    return true;
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'read':
        return (
          <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '4px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span>✓✓</span> Dibaca
          </span>
        );
      case 'delivered':
        return (
          <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '4px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span>✓✓</span> Terkirim (Diterima)
          </span>
        );
      case 'sent':
        return (
          <span style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', border: '1px solid rgba(14, 165, 233, 0.3)', padding: '4px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span>✓</span> Terkirim ke Server
          </span>
        );
      case 'pending':
      default:
        return (
          <span style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '4px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span>⏳</span> Pending
          </span>
        );
    }
  };

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            📢 Broadcast WhatsApp
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Kirim pesan pengkinian data ke pegawai via WhatsApp dan pantau status pesan secara real-time (Pending, Terkirim, Dibaca).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => fetchData()}
            style={{
              background: '#1e293b',
              color: '#cbd5e1',
              padding: '9px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #334155',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🔄 Refresh Status
          </button>
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
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
            {isBulkSending ? 'Mengirim Broadcast...' : '🚀 Kirim Broadcast Massal'}
          </button>
        </div>
      </div>

      {bulkProgress && (
        <div style={{ padding: '12px 16px', background: 'rgba(37, 211, 102, 0.15)', border: '1px solid rgba(37, 211, 102, 0.3)', borderRadius: '8px', color: '#4ade80', fontSize: '13px', marginBottom: '20px' }}>
          ⏳ {bulkProgress}
        </div>
      )}

      {/* Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Total Target Broadcast</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#f8fafc' }}>{total}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>Penerima terdaftar</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#facc15', marginBottom: '4px' }}>⏳ Chat Pending</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#facc15' }}>{pendingCount}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>Belum dikirimkan</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#38bdf8', marginBottom: '4px' }}>📤 Chat Terkirim</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#38bdf8' }}>{sentCount}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>Terkirim / diterima HP</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#4ade80', marginBottom: '4px' }}>👁️ Chat Dibaca</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#4ade80' }}>{readCount}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>Centang dua biru ({readRate}%)</div>
        </div>
      </div>

      {/* Template Drawer / Card */}
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
            Gunakan tag <code>{'{nama}'}</code> untuk nama pegawai penerima, dan <code>{'{link}'}</code> untuk tautan portal publik formulir.
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
                alert('Template pesan disimpan.');
              }}
              style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              Simpan Template
            </button>
          </div>
        </div>
      )}

      {/* Target Registration Box */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '6px' }}>
          Tambah Target Penerima Broadcast (Format: <code>Nama Pegawai, Nomor WhatsApp</code>)
        </label>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#94a3b8' }}>
          Satu baris per pegawai. Contoh: <code>Budi Santoso, 081234567890</code>
        </p>
        <textarea
          rows={3}
          placeholder={'Budi Santoso, 081234567890\nSiti Aminah, 085298765432\nRudi Hartono, 082154488769'}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', marginBottom: '12px' }}
        />
        <button
          onClick={handleRegisterTargets}
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
          {isGenerating ? 'Mendaftarkan...' : '➕ Daftarkan Penerima'}
        </button>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px', background: '#1e293b', padding: '4px', borderRadius: '8px', border: '1px solid #334155' }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              background: activeTab === 'all' ? '#0078d4' : 'transparent',
              color: activeTab === 'all' ? '#fff' : '#94a3b8',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Semua ({total})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              background: activeTab === 'pending' ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
              color: activeTab === 'pending' ? '#facc15' : '#94a3b8',
              border: activeTab === 'pending' ? '1px solid rgba(234, 179, 8, 0.4)' : 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⏳ Pending ({pendingCount})
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            style={{
              background: activeTab === 'sent' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: activeTab === 'sent' ? '#38bdf8' : '#94a3b8',
              border: activeTab === 'sent' ? '1px solid rgba(56, 189, 248, 0.4)' : 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📤 Terkirim ({sentCount})
          </button>
          <button
            onClick={() => setActiveTab('read')}
            style={{
              background: activeTab === 'read' ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
              color: activeTab === 'read' ? '#4ade80' : '#94a3b8',
              border: activeTab === 'read' ? '1px solid rgba(34, 197, 94, 0.4)' : 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            👁️ Dibaca ({readCount})
          </button>
        </div>

        <div>
          <input
            type="text"
            placeholder="Cari nama atau nomor telepon..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 14px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '13px',
              minWidth: '240px',
            }}
          />
        </div>
      </div>

      {/* Broadcast Recipients Table */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Pegawai</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>No. WhatsApp</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Status Chat</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Waktu Terkirim</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>ID Pesan WA</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600, textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Memuat data broadcast...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    {searchQuery ? 'Tidak ada data yang cocok dengan pencarian.' : 'Belum ada penerima pada kategori ini.'}
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const isSendingThis = sendingMap[row.id];
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{row.label}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          Terdaftar: {row.createdAt ? new Date(row.createdAt).toLocaleDateString('id-ID') : '-'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {row.phone ? (
                          <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{row.phone}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>- Belum ada nomor -</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {getStatusBadge(row.waStatus)}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1', fontSize: '12px' }}>
                        {row.waSentAt ? new Date(row.waSentAt).toLocaleString('id-ID') : '-'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                        {row.waMessageId ? row.waMessageId.slice(0, 16) + '...' : '-'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            onClick={() => handleSendWA(row)}
                            disabled={isSendingThis}
                            title="Kirim Pesan WhatsApp"
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
                            {isSendingThis ? '...' : '📲 Kirim'}
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            title="Hapus Penerima"
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
