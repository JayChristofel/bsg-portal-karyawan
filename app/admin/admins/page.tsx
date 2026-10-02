'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Admin {
  id: number;
  username: string;
  createdAt: string;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchAdmins = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admins');
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins || []);
      }
    } catch (err) {
      console.error('Fetch admins error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) {
      alert('Username dan password wajib diisi.');
      return;
    }
    if (password.length < 8) {
      alert('Password minimal 8 karakter.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Admin "${username}" berhasil dibuat.`);
        setShowModal(false);
        setUsername('');
        setPassword('');
        fetchAdmins();
      } else {
        alert(data.error || 'Gagal membuat admin.');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Hapus admin "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admins?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage(`Admin "${name}" berhasil dihapus.`);
        fetchAdmins();
      } else {
        const data = await res.json();
        alert(data.error || 'Gagal menghapus admin.');
      }
    } catch {
      alert('Terjadi kesalahan saat menghapus.');
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            👤 Manajemen Admin
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Kelola akun administrator yang dapat mengakses panel admin.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          ➕ Admin Baru
        </button>
      </div>

      {message && (
        <div style={{ padding: '12px 16px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', color: '#38bdf8', fontSize: '13px', marginBottom: '20px' }}>
          {message}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Memuat daftar admin...</div>
      ) : (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Username</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Tanggal Dibuat</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '12px 16px', color: '#f8fafc', fontWeight: 600 }}>{a.username}</td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{new Date(a.createdAt).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleDelete(a.id, a.username)}
                      style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      🗑️ Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>Admin Baru</h2>
              <button onClick={() => setShowModal(false)} style={{ background: '#334155', border: 'none', color: '#cbd5e1', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                {isSaving ? 'Menyimpan...' : 'Simpan Admin'}
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
