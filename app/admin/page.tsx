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

interface RecipientSummary {
  id: number;
  label: string;
  phone: string | null;
  waStatus: 'pending' | 'sent' | 'delivered' | 'read' | string;
  waSentAt: string | null;
  createdAt: string;
}

export default function AdminOverviewPage() {
  const [pegawaiList, setPegawaiList] = useState<PegawaiSummary[]>([]);
  const [broadcastList, setBroadcastList] = useState<RecipientSummary[]>([]);
  const [waState, setWaState] = useState<string>('checking');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [pegawaiRes, broadcastRes, waRes] = await Promise.allSettled([
          fetch('/api/pegawai').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/recipients').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/whatsapp/status').then((r) => (r.ok ? r.json() : null)),
        ]);

        if (pegawaiRes.status === 'fulfilled') setPegawaiList(pegawaiRes.value || []);
        if (broadcastRes.status === 'fulfilled') setBroadcastList(broadcastRes.value || []);
        if (waRes.status === 'fulfilled' && waRes.value) {
          const isConnected = Boolean(waRes.value?.results?.is_connected || waRes.value?.results?.is_logged_in);
          setWaState(isConnected ? 'connected' : 'disconnected');
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
  const totalBroadcast = broadcastList.length;
  const pendingCount = broadcastList.filter((b) => !b.waStatus || b.waStatus === 'pending').length;
  const sentCount = broadcastList.filter((b) => b.waStatus === 'sent' || b.waStatus === 'delivered').length;
  const readCount = broadcastList.filter((b) => b.waStatus === 'read').length;
  const processedCount = sentCount + readCount;
  const readRate = processedCount > 0 ? Math.round((readCount / processedCount) * 100) : 0;

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
      {/* Page Title & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            📊 Dashboard Overview
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Pantau pengkinian data mandiri pegawai, siaran broadcast WhatsApp, dan gateway WhatsApp.
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '16px', marginBottom: '28px' }}>
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
            Data tersimpan terenkripsi AES-256
          </div>
        </div>

        {/* Card 2: Target Broadcast WA */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>Target Broadcast WA</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
              📢
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc' }}>
            {isLoading ? '...' : totalBroadcast}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
            {processedCount} pesan telah diproses ({pendingCount} pending)
          </div>
        </div>

        {/* Card 3: Chat Dibaca */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>Chat Dibaca (Centang Biru)</span>
            <span style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
              👁️
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc' }}>
            {isLoading ? '...' : `${readCount} / ${processedCount}`}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#34d399' }}>
            Rasio keterbacaan: {readRate}%
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
            📢 Buka Broadcast WhatsApp
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

      {/* Two Column Layout: Broadcast Status Breakdown + Recent Submissions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '20px' }}>
        {/* Left: Broadcast Status Breakdown */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
              📢 Status Pengiriman Broadcast WhatsApp
            </h2>
            <Link href="/admin/campaign" style={{ fontSize: '12px', color: '#38bdf8', textDecoration: 'none' }}>
              Detail &rarr;
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Step 1: Pending */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>1. Chat Pending (Belum Dikirim)</span>
                <span style={{ fontWeight: 600, color: '#facc15' }}>{pendingCount} orang</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalBroadcast > 0 ? (pendingCount / totalBroadcast) * 100 : 0}%`,
                    height: '100%',
                    background: '#eab308',
                    transition: 'width 0.5s ease',
                  }}
                ></div>
              </div>
            </div>

            {/* Step 2: Terkirim */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>2. Chat Terkirim / Diterima HP (Centang Abu-abu)</span>
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>{sentCount} orang</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalBroadcast > 0 ? (sentCount / totalBroadcast) * 100 : 0}%`,
                    height: '100%',
                    background: '#0284c7',
                    transition: 'width 0.5s ease',
                  }}
                ></div>
              </div>
            </div>

            {/* Step 3: Dibaca */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: '#cbd5e1' }}>3. Chat Dibaca (Centang Dua Biru)</span>
                <span style={{ fontWeight: 600, color: '#4ade80' }}>{readCount} orang</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${totalBroadcast > 0 ? (readCount / totalBroadcast) * 100 : 0}%`,
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
