'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface AuditLog {
  id: number;
  adminUsername: string;
  action: string;
  detail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  login: '#4ade80',
  send_message: '#38bdf8',
  send_campaign: '#38bdf8',
  save_template: '#facc15',
  update_template: '#facc15',
  delete_template: '#f87171',
  create_campaign: '#a78bfa',
  update_campaign: '#a78bfa',
  delete_campaign: '#f87171',
  create_admin: '#34d399',
  delete_admin: '#f87171',
  assign_recipients: '#94a3b8',
};

const actionLabels: Record<string, string> = {
  login: 'Login',
  send_message: 'Kirim Pesan',
  send_campaign: 'Kirim Kampanye',
  save_template: 'Simpan Template',
  update_template: 'Ubah Template',
  delete_template: 'Hapus Template',
  create_campaign: 'Buat Kampanye',
  update_campaign: 'Ubah Kampanye',
  delete_campaign: 'Hapus Kampanye',
  create_admin: 'Buat Admin',
  delete_admin: 'Hapus Admin',
  assign_recipients: 'Tambah Penerima',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminFilter, setAdminFilter] = useState('');
  const [limit, setLimit] = useState(50);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (adminFilter) params.set('admin', adminFilter);
      const res = await fetch(`/api/audit?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Fetch audit logs error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [adminFilter, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const uniqueAdmins = Array.from(new Set(logs.map((l) => l.adminUsername))).sort();

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            📋 Audit Log
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Jejak aktivitas administrator untuk keamanan dan akuntabilitas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={adminFilter}
            onChange={(e) => setAdminFilter(e.target.value)}
            style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
          >
            <option value="">Semua Admin</option>
            {uniqueAdmins.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
          >
            <option value={20}>20 entri</option>
            <option value={50}>50 entri</option>
            <option value={100}>100 entri</option>
            <option value={200}>200 entri</option>
          </select>
          <button
            onClick={fetchLogs}
            style={{ background: '#334155', border: 'none', color: '#f8fafc', padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Memuat log...</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', background: '#1e293b', borderRadius: '10px', border: '1px solid #334155' }}>
          Belum ada log aktivitas.
        </div>
      ) : (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #334155',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: `${actionColors[log.action] || '#94a3b8'}22`,
                    color: actionColors[log.action] || '#94a3b8',
                    border: `1px solid ${actionColors[log.action] || '#94a3b8'}44`,
                    whiteSpace: 'nowrap',
                    minWidth: '120px',
                    textAlign: 'center',
                  }}
                >
                  {actionLabels[log.action] || log.action}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#f8fafc' }}>
                    <span style={{ fontWeight: 600 }}>{log.adminUsername}</span>
                    {log.detail && <span style={{ color: '#94a3b8' }}> — {log.detail}</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {new Date(log.createdAt).toLocaleString('id-ID')}
                    {log.ipAddress && ` • IP: ${log.ipAddress}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
