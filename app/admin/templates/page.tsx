'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Template {
  id: number;
  name: string;
  category: string;
  body: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('umum');
  const [body, setBody] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Fetch templates error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openNew = () => {
    setEditing(null);
    setName('');
    setCategory('umum');
    setBody('');
    setShowModal(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setName(t.name);
    setCategory(t.category);
    setBody(t.body);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      alert('Nama dan isi template wajib diisi.');
      return;
    }
    setIsSaving(true);
    try {
      const url = editing ? '/api/templates' : '/api/templates';
      const method = editing ? 'PUT' : 'POST';
      const payload = editing
        ? { id: editing.id, name, category, body }
        : { name, category, body };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Template "${name}" berhasil disimpan.`);
        setShowModal(false);
        fetchTemplates();
      } else {
        alert(data.error || 'Gagal menyimpan template.');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Hapus template "${name}"?`)) return;
    try {
      const res = await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage(`Template "${name}" berhasil dihapus.`);
        fetchTemplates();
      } else {
        alert('Gagal menghapus template.');
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
            📝 Template Pesan WhatsApp
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Kelola library template pesan yang dapat digunakan ulang untuk broadcast dan kampanye.
          </p>
        </div>
        <button
          onClick={openNew}
          style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          ➕ Template Baru
        </button>
      </div>

      {message && (
        <div style={{ padding: '12px 16px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', color: '#38bdf8', fontSize: '13px', marginBottom: '20px' }}>
          {message}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Memuat template...</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', background: '#1e293b', borderRadius: '10px', border: '1px solid #334155' }}>
          Belum ada template. Klik "Template Baru" untuk membuat.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: '16px' }}>
          {templates.map((t) => (
            <div key={t.id} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '15px' }}>{t.name}</div>
                  <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                    {t.category}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => openEdit(t)}
                    style={{ background: '#334155', border: 'none', color: '#cbd5e1', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(t.id, t.name)}
                    style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div style={{ background: '#0f172a', borderRadius: '6px', padding: '12px', fontSize: '12px', color: '#94a3b8', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                {t.body}
              </div>
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#64748b' }}>
                Diupdate: {new Date(t.updatedAt).toLocaleString('id-ID')}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                {editing ? 'Edit Template' : 'Template Baru'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: '#334155', border: 'none', color: '#cbd5e1', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Nama Template</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Pengkinian Data Q4 2026"
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Kategori</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Contoh: pengkinian, umum, pelatihan"
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Isi Template</label>
              <textarea
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Gunakan {nama} untuk nama pegawai dan {link} untuk link portal. Spintax: {opsi1|opsi2}"
                style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', lineHeight: '1.5' }}
              />
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b' }}>
                Tag: {'{nama}'} = nama pegawai, {'{link}'} = link portal, {'{opsi1|opsi2}'} = spintax acak
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                {isSaving ? 'Menyimpan...' : 'Simpan Template'}
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
