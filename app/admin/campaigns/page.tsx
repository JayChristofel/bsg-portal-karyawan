'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Campaign {
  id: number;
  name: string;
  status: string;
  templateId: number | null;
  templateName: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  totalRecipients: number;
  sentCount: number;
  readCount: number;
}

interface Template {
  id: number;
  name: string;
  category: string;
  body: string;
}

const statusColors: Record<string, string> = {
  draft: '#94a3b8',
  scheduled: '#facc15',
  sending: '#38bdf8',
  sent: '#4ade80',
  cancelled: '#f87171',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  sending: 'Mengirim',
  sent: 'Selesai',
  cancelled: 'Dibatalkan',
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string>('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error('Fetch campaigns error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Fetch templates error:', err);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    fetchTemplates();
  }, [fetchCampaigns, fetchTemplates]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Nama kampanye wajib diisi.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          templateId: templateId ? Number(templateId) : null,
          scheduledAt: scheduledAt || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Kampanye "${name}" berhasil dibuat.`);
        setShowModal(false);
        setName('');
        setTemplateId('');
        setScheduledAt('');
        fetchCampaigns();
      } else {
        alert(data.error || 'Gagal membuat kampanye.');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async (id: number, name: string) => {
    if (!confirm(`Kirim kampanye "${name}" sekarang?`)) return;
    setSendingId(id);
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Kampanye "${name}" selesai: ${data.successCount} berhasil, ${data.failCount} gagal.`);
        fetchCampaigns();
      } else {
        alert(data.error || 'Gagal mengirim kampanye.');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Hapus kampanye "${name}"?`)) return;
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage(`Kampanye "${name}" berhasil dihapus.`);
        fetchCampaigns();
      } else {
        alert('Gagal menghapus kampanye.');
      }
    } catch {
      alert('Terjadi kesalahan saat menghapus.');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            📢 Manajemen Kampanye
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Buat kampanye broadcast, pilih template, jadwal kirim, dan pantau status pengiriman.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          ➕ Kampanye Baru
        </button>
      </div>

      {message && (
        <div style={{ padding: '12px 16px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', color: '#38bdf8', fontSize: '13px', marginBottom: '20px' }}>
          {message}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Memuat kampanye...</div>
      ) : campaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', background: '#1e293b', borderRadius: '10px', border: '1px solid #334155' }}>
          Belum ada kampanye. Klik "Kampanye Baru" untuk membuat.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {campaigns.map((c) => (
            <div key={c.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '16px' }}>{c.name}</span>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: `${statusColors[c.status] || '#94a3b8'}22`,
                        color: statusColors[c.status] || '#94a3b8',
                        border: `1px solid ${statusColors[c.status] || '#94a3b8'}44`,
                      }}
                    >
                      {statusLabels[c.status] || c.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {c.templateName ? `Template: ${c.templateName}` : 'Tanpa template'}
                    {c.scheduledAt && ` • Dijadwalkan: ${new Date(c.scheduledAt).toLocaleString('id-ID')}`}
                    {c.sentAt && ` • Terkirim: ${new Date(c.sentAt).toLocaleString('id-ID')}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(c.status === 'draft' || c.status === 'scheduled') && (
                    <button
                      onClick={() => handleSend(c.id, c.name)}
                      disabled={sendingId === c.id}
                      style={{ background: '#25d366', color: '#0f172a', border: 'none', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {sendingId === c.id ? 'Mengirim...' : '🚀 Kirim'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '20px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #334155' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Total Penerima</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>{c.totalRecipients}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Terkirim</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#38bdf8' }}>{c.sentCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Dibaca</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#4ade80' }}>{c.readCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Read Rate</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                    {c.totalRecipients > 0 ? Math.round((c.readCount / c.totalRecipients) * 100) : 0}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', width: '100%', maxWidth: '500px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>Kampanye Baru</h2>
              <button onClick={() => setShowModal(false)} style={{ background: '#334155', border: 'none', color: '#cbd5e1', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Nama Kampanye</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Pengkinian Data Q4 2026"
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Template Pesan (Opsional)</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
              >
                <option value="">— Tanpa template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Jadwal Kirim (Opsional)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
              />
              <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>
                Kosongkan untuk menyimpan sebagai draft.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                {isSaving ? 'Menyimpan...' : 'Simpan Kampanye'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: '#334155', color: '#cbd5e1', border: 'none', padding: '10px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
