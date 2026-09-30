'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface PegawaiSummary {
  id: number;
  name: string;
  nip: string;
  jabatan_sekarang: string;
  cabang: string;
  created_at: string;
}

interface CampaignSummary {
  id: number;
  token: string;
  label: string;
  phone: string | null;
  status: string;
  openedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
}

export default function AdminOverviewPage() {
  const [pegawaiList, setPegawaiList] = useState<PegawaiSummary[]>([]);
  const [campaignList, setCampaignList] = useState<CampaignSummary[]>([]);
  const [waState, setWaState] = useState<string>('checking');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [pegawaiRes, campaignRes, waRes] = await Promise.allSettled([
          fetch('/api/pegawai').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/recipients').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/whatsapp/status').then((r) => (r.ok ? r.json() : null)),
        ]);

        if (pegawaiRes.status === 'fulfilled') setPegawaiList(pegawaiRes.value || []);
        if (campaignRes.status === 'fulfilled') setCampaignList(campaignRes.value || []);
        if (waRes.status === 'fulfilled' && waRes.value) {
          const s = (waRes.value?.results?.state || waRes.value?.state || (waRes.value?.code === 'OK' ? 'connected' : 'disconnected')).toLowerCase();
          setWaState(s.includes('connect') ? 'connected' : 'disconnected');
        } else {
          setWaState('disconnected');
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const totalPegawai = pegawaiList.length;
  const totalCampaign = campaignList.length;
  const openedCampaign = campaignList.filter((c) => c.openedAt).length;
  const startedCampaign = campaignList.filter((c) => c.startedAt).length;
  const submittedCampaign = campaignList.filter((c) => c.submittedAt).length;

  const completionRate = totalCampaign > 0 ? Math.round((submittedCampaign / totalCampaign) * 100) : 0;

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
      {/* Page Title & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            📊 Dashboard Overview
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Pantau pengkinian data mandiri pegawai, simulasi kampanye awareness, dan gateway WhatsApp.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
          >
            🟢 Database: Supabase PostgreSQL
          </span>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* Card 1: Total Data Pegawai */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>Total Data Pegawai</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(0, 120, 212, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
              👥
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc' }}>
            {isLoading ? '...' : totalPegawai}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
            Data tersimpan terenkripsi
          </div>
        </div>

        {/* Card 2: Target Kampanye */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>Target Kampanye</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
              🎯
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc' }}>
            {isLoading ? '...' : totalCampaign}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
            {openedCampaign} link dibuka ({totalCampaign > 0 ? Math.round((openedCampaign / totalCampaign) * 100) : 0}%)
          </div>
        </div>

        {/* Card 3: Completion / Submit */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>Selesai Pengisian</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
              ✅
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc' }}>
            {isLoading ? '...' : `${submittedCampaign} / ${totalCampaign}`}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#34d399' }}>
            Tingkat respon: {completionRate}%
          </div>
        </div>

        {/* Card 4: WhatsApp Gateway */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>WhatsApp Gateway</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(37, 211, 102, 0.15)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
              📱
            </span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: waState === 'connected' ? '#4ade80' : '#f87171' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'currentColor' }}></span>
            {waState === 'connected' ? 'Terhubung' : waState === 'checking' ? 'Memeriksa...' : 'Perlu Scan QR'}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#94a3b8' }}>
            <Link href="/admin/whatsapp" style={{ color: '#38bdf8', textDecoration: 'none' }}>
              Buka Konfigurasi WA &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', marginBottom: '28px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '14px' }}>
          ⚡ Tindakan Cepat
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link
            href="/admin/campaign"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#0078d4', color: '#fff', padding: '10px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
          >
            🎯 Kelola & Kirim Kampanye WA
          </Link>
          <Link
            href="/admin/pegawai"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#334155', color: '#f8fafc', padding: '10px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
          >
            👥 Lihat Semua Data Pegawai
          </Link>
          <Link
            href="/admin/whatsapp"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#0f766e', color: '#fff', padding: '10px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
          >
            📱 Scan QR WhatsApp Web
          </Link>
          <a
            href="/api/export.csv"
            download
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#1e293b', border: '1px solid #475569', color: '#cbd5e1', padding: '10px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
          >
            📥 Unduh Rekap CSV
          </a>
        </div>
      </div>

      {/* Two Column Layout: Funnel + Recent Submissions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
        {/* Left: Funnel Awareness */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
              🎯 Funnel Awareness Kampanye
            </h2>
            <Link href="/admin/campaign" style={{ fontSize: '12px', color: '#38bdf8', textDecoration: 'none' }}>
              Detail &rarr;
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Step 1: Target */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>1. Total Target Terdaftar</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{totalCampaign} orang</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', background: '#64748b' }}></div>
              </div>
            </div>

            {/* Step 2: Dibuka */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>2. Link Dibuka / Interaksi Awal</span>
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>{openedCampaign} orang</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalCampaign > 0 ? (openedCampaign / totalCampaign) * 100 : 0}%`,
                    height: '100%',
                    background: '#0284c7',
                    transition: 'width 0.5s ease',
                  }}
                ></div>
              </div>
            </div>

            {/* Step 3: Mulai Isi Form */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>3. Mulai Mengisi Kolom Form</span>
                <span style={{ fontWeight: 600, color: '#facc15' }}>{startedCampaign} orang</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalCampaign > 0 ? (startedCampaign / totalCampaign) * 100 : 0}%`,
                    height: '100%',
                    background: '#eab308',
                    transition: 'width 0.5s ease',
                  }}
                ></div>
              </div>
            </div>

            {/* Step 4: Selesai Submit */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>4. Selesai Mengirim Data (Submit)</span>
                <span style={{ fontWeight: 600, color: '#4ade80' }}>{submittedCampaign} orang</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalCampaign > 0 ? (submittedCampaign / totalCampaign) * 100 : 0}%`,
                    height: '100%',
                    background: '#22c55e',
                    transition: 'width 0.5s ease',
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: 5 Pegawai Masuk Terakhir */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
              👥 Pegawai Masuk Terkini
            </h2>
            <Link href="/admin/pegawai" style={{ fontSize: '12px', color: '#38bdf8', textDecoration: 'none' }}>
              Lihat Semua &rarr;
            </Link>
          </div>
          {pegawaiList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b', fontSize: '13px' }}>
              Belum ada data pegawai masuk.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pegawaiList.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: '#0f172a',
                    borderRadius: '6px',
                    border: '1px solid #334155',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '13px' }}>{p.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {p.jabatan_sekarang} &bull; {p.cabang}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <code style={{ fontSize: '11px', color: '#38bdf8' }}>{p.nip}</code>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
