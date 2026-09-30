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
    const { name, nip, jabatan_sk, jabatan_sekarang, cabang } = addForm;
    if (!name || !nip || !jabatan_sk || !jabatan_sekarang || !cabang) {
      alert('Semua kolom wajib diisi.');
      return;
    }
    const res = await fetch('/api/pegawai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, nip, jabatan_sk, jabatan_sekarang, cabang }),
    });
    const json = await res.json();
    if (json.success) {
      setShowAddForm(false);
      setAddForm({ name: '', nip: '', jabatan_sk: '', jabatan_sekarang: '', cabang: '' });
      fetchData();
    } else {
      alert(json.error || 'Gagal menambah data.');
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
    const { name, nip, jabatan_sk, jabatan_sekarang, cabang } = editForm;
    if (!name || !nip || !jabatan_sk || !jabatan_sekarang || !cabang) {
      alert('Semua kolom wajib diisi.');
      return;
    }
    const res = await fetch(`/api/pegawai/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, nip, jabatan_sk, jabatan_sekarang, cabang }),
    });
    const json = await res.json();
    if (json.success) {
      setEditingId(null);
      fetchData();
    } else {
      alert(json.error || 'Gagal menyimpan perubahan.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus data pengkinian pegawai ini?')) return;
    const res = await fetch(`/api/pegawai/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      fetchData();
    } else {
      alert(json.error || 'Gagal menghapus data.');
    }
  };

  const filteredData = data.filter((row) => {
    const matchSearch =
      (row.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (row.nip || '').toLowerCase().includes(search.toLowerCase()) ||
      (row.jabatan_sk || '').toLowerCase().includes(search.toLowerCase()) ||
      (row.jabatan_sekarang || '').toLowerCase().includes(search.toLowerCase());
    const matchCabang = !selectedCabang || row.cabang === selectedCabang;
    return matchSearch && matchCabang;
  });

  const cellInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid #3b82f6',
    borderRadius: '4px',
    fontSize: '13px',
    boxSizing: 'border-box',
    background: '#0f172a',
    color: '#f8fafc',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            👥 Data Pengkinian Pegawai
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Daftar pengkinian data mandiri pegawai internal. Kolom sensitif (NIP, Jabatan, Cabang) terenkripsi AES-256-GCM di database.
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
            ➕ Tambah Pegawai
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
            📥 Unduh CSV
          </a>
        </div>
      </div>

      {/* Add Form Card */}
      {showAddForm && (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          <div style={{ fontWeight: 600, fontSize: '15px', color: '#f8fafc', marginBottom: '16px' }}>
            Tambah Data Pegawai Baru
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
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
            <div style={{ gridColumn: 'span 2' }}>
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
        <div style={{ display: 'flex', gap: '12px', flex: 1, flexWrap: 'wrap', minWidth: '280px' }}>
          <input
            type="text"
            placeholder="🔍 Cari nama, NIP, jabatan..."
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
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>#</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Waktu</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Nama Lengkap</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>NIP</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Jabatan SK</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Jabatan Saat Ini</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Kantor Cabang</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>IP</th>
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
                  return (
                    <tr
                      key={row.id}
                      style={{ borderBottom: '1px solid #334155', background: isEditing ? '#0f172a' : 'transparent', transition: 'background 0.15s' }}
                    >
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>{row.id}</td>
                      <td style={{ padding: '12px 14px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{row.created_at}</td>
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
                          <input
                            style={cellInputStyle}
                            value={editForm.jabatan_sk}
                            onChange={(e) => setEditForm({ ...editForm, jabatan_sk: e.target.value })}
                          />
                        ) : (
                          row.jabatan_sk
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                        {isEditing ? (
                          <input
                            style={cellInputStyle}
                            value={editForm.jabatan_sekarang}
                            onChange={(e) => setEditForm({ ...editForm, jabatan_sekarang: e.target.value })}
                          />
                        ) : (
                          row.jabatan_sekarang
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
                      <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '11px' }}>
                        {row.ip_address || '-'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => handleSaveEdit(row.id)}
                              style={{ background: '#10b981', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              title="Simpan"
                            >
                              💾 Simpan
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{ background: '#475569', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              title="Batal"
                            >
                              ✖ Batal
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => handleStartEdit(row)}
                              style={{ background: '#334155', border: 'none', color: '#cbd5e1', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDelete(row.id)}
                              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              title="Hapus"
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
    </div>
  );
}
