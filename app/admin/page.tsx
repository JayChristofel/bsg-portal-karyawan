'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface CampaignStats {
  id: number;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  readCount: number;
  createdAt: string;
}

interface PegawaiStats {
  total: number;
  submitted: number;
  notSubmitted: number;
}

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<CampaignStats[]>([]);
  const [pegawaiStats, setPegawaiStats] = useState<PegawaiStats>({ total: 0, submitted: 0, notSubmitted: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [campaignsRes, pegawaiRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/recipients'),
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }

      if (pegawaiRes.ok) {
        const data = await pegawaiRes.json();
        const recipients = data.recipients || [];
        const submitted = recipients.filter((r: any) => r.isSubmitted).length;
        setPegawaiStats({
          total: recipients.length,
          submitted,
          notSubmitted: recipients.length - submitted,
        });
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalRecipients = campaigns.reduce((sum, c) => sum + c.totalRecipients, 0);
  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
  const totalRead = campaigns.reduce((sum, c) => sum + c.readCount, 0);
  const overallReadRate = totalRecipients > 0 ? Math.round((totalRead / totalRecipients) * 100) : 0;
  const overallSubmitRate = pegawaiStats.total > 0 ? Math.round((pegawaiStats.submitted / pegawaiStats.total) * 100) : 0;

  const maxRecipients = Math.max(...campaigns.map((c) => c.totalRecipients), 1);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
          📊 Dashboard Analytics
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
          Ringkasan performa kampanye dan tingkat respon pegawai.
        </p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Memuat data...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px', marginBottom: '28px' }}>
            {[
              { label: 'Total Kampanye', value: campaigns.length, icon: '📋', color: '#f8fafc' },
              { label: 'Total Penerima', value: totalRecipients, icon: '👥', color: '#38bdf8' },
              { label: 'Total Terkirim', value: totalSent, icon: '📤', color: '#38bdf8' },
              { label: 'Total Dibaca', value: totalRead, icon: '👁️', color: '#4ade80' },
              { label: 'Read Rate', value: `${overallReadRate}%`, icon: '📈', color: '#4ade80' },
              { label: 'Submit Rate', value: `${overallSubmitRate}%`, icon: '🟢', color: '#34d399' },
            ].map((s) => (
              <div key={s.label} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>{s.icon}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{s.label}</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '20px', marginBottom: '28px' }}>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                Perbandingan Kampanye
              </h3>
              {campaigns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Belum ada kampanye.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {campaigns.map((c) => (
                    <div key={c.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: '#64748b' }}>{c.readCount}/{c.totalRecipients} dibaca</span>
                      </div>
                      <div style={{ background: '#0f172a', borderRadius: '4px', height: '20px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${(c.totalRecipients / maxRecipients) * 100}%`,
                            background: 'linear-gradient(90deg, #0078d4, #38bdf8)',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '8px',
                            fontSize: '11px',
                            color: '#fff',
                            fontWeight: 600,
                            minWidth: 'fit-content',
                          }}
                        >
                          {c.totalRecipients}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                Tingkat Respon Pegawai
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
                <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#334155" strokeWidth="12" />
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="#4ade80"
                      strokeWidth="12"
                      strokeDasharray={`${(overallSubmitRate / 100) * 314} 314`}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc' }}>{overallSubmitRate}%</span>
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#4ade80' }} />
                    <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Sudah Isi Form: {pegawaiStats.submitted}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#334155' }} />
                    <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Belum Isi Form: {pegawaiStats.notSubmitted}</span>
                  </div>
                </div>
              </div>
              <div style={{ background: '#0f172a', borderRadius: '6px', padding: '12px', fontSize: '12px', color: '#94a3b8' }}>
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>Read Rate:</span> {overallReadRate}% dari pesan yang dikirim telah dibaca
                </div>
                <div>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>Total Penerima:</span> {totalRecipients} pegawai
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
              Detail per Kampanye
            </h3>
            {campaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Belum ada kampanye.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Kampanye</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Total</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Terkirim</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Dibaca</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Read Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '10px 12px', color: '#f8fafc', fontWeight: 600 }}>{c.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: c.status === 'sent' ? 'rgba(74, 222, 128, 0.15)' : c.status === 'sending' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                              color: c.status === 'sent' ? '#4ade80' : c.status === 'sending' ? '#38bdf8' : '#94a3b8',
                            }}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#cbd5e1' }}>{c.totalRecipients}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#38bdf8' }}>{c.sentCount}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#4ade80' }}>{c.readCount}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#f8fafc', fontWeight: 600 }}>
                          {c.totalRecipients > 0 ? Math.round((c.readCount / c.totalRecipients) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
