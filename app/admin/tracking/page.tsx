'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Recipient {
  id: number;
  label: string;
  phone: string | null;
  cabang: string | null;
  waStatus: string;
  waSentAt: string | null;
  waMessageId: string | null;
  campaignId: number | null;
  campaignName: string | null;
  isSubmitted: boolean;
  createdAt: string;
}

interface StatusHistory {
  id: number;
  recipientId: number;
  status: string;
  messageId: string | null;
  createdAt: string;
}

interface Campaign {
  id: number;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  readCount: number;
}

const statusColors: Record<string, string> = {
  pending: '#facc15',
  sent: '#38bdf8',
  delivered: '#38bdf8',
  read: '#4ade80',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  sent: 'Terkirim',
  delivered: 'Diterima',
  read: 'Dibaca',
};

export default function TrackingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error('Fetch campaigns error:', err);
    }
  }, []);

  const fetchRecipients = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = selectedCampaign ? `?campaignId=${selectedCampaign}` : '';
      const res = await fetch(`/api/tracking${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecipients(data.recipients || []);
      }
    } catch (err) {
      console.error('Fetch recipients error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCampaign]);

  const fetchHistory = useCallback(async (recipientId: number) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/tracking?recipientId=${recipientId}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        setSelectedRecipient(data.recipient);
      }
    } catch (err) {
      console.error('Fetch history error:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    fetchRecipients();
    const interval = setInterval(fetchRecipients, 8000);
    return () => clearInterval(interval);
  }, [fetchRecipients]);

  const filteredRecipients = recipients.filter((r) => {
    if (statusFilter !== 'all' && r.waStatus !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.label.toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.cabang || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    total: recipients.length,
    pending: recipients.filter((r) => r.waStatus === 'pending' || !r.waStatus).length,
    sent: recipients.filter((r) => r.waStatus === 'sent' || r.waStatus === 'delivered').length,
    read: recipients.filter((r) => r.waStatus === 'read').length,
    submitted: recipients.filter((r) => r.isSubmitted).length,
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            📊 Tracking Status Pengiriman
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Pantau status pengiriman WhatsApp secara real-time per kampanye dan per penerima.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
          >
            <option value="">Semua Kampanye</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                const params = selectedCampaign ? `?campaignId=${selectedCampaign}` : '';
                window.open(`/api/export${params}`, '_blank');
              }}
              style={{ background: '#0f766e', border: 'none', color: '#f8fafc', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              📥 Export Excel
            </button>
            <button
              onClick={() => {
                const params = selectedCampaign ? `?campaignId=${selectedCampaign}&format=csv` : '?format=csv';
                window.open(`/api/export${params}`, '_blank');
              }}
              style={{ background: '#334155', border: 'none', color: '#f8fafc', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              📄 Export CSV
            </button>
            <button
              onClick={fetchRecipients}
              style={{ background: '#334155', border: 'none', color: '#f8fafc', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Penerima', value: stats.total, color: '#f8fafc' },
          { label: 'Pending', value: stats.pending, color: '#facc15' },
          { label: 'Terkirim', value: stats.sent, color: '#38bdf8' },
          { label: 'Dibaca', value: stats.read, color: '#4ade80' },
          { label: 'Sudah Isi Form', value: stats.submitted, color: '#34d399' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Cari nama, nomor, atau cabang..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '8px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px', minWidth: '220px' }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
        >
          <option value="all">Semua Status</option>
          <option value="pending">Pending</option>
          <option value="sent">Terkirim</option>
          <option value="delivered">Diterima</option>
          <option value="read">Dibaca</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '20px' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #334155', fontWeight: 600, color: '#f8fafc', fontSize: '14px' }}>
            Daftar Penerima ({filteredRecipients.length})
          </div>
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>Memuat data...</div>
            ) : filteredRecipients.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>Tidak ada penerima.</div>
            ) : (
              filteredRecipients.map((r) => (
                <div
                  key={r.id}
                  onClick={() => fetchHistory(r.id)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #334155',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '13px' }}>{r.label}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {r.cabang || '-'} • {r.phone || 'No WA'}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: `${statusColors[r.waStatus] || '#94a3b8'}22`,
                      color: statusColors[r.waStatus] || '#94a3b8',
                      border: `1px solid ${statusColors[r.waStatus] || '#94a3b8'}44`,
                    }}
                  >
                    {statusLabels[r.waStatus] || r.waStatus}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #334155', fontWeight: 600, color: '#f8fafc', fontSize: '14px' }}>
            Timeline Status {selectedRecipient ? `- ${selectedRecipient.label}` : ''}
          </div>
          <div style={{ padding: '16px', maxHeight: '600px', overflowY: 'auto' }}>
            {isLoadingHistory ? (
              <div style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>Memuat timeline...</div>
            ) : !selectedRecipient ? (
              <div style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                Klik penerima di sebelah kiri untuk melihat timeline status.
              </div>
            ) : history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                Belum ada riwayat status untuk penerima ini.
              </div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: '24px' }}>
                <div style={{ position: 'absolute', left: '8px', top: 0, bottom: 0, width: '2px', background: '#334155' }} />
                {history.map((h, i) => (
                  <div key={h.id} style={{ position: 'relative', marginBottom: '20px' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: '-20px',
                        top: '4px',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: statusColors[h.status] || '#94a3b8',
                        border: '2px solid #1e293b',
                      }}
                    />
                    <div style={{ fontWeight: 600, color: statusColors[h.status] || '#94a3b8', fontSize: '13px' }}>
                      {statusLabels[h.status] || h.status}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {new Date(h.createdAt).toLocaleString('id-ID')}
                    </div>
                    {h.messageId && (
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                        ID: {h.messageId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
