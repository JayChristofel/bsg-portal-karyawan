'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CABANG_GROUPS } from '@/lib/cabang';

interface PegawaiRow {
  id: number;
  created_at: string;
  name: string;
  nip: string;
  jabatan_sk: string;
  jabatan_sekarang: string;
  cabang: string;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  screen_resolution: string | null;
  language: string | null;
  referrer: string | null;
  session_id: string | null;
  event: string | null;
  time_on_page: number | null;
  page_path: string | null;
  asn_isp: string | null;
  approx_location: string | null;
  connection_type: string | null;
}

interface EditForm {
  name: string;
  nip: string;
  jabatan_sk: string;
  jabatan_sekarang: string;
  cabang: string;
}

function CabangSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '8px 10px',
        border: '1px solid #334155',
        borderRadius: '6px',
        fontSize: '13px',
        background: '#1e293b',
        color: '#f8fafc',
        boxSizing: 'border-box',
      }}
    >
      <option value="">-- Pilih Kantor Cabang --</option>
      {Object.entries(CABANG_GROUPS).map(([grp, items]) => (
        <optgroup label={grp} key={grp} style={{ background: '#0f172a', color: '#94a3b8' }}>
          {items.map((c) => (
            <option key={c} value={c} style={{ background: '#1e293b', color: '#f8fafc' }}>
              {c}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function PegawaiPage() {
  const [data, setData] = useState<PegawaiRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCabang, setSelectedCabang] = useState('');

  // Selected row for complete Telemetry Audit Detail modal
  const [detailModalRow, setDetailModalRow] = useState<PegawaiRow | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<EditForm>({
    name: '',
    nip: '',
    jabatan_sk: '',
    jabatan_sekarang: '',
    cabang: '',
  });

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    nip: '',
    jabatan_sk: '',
    jabatan_sekarang: '',
    cabang: '',
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/pegawai');
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

  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.nip.trim() || !addForm.jabatan_sk.trim() || !addForm.jabatan_sekarang.trim() || !addForm.cabang.trim()) {
      alert('Semua kolom wajib diisi.');
      return;
    }

    try {
      const res = await fetch('/api/pegawai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const json = await res.json();
      if (json.success) {
        setAddForm({ name: '', nip: '', jabatan_sk: '', jabatan_sekarang: '', cabang: '' });
        setShowAddForm(false);
        fetchData();
      } else {
        alert(json.error || 'Gagal menambah data.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
  };

  const handleStartEdit = (row: PegawaiRow) => {
    setEditingId(row.id);
    setEditForm({
      name: row.name,
      nip: row.nip,
      jabatan_sk: row.jabatan_sk,
      jabatan_sekarang: row.jabatan_sekarang,
      cabang: row.cabang,
    });
  };

  const handleSaveEdit = async (id: number) => {
    try {
      const res = await fetch(`/api/pegawai/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (json.success) {
        setEditingId(null);
        fetchData();
      } else {
        alert(json.error || 'Gagal menyimpan perubahan.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data pegawai ini?')) return;
    try {
      const res = await fetch(`/api/pegawai/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        fetchData();
      } else {
        alert(json.error || 'Gagal menghapus.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
  };

  const filteredData = data.filter((row) => {
    const matchSearch =
      row.name.toLowerCase().includes(search.toLowerCase()) ||
      row.nip.toLowerCase().includes(search.toLowerCase()) ||
      row.jabatan_sk.toLowerCase().includes(search.toLowerCase()) ||
      row.jabatan_sekarang.toLowerCase().includes(search.toLowerCase()) ||
      (row.ip_address || '').includes(search) ||
      (row.os || '').toLowerCase().includes(search.toLowerCase()) ||
      (row.device_type || '').toLowerCase().includes(search.toLowerCase());

    const matchCabang = selectedCabang ? row.cabang === selectedCabang : true;
    return matchSearch && matchCabang;
  });

  const cellInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    background: '#0f172a',
    border: '1px solid #0078d4',
    borderRadius: '4px',
    color: '#f8fafc',
    fontSize: '13px',
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            👥 Data Pegawai &amp; Audit Lingkungan
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Daftar pengkinian data jabatan pegawai internal. Kolom sensitif (NIK, Jabatan, Cabang) terenkripsi AES-256-GCM. Dilengkapi audit perangkat, jaringan, dan waktu pengisian.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#0078d4',
              color: '#fff',
              padding: '9px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            ➕ Tambah Data
          </button>
          <a
            href="/api/export.csv"
            download
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#334155',
              color: '#f8fafc',
              padding: '9px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            📥 Unduh Rekap CSV Lengkap
          </a>
        </div>
      </div>

      {/* Add Form Card */}
      {showAddForm && (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          <div style={{ fontWeight: 600, fontSize: '15px', color: '#f8fafc', marginBottom: '16px' }}>
            Tambah Data Pegawai Baru
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>Nama Lengkap</label>
              <input
                type="text"
                placeholder="Contoh: Andi Pratama"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>NIP</label>
              <input
                type="text"
                placeholder="Contoh: 198501012010011001"
                value={addForm.nip}
                onChange={(e) => setAddForm({ ...addForm, nip: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>Jabatan SK</label>
              <input
                type="text"
                placeholder="Jabatan sesuai SK"
                value={addForm.jabatan_sk}
                onChange={(e) => setAddForm({ ...addForm, jabatan_sk: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>Jabatan Sekarang</label>
              <input
                type="text"
                placeholder="Jabatan saat ini"
                value={addForm.jabatan_sekarang}
                onChange={(e) => setAddForm({ ...addForm, jabatan_sekarang: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '13px' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>Kantor Cabang</label>
              <CabangSelect
                id="addCabangSelect"
                value={addForm.cabang}
                onChange={(v) => setAddForm({ ...addForm, cabang: v })}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleAdd}
              style={{ background: '#0078d4', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
            >
              Simpan Pegawai
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              style={{ background: '#334155', color: '#cbd5e1', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer' }}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', flex: 1, flexWrap: 'wrap', minWidth: 'min(100%, 260px)' }}>
          <input
            type="text"
            placeholder="🔍 Cari nama, NIK, jabatan, IP, perangkat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: '200px', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
          />
          <select
            value={selectedCabang}
            onChange={(e) => setSelectedCabang(e.target.value)}
            style={{ minWidth: '180px', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
          >
            <option value="">Semua Cabang ({data.length})</option>
            {Array.from(new Set(data.map((d) => d.cabang).filter(Boolean))).sort().map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>
          Menampilkan: <b>{filteredData.length}</b> dari {data.length} data
        </div>
      </div>

      {/* Table Card */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>#</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Waktu</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Nama Lengkap</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>NIK</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Jabatan SK / Sekarang</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Kantor Cabang</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Perangkat &amp; OS</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Jaringan / Lokasi</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600, textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Memuat data pegawai...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    {search || selectedCabang ? 'Tidak ditemukan data yang cocok dengan filter.' : 'Belum ada data pegawai.'}
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const isEditing = editingId === row.id;
                  const isMobile = (row.device_type || '').toLowerCase().includes('mobile');
                  return (
                    <tr
                      key={row.id}
                      style={{ borderBottom: '1px solid #334155', background: isEditing ? '#0f172a' : 'transparent', transition: 'background 0.15s' }}
                    >
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>{row.id}</td>
                      <td style={{ padding: '12px 14px', color: '#94a3b8', whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {row.created_at}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {isEditing ? (
                          <input
                            style={cellInputStyle}
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                        ) : (
                          <span style={{ fontWeight: 600, color: '#f8fafc' }}>{row.name}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {isEditing ? (
                          <input
                            style={cellInputStyle}
                            value={editForm.nip}
                            onChange={(e) => setEditForm({ ...editForm, nip: e.target.value })}
                          />
                        ) : (
                          <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8', fontSize: '12px' }}>
                            {row.nip}
                          </code>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <input
                              style={cellInputStyle}
                              placeholder="Jabatan SK"
                              value={editForm.jabatan_sk}
                              onChange={(e) => setEditForm({ ...editForm, jabatan_sk: e.target.value })}
                            />
                            <input
                              style={cellInputStyle}
                              placeholder="Jabatan Sekarang"
                              value={editForm.jabatan_sekarang}
                              onChange={(e) => setEditForm({ ...editForm, jabatan_sekarang: e.target.value })}
                            />
                          </div>
                        ) : (
                          <div>
                            <div style={{ color: '#f8fafc', fontWeight: 500 }}>{row.jabatan_sekarang}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>SK: {row.jabatan_sk}</div>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                        {isEditing ? (
                          <CabangSelect
                            id={`edit-c-${row.id}`}
                            value={editForm.cabang}
                            onChange={(v) => setEditForm({ ...editForm, cabang: v })}
                          />
                        ) : (
                          row.cabang
                        )}
                      </td>
                      {/* Perangkat & OS */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                          <span>{isMobile ? '📱' : '💻'}</span>
                          <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{row.os || 'OS'}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {row.browser || '-'} &bull; {row.device_type || 'Desktop'}
                        </div>
                      </td>
                      {/* Jaringan / Lokasi */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: '12px', color: '#38bdf8', fontFamily: 'monospace' }}>
                          {row.ip_address || '-'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                          📍 {row.approx_location || 'Indonesia'}
                        </div>
                      </td>
                      {/* Aksi */}
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => handleSaveEdit(row.id)}
                              style={{ background: '#10b981', border: 'none', color: '#fff', padding: '5px 9px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                              title="Simpan"
                            >
                              💾 Simpan
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{ background: '#475569', border: 'none', color: '#fff', padding: '5px 9px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              title="Batal"
                            >
                              ✖
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => setDetailModalRow(row)}
                              style={{ background: '#0284c7', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                              title="Lihat Rincian Audit Lengkap"
                            >
                              🔍
                            </button>
                            <button
                              onClick={() => handleStartEdit(row)}
                              style={{ background: '#334155', border: 'none', color: '#cbd5e1', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              title="Edit Data Pegawai"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDelete(row.id)}
                              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              title="Hapus Data"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* AUDIT DETAIL MODAL (Displays all 16 enriched telemetry & identity fields) */}
      {/* ========================================================================= */}
      {detailModalRow && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setDetailModalRow(null)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  View Data &bull; Record ID #{detailModalRow.id}
                </div>
                <h2 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                  {detailModalRow.name}
                </h2>
              </div>
              <button
                onClick={() => setDetailModalRow(null)}
                style={{
                  background: '#334155',
                  border: 'none',
                  color: '#cbd5e1',
                  borderRadius: '6px',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Grid of Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Section 1: Data Pegawai */}
              <div style={{ background: '#0f172a', padding: '14px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>👤</span> Identitas Kepegawaian
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '13px' }}>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>NIK</div>
                    <code style={{ color: '#38bdf8' }}>{detailModalRow.nip}</code>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Kantor Cabang</div>
                    <div style={{ color: '#f8fafc', fontWeight: 500 }}>{detailModalRow.cabang}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Jabatan sesuai SK</div>
                    <div style={{ color: '#cbd5e1' }}>{detailModalRow.jabatan_sk}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Jabatan Saat Ini</div>
                    <div style={{ color: '#cbd5e1' }}>{detailModalRow.jabatan_sekarang}</div>
                  </div>
                </div>
              </div>

              {/* Section 2: Lingkungan Perangkat & OS */}
              <div style={{ background: '#0f172a', padding: '14px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💻</span> Perangkat &amp; Browser
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '13px' }}>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Device Type</div>
                    <div style={{ color: '#f8fafc', fontWeight: 600 }}>{detailModalRow.device_type || 'Desktop'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Operating System</div>
                    <div style={{ color: '#f8fafc' }}>{detailModalRow.os || '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Browser</div>
                    <div style={{ color: '#f8fafc' }}>{detailModalRow.browser || '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Screen Resolution</div>
                    <div style={{ color: '#f8fafc' }}>{detailModalRow.screen_resolution || '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Language / Locale</div>
                    <div style={{ color: '#f8fafc' }}>{detailModalRow.language || 'id-ID'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Connection Type</div>
                    <div style={{ color: '#f8fafc' }}>{detailModalRow.connection_type || '-'}</div>
                  </div>
                </div>
              </div>

              {/* Section 3: Jaringan, IP & Geolokasi */}
              <div style={{ background: '#0f172a', padding: '14px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🌐</span> Jaringan &amp; Geolokasi
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '13px' }}>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>IP Address</div>
                    <code style={{ color: '#38bdf8' }}>{detailModalRow.ip_address || '-'}</code>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>ASN / ISP</div>
                    <div style={{ color: '#cbd5e1' }}>{detailModalRow.asn_isp || '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Approx. Location</div>
                    <div style={{ color: '#cbd5e1' }}>📍 {detailModalRow.approx_location || 'Indonesia'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Referrer Asal</div>
                    <div style={{ color: '#cbd5e1', wordBreak: 'break-all' }}>{detailModalRow.referrer || 'Direct'}</div>
                  </div>
                </div>
              </div>

              {/* Section 4: Audit Sesi & Perilaku */}
              <div style={{ background: '#0f172a', padding: '14px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⏱️</span> Aktivitas &amp; Waktu
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '13px' }}>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Waktu Submit (Timestamp)</div>
                    <div style={{ color: '#4ade80', fontWeight: 600 }}>{detailModalRow.created_at}</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Time on Page (Durasi Pengerjaan)</div>
                    <div style={{ color: '#facc15', fontWeight: 600 }}>⏱️ {detailModalRow.time_on_page ?? 0} detik</div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Page Path</div>
                    <code style={{ color: '#cbd5e1' }}>{detailModalRow.page_path || '/'}</code>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>Session ID</div>
                    <code style={{ color: '#94a3b8', fontSize: '11px' }}>{detailModalRow.session_id || '-'}</code>
                  </div>
                </div>

                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #1e293b' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>Raw User-Agent:</div>
                  <code style={{ fontSize: '11px', color: '#94a3b8', wordBreak: 'break-all', display: 'block', background: '#0b1120', padding: '6px 8px', borderRadius: '4px' }}>
                    {detailModalRow.user_agent || '-'}
                  </code>
                </div>
              </div>
            </div>

            {/* Modal Close Button */}
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                onClick={() => setDetailModalRow(null)}
                style={{
                  background: '#0078d4',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
