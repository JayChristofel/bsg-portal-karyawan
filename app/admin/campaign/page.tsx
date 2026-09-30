'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

export interface RecipientRow {
  id: number;
  label: string;
  phone: string | null;
  cabang: string | null;
  message: string | null;
  waMessageId: string | null;
  waStatus: 'pending' | 'sent' | 'delivered' | 'read' | string;
  waSentAt: string | null;
  createdAt: string;
  isSubmitted?: boolean;
  formSubmittedAt?: string | null;
}

// Spintax parser: replaces {option1|option2|option3} with one random pick
function processSpintax(text: string): string {
  const spintaxRegex = /\{([^{}]+)\}/g;
  let result = text;
  let matches = spintaxRegex.exec(result);
  let iterations = 0;

  while (matches && iterations < 20) {
    iterations++;
    const fullMatch = matches[0];
    const choices = matches[1].split('|');
    // If it's a variable like {nama} or {link}, do not spin it
    if (choices.length === 1 && (choices[0].toLowerCase() === 'nama' || choices[0].toLowerCase() === 'link')) {
      // keep as is
    } else {
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      result = result.replace(fullMatch, chosen);
    }
    matches = spintaxRegex.exec(result);
  }
  return result;
}

export default function BroadcastPage() {
  const [data, setData] = useState<RecipientRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Manual input state
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Bulk send & Anti-Banned states
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [delayProfile, setDelayProfile] = useState<'safe' | 'balanced' | 'fast'>('balanced');
  const [enableCooldown, setEnableCooldown] = useState(true);
  const [cooldownCountdown, setCooldownCountdown] = useState<number | null>(null);

  // Filtering states
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'sent' | 'read' | 'submitted' | 'not_submitted'>('all');
  const [selectedCabang, setSelectedCabang] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Message template & Spintax
  const defaultTemplate =
    '{Yth.|Kepada Yth.} Bapak/Ibu {nama},\n\nSehubungan dengan *pemutakhiran data jabatan pegawai Bank SulutGo*, harap kesediaan Bapak/Ibu untuk melakukan konfirmasi jabatan dan unit kerja melalui portal resmi berikut:\n\n{link}\n\nMohon konfirmasi dilakukan paling lambat *hari ini, pukul 16.00 WITA* untuk memastikan data jabatan dan unit kerja telah sesuai.\n\nTerima kasih atas kerja samanya.\n\n*Divisi SDM / Human Capital*\n*Bank SulutGo*';

  const [msgTemplate, setMsgTemplate] = useState(defaultTemplate);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [mockupSampleName, setMockupSampleName] = useState('Andi Pratama, S.E.');
  const [mockupPreviewText, setMockupPreviewText] = useState('');

  // Excel / CSV Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<Array<{ label: string; phone: string; cabang: string }>>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sending status map for individual rows
  const [sendingMap, setSendingMap] = useState<Record<number, boolean>>({});

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const res = await fetch('/api/recipients');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-poll status updates every 8 seconds (background refresh for webhook message.ack)
    const interval = setInterval(() => {
      fetchData(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Update live mockup preview
  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://portal-pegawai.internal';
    const sampleLink = `${origin}/`;
    const spun = processSpintax(msgTemplate);
    const finalMsg = spun.replace(/\{nama\}/gi, mockupSampleName).replace(/\{link\}/gi, sampleLink);
    setMockupPreviewText(finalMsg);
  }, [msgTemplate, mockupSampleName]);

  // Action: Pull from existing Data Pegawai
  const handlePullFromPegawai = async () => {
    if (!confirm('Tarik semua data pegawai yang ada di database ke dalam daftar broadcast WhatsApp ini?')) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull_from_pegawai' }),
      });
      const json = await res.json();
      if (json.success) {
        alert(json.message || `Berhasil menarik ${json.count} pegawai.`);
        fetchData();
      } else {
        alert(json.error || 'Gagal menarik data pegawai.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Action: Register manual text targets
  const handleRegisterManual = async () => {
    const lines = inputText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!lines.length) {
      alert('Masukkan minimal satu data pegawai.');
      return;
    }

    // Support: "Nama, No WA, Cabang" or "Nama, No WA" or "Nama"
    const items = lines.map((line) => {
      const parts = line.split(',');
      return {
        label: (parts[0] || '').trim(),
        phone: (parts[1] || '').trim(),
        cabang: (parts[2] || '').trim(),
      };
    });

    setIsGenerating(true);
    try {
      const res = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.success) {
        setInputText('');
        alert(`Berhasil mendaftarkan ${json.count} penerima.`);
        fetchData();
      } else {
        alert(json.error || 'Gagal mendaftarkan penerima broadcast.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Action: Handle File Upload (Excel .xlsx/.xls or .csv)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rawJson.length < 2) {
          alert('File Excel/CSV kosong atau tidak memiliki baris data.');
          return;
        }

        // Detect column indices from header
        const headerRow: string[] = (rawJson[0] || []).map((h: any) => String(h || '').toLowerCase().trim());
        let nameIdx = headerRow.findIndex((h) => h.includes('nama') || h.includes('name') || h.includes('pegawai') || h.includes('karyawan'));
        let phoneIdx = headerRow.findIndex((h) => h.includes('phone') || h.includes('wa') || h.includes('hp') || h.includes('telepon') || h.includes('nomor') || h.includes('no'));
        let cabangIdx = headerRow.findIndex((h) => h.includes('cabang') || h.includes('unit') || h.includes('kantor') || h.includes('kcp'));

        // Fallbacks if header wasn't named standard
        if (nameIdx === -1) nameIdx = 0;
        if (phoneIdx === -1) phoneIdx = 1;
        if (cabangIdx === -1 && rawJson[0]?.length > 2) cabangIdx = 2;

        const parsedItems: Array<{ label: string; phone: string; cabang: string }> = [];

        for (let i = 1; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || row.length === 0) continue;

          const label = String(row[nameIdx] || '').trim();
          let phone = String(row[phoneIdx] || '').trim();
          const cabang = cabangIdx !== -1 ? String(row[cabangIdx] || '').trim() : '';

          // Normalize scientific notation from Excel (e.g. 6.2812E+11)
          if (phone.includes('e+') || phone.includes('E+')) {
            const num = Number(phone);
            if (!isNaN(num)) phone = num.toLocaleString('fullwide', { useGrouping: false });
          }

          if (label) {
            parsedItems.push({ label, phone, cabang });
          }
        }

        if (parsedItems.length === 0) {
          alert('Tidak ada data pegawai yang valid terbaca dari file.');
          return;
        }

        setImportPreview(parsedItems);
        setShowImportModal(true);
      } catch (err: any) {
        alert('Gagal membaca file: ' + err.message);
      }
    };

    reader.readAsBinaryString(file);
    // Reset file input so user can pick again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Action: Save imported rows from Excel/CSV
  const handleSaveImport = async () => {
    if (importPreview.length === 0) return;
    setIsImporting(true);
    try {
      const res = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: importPreview }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`Berhasil mengimpor ${json.count} penerima dari file ${importFileName}.`);
        setShowImportModal(false);
        setImportPreview([]);
        setImportFileName(null);
        fetchData();
      } else {
        alert(json.error || 'Gagal menyimpan data impor.');
      }
    } catch {
      alert('Terjadi kesalahan jaringan saat menyimpan.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus penerima ini dari daftar broadcast?')) return;
    try {
      const res = await fetch(`/api/recipients/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        fetchData();
      } else {
        alert(json.error || 'Gagal menghapus.');
      }
    } catch {
      alert('Terjadi kesalahan saat menghapus.');
    }
  };

  // Action: Send single message with Spintax
  const handleSendWA = async (row: RecipientRow) => {
    let targetPhone = row.phone;
    if (!targetPhone) {
      const phoneInput = prompt(`Masukkan nomor WhatsApp untuk ${row.label} (contoh: 08123456789):`);
      if (!phoneInput || !phoneInput.trim()) return;
      targetPhone = phoneInput.trim();
      await fetch(`/api/recipients/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone }),
      });
    }

    setSendingMap((prev) => ({ ...prev, [row.id]: true }));
    try {
      const origin = window.location.origin;
      const portalLink = `${origin}/`;
      // Process Spintax + Variable tags
      const spunTemplate = processSpintax(msgTemplate);
      const message = spunTemplate
        .replace(/\{nama\}/gi, row.label)
        .replace(/\{link\}/gi, portalLink);

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: row.id,
          phone: targetPhone,
          message,
        }),
      });

      const json = await res.json();
      if (json.isSuccess || json.code === 'SUCCESS' || json.code === 'OK' || json.message_id) {
        alert(`✅ Pesan WhatsApp berhasil dikirim ke ${row.label} (${targetPhone})!`);
        fetchData();
      } else {
        alert(`❌ Gagal mengirim: ${json.message || 'Periksa koneksi WhatsApp Gateway'}`);
      }
    } catch (err: any) {
      alert(`❌ Terjadi kesalahan: ${err.message}`);
    } finally {
      setSendingMap((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  // Action: Bulk send with Smart Delay (Anti-Banned) & Batch Cooldown
  const handleBulkSendWA = async () => {
    // Target any with phone number who hasn't been sent yet or still pending
    const targets = filteredData.filter((r) => r.phone && (r.waStatus === 'pending' || !r.waSentAt));
    if (targets.length === 0) {
      alert('Tidak ada penerima dengan nomor WhatsApp yang berstatus Pending pada filter saat ini.');
      return;
    }

    const confirmMsg = `Kirim broadcast WhatsApp ke ${targets.length} penerima berstatus Pending?\n\nPengaturan Anti-Banned:\n- Profil Jeda: ${
      delayProfile === 'safe' ? 'Aman (4-8 detik acak)' : delayProfile === 'fast' ? 'Cepat (2-3 detik)' : 'Seimbang (2-5 detik acak)'
    }\n- Cooldown: ${enableCooldown ? 'Aktif (istirahat 20s tiap 20 pesan)' : 'Nonaktif'}`;

    if (!confirm(confirmMsg)) return;

    setIsBulkSending(true);
    let successCount = 0;
    const origin = window.location.origin;
    const portalLink = `${origin}/`;

    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      setBulkProgress(`Mengirim ${i + 1} dari ${targets.length}: ${row.label} (${row.phone})...`);

      try {
        // Individual spintax variation for each recipient
        const spunTemplate = processSpintax(msgTemplate);
        const message = spunTemplate
          .replace(/\{nama\}/gi, row.label)
          .replace(/\{link\}/gi, portalLink);

        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: row.id,
            phone: row.phone,
            message,
          }),
        });

        const json = await res.json();
        if (json.isSuccess || json.code === 'SUCCESS' || json.code === 'OK' || json.message_id) {
          successCount++;
        }
      } catch {
        // continue
      }

      // Check batch cooldown (every 20 messages, pause for 20 seconds to prevent Meta flood block)
      if (enableCooldown && (i + 1) % 20 === 0 && i + 1 < targets.length) {
        for (let cd = 20; cd > 0; cd--) {
          setCooldownCountdown(cd);
          setBulkProgress(`Anti-Spam Cooldown: Beristirahat ${cd} detik sebelum melanjutkan batch berikutnya...`);
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCooldownCountdown(null);
      } else {
        // Smart Randomized Delay calculation
        let delayMs = 3000;
        if (delayProfile === 'safe') {
          delayMs = Math.floor(Math.random() * (8000 - 4000 + 1)) + 4000; // 4 - 8 sec
        } else if (delayProfile === 'fast') {
          delayMs = Math.floor(Math.random() * (3000 - 2000 + 1)) + 2000; // 2 - 3 sec
        } else {
          delayMs = Math.floor(Math.random() * (5000 - 2500 + 1)) + 2500; // 2.5 - 5 sec (Balanced)
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    setIsBulkSending(false);
    setBulkProgress(null);
    alert(`Broadcast selesai. Berhasil mengirim ke ${successCount} dari ${targets.length} penerima.`);
    fetchData();
  };

  // Metrics computation
  const total = data.length;
  const pendingCount = data.filter((r) => !r.waStatus || r.waStatus === 'pending').length;
  const sentCount = data.filter((r) => r.waStatus === 'sent' || r.waStatus === 'delivered').length;
  const readCount = data.filter((r) => r.waStatus === 'read').length;
  const submittedCount = data.filter((r) => r.isSubmitted).length;
  const readRate = total - pendingCount > 0 ? Math.round((readCount / (total - pendingCount)) * 100) : 0;
  const submitRate = total > 0 ? Math.round((submittedCount / total) * 100) : 0;

  // Extract unique cabang list for dropdown filter
  const cabangList = Array.from(new Set(data.map((r) => r.cabang).filter(Boolean))).sort() as string[];

  // Filtering data
  const filteredData = data.filter((row) => {
    // Tab filter
    if (activeTab === 'pending' && row.waStatus && row.waStatus !== 'pending') return false;
    if (activeTab === 'sent' && row.waStatus !== 'sent' && row.waStatus !== 'delivered') return false;
    if (activeTab === 'read' && row.waStatus !== 'read') return false;
    if (activeTab === 'submitted' && !row.isSubmitted) return false;
    if (activeTab === 'not_submitted' && row.isSubmitted) return false;

    // Cabang filter
    if (selectedCabang && row.cabang !== selectedCabang) return false;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchLabel = row.label.toLowerCase().includes(q);
      const matchPhone = (row.phone || '').toLowerCase().includes(q);
      const matchCabang = (row.cabang || '').toLowerCase().includes(q);
      return matchLabel || matchPhone || matchCabang;
    }
    return true;
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'read':
        return (
          <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>✓✓</span> Dibaca
          </span>
        );
      case 'delivered':
        return (
          <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>✓✓</span> Terkirim (Diterima)
          </span>
        );
      case 'sent':
        return (
          <span style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', border: '1px solid rgba(14, 165, 233, 0.3)', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>✓</span> Terkirim ke Server
          </span>
        );
      case 'pending':
      default:
        return (
          <span style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>⏳</span> Pending
          </span>
        );
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Hidden file input for Excel / CSV */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
      />

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>
            📢 Broadcast WhatsApp &amp; Anti-Spam Control
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Kirim siaran pesan pemutakhiran data jabatan pegawai Bank SulutGo dengan proteksi anti-banned, variasi spintax, dan pelacakan status hingga pengisian form.
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => fetchData()}
            style={{
              background: '#1e293b',
              color: '#cbd5e1',
              padding: '9px 13px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #334155',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={handlePullFromPegawai}
            disabled={isGenerating}
            style={{
              background: '#0369a1',
              color: '#f8fafc',
              padding: '9px 13px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            👥 Tarik Data Pegawai
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: '#0f766e',
              color: '#f8fafc',
              padding: '9px 13px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📂 Import Excel / CSV
          </button>
          <button
            onClick={() => setShowTemplateModal(true)}
            style={{
              background: '#334155',
              color: '#f8fafc',
              padding: '9px 13px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📱 Template &amp; Mockup WA
          </button>
          <button
            onClick={handleBulkSendWA}
            disabled={isBulkSending}
            style={{
              background: '#25d366',
              color: '#0f172a',
              padding: '9px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isBulkSending ? 'Mengirim Broadcast...' : '🚀 Mulai Kirim Massal'}
          </button>
        </div>
      </div>

      {/* Bulk Progress & Cooldown Alert */}
      {bulkProgress && (
        <div style={{ padding: '14px 18px', background: cooldownCountdown ? 'rgba(234, 179, 8, 0.15)' : 'rgba(37, 211, 102, 0.15)', border: `1px solid ${cooldownCountdown ? 'rgba(234, 179, 8, 0.4)' : 'rgba(37, 211, 102, 0.4)'}`, borderRadius: '8px', color: cooldownCountdown ? '#facc15' : '#4ade80', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>{cooldownCountdown ? '☕' : '⏳'}</span>
          <span style={{ fontWeight: 600 }}>{bulkProgress}</span>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Total Target Broadcast</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#f8fafc' }}>{total}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>Penerima terdaftar</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#facc15', marginBottom: '4px' }}>⏳ Chat Pending</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#facc15' }}>{pendingCount}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>Belum dikirimkan</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#38bdf8', marginBottom: '4px' }}>📤 Chat Terkirim</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#38bdf8' }}>{sentCount}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>Terkirim / diterima HP</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#4ade80', marginBottom: '4px' }}>👁️ Chat Dibaca</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#4ade80' }}>{readCount}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b' }}>Centang dua biru ({readRate}%)</div>
        </div>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: '#10b981', marginBottom: '4px' }}>🟢 Sudah Isi Formulir</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#10b981' }}>{submittedCount}</div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#34d399' }}>Tingkat respon: {submitRate}%</div>
        </div>
      </div>

      {/* Anti-Banned & Sending Engine Controls Card */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🛡️</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
              Proteksi Anti-Banned &amp; Smart Delay WhatsApp
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Mencegah pemblokiran akun dengan jeda acak manusiawi dan istirahat berkala.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Profil Jeda:</span>
            <select
              value={delayProfile}
              onChange={(e) => setDelayProfile(e.target.value as any)}
              style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '6px 10px', fontSize: '12px' }}
            >
              <option value="safe">🛡️ Aman (4 - 8 detik acak)</option>
              <option value="balanced">⚡ Seimbang (2.5 - 5 detik acak - Direkomendasikan)</option>
              <option value="fast">🚀 Cepat (2 - 3 detik)</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enableCooldown}
              onChange={(e) => setEnableCooldown(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Batch Cooldown (Istirahat 20s tiap 20 pesan)</span>
          </label>
        </div>
      </div>

      {/* Manual Input Registration Card */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
            Input Manual Penerima (Format: <code>Nama Pegawai, Nomor WA, Kantor Cabang</code>)
          </label>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Atau gunakan tombol <b>📂 Import Excel / CSV</b> di atas
          </span>
        </div>
        <textarea
          rows={3}
          placeholder={'Budi Santoso, 081234567890, Cabang Utama Manado\nSiti Aminah, 085298765432, Cabang Tomohon\nRudi Hartono, 082154488769, Kantor Pusat'}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', marginBottom: '12px' }}
        />
        <button
          onClick={handleRegisterManual}
          disabled={isGenerating}
          style={{
            background: '#0078d4',
            color: '#fff',
            padding: '9px 18px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isGenerating ? 'Mendaftarkan...' : '➕ Daftarkan Baris Ini'}
        </button>
      </div>

      {/* Filter Tabs, Cabang Dropdown, and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', background: '#1e293b', padding: '4px', borderRadius: '8px', border: '1px solid #334155', flexWrap: 'wrap', maxWidth: '100%' }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              background: activeTab === 'all' ? '#0078d4' : 'transparent',
              color: activeTab === 'all' ? '#fff' : '#94a3b8',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Semua ({total})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              background: activeTab === 'pending' ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
              color: activeTab === 'pending' ? '#facc15' : '#94a3b8',
              border: activeTab === 'pending' ? '1px solid rgba(234, 179, 8, 0.4)' : 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⏳ Pending ({pendingCount})
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            style={{
              background: activeTab === 'sent' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: activeTab === 'sent' ? '#38bdf8' : '#94a3b8',
              border: activeTab === 'sent' ? '1px solid rgba(56, 189, 248, 0.4)' : 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📤 Terkirim ({sentCount})
          </button>
          <button
            onClick={() => setActiveTab('read')}
            style={{
              background: activeTab === 'read' ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
              color: activeTab === 'read' ? '#4ade80' : '#94a3b8',
              border: activeTab === 'read' ? '1px solid rgba(34, 197, 94, 0.4)' : 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            👁️ Dibaca ({readCount})
          </button>
          <button
            onClick={() => setActiveTab('submitted')}
            style={{
              background: activeTab === 'submitted' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: activeTab === 'submitted' ? '#34d399' : '#94a3b8',
              border: activeTab === 'submitted' ? '1px solid rgba(16, 185, 129, 0.4)' : 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🟢 Sudah Isi Form ({submittedCount})
          </button>
          <button
            onClick={() => setActiveTab('not_submitted')}
            style={{
              background: activeTab === 'not_submitted' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              color: activeTab === 'not_submitted' ? '#f87171' : '#94a3b8',
              border: activeTab === 'not_submitted' ? '1px solid rgba(239, 68, 68, 0.4)' : 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⚪ Belum Isi Form ({total - submittedCount})
          </button>
        </div>

        {/* Filters: Cabang & Search */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {cabangList.length > 0 && (
            <select
              value={selectedCabang}
              onChange={(e) => setSelectedCabang(e.target.value)}
              style={{
                padding: '8px 12px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '13px',
              }}
            >
              <option value="">Semua Cabang / Unit Kerja</option>
              {cabangList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <input
            type="text"
            placeholder="Cari nama, nomor, atau cabang..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 14px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '13px',
              minWidth: '220px',
            }}
          />
        </div>
      </div>

      {/* Broadcast Recipients Table */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Pegawai</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Cabang / Unit</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>No. WhatsApp</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Status Chat WA</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Status Form</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600 }}>Waktu Terkirim</th>
                <th style={{ padding: '12px 14px', color: '#94a3b8', fontWeight: 600, textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    Memuat data broadcast...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    {searchQuery || selectedCabang ? 'Tidak ada data yang cocok dengan kriteria filter.' : 'Belum ada penerima pada kategori ini.'}
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const isSendingThis = sendingMap[row.id];
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{row.label}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          ID #{row.id}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                        {row.cabang ? (
                          <span>{row.cabang}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {row.phone ? (
                          <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{row.phone}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>- Belum ada nomor -</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {getStatusBadge(row.waStatus)}
                      </td>
                      {/* Status Form Submission */}
                      <td style={{ padding: '12px 14px' }}>
                        {row.isSubmitted ? (
                          <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span>🟢</span> Sudah Mengisi
                          </span>
                        ) : (
                          <span style={{ background: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span>⚪</span> Belum Mengisi
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1', fontSize: '12px' }}>
                        {row.waSentAt ? new Date(row.waSentAt).toLocaleString('id-ID') : '-'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            onClick={() => handleSendWA(row)}
                            disabled={isSendingThis}
                            title="Kirim Pesan WhatsApp"
                            style={{
                              background: '#25d366',
                              color: '#0f172a',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {isSendingThis ? '...' : '📲 Kirim'}
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            title="Hapus Penerima"
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              color: '#f87171',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            🗑️
                          </button>
                        </div>
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
      {/* MODAL 1: TEMPLATE PESAN & LIVE SMARTPHONE MOCKUP PREVIEW                  */}
      {/* ========================================================================= */}
      {showTemplateModal && (
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
          onClick={() => setShowTemplateModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '920px',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                  📱 Editor Template &amp; Live Mockup WhatsApp
                </h2>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  Didukung Spintax acak <code>{'{opsi1|opsi2}'}</code> untuk variasi teks otomatis anti-spam.
                </div>
              </div>
              <button
                onClick={() => setShowTemplateModal(false)}
                style={{ background: '#334155', border: 'none', color: '#cbd5e1', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            {/* Two Column Layout: Editor (Left) & Phone Mockup (Right) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '20px' }}>
              {/* Left Column: Editor */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  Teks Template Pesan:
                </label>
                <textarea
                  rows={11}
                  value={msgTemplate}
                  onChange={(e) => setMsgTemplate(e.target.value)}
                  style={{ width: '100%', padding: '12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', lineHeight: '1.5' }}
                />

                {/* Spintax Quick Helper */}
                <div style={{ marginTop: '10px', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '11px', color: '#94a3b8' }}>
                  <b style={{ color: '#38bdf8' }}>💡 Panduan Tag Dinamis:</b>
                  <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
                    <li><code>{'{nama}'}</code>: Digantikan nama lengkap pegawai.</li>
                    <li><code>{'{link}'}</code>: Digantikan link portal publik konfirmasi jabatan.</li>
                    <li><code>{'{Yth.|Kepada Yth.}'}</code>: Spintax acak (memilih satu secara random per pegawai).</li>
                  </ul>
                </div>

                <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => {
                      setShowTemplateModal(false);
                      alert('Template pesan berhasil disimpan.');
                    }}
                    style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Simpan Template
                  </button>
                  <button
                    onClick={() => setMsgTemplate(defaultTemplate)}
                    style={{ background: '#334155', color: '#cbd5e1', border: 'none', padding: '9px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Reset Default
                  </button>
                </div>
              </div>

              {/* Right Column: WhatsApp Smartphone Mockup */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#4ade80' }}>
                    Preview Tampilan di Layar HP Target:
                  </label>
                  <button
                    onClick={() => {
                      // Trigger spintax re-spin
                      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://portal-pegawai.internal';
                      const spun = processSpintax(msgTemplate);
                      setMockupPreviewText(spun.replace(/\{nama\}/gi, mockupSampleName).replace(/\{link\}/gi, `${origin}/`));
                    }}
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#38bdf8', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                  >
                    🎲 Acak Spintax Baru
                  </button>
                </div>

                {/* Smartphone Device Frame */}
                <div
                  style={{
                    background: '#0b141a',
                    border: '8px solid #1f2c34',
                    borderRadius: '28px',
                    overflow: 'hidden',
                    boxShadow: '0 15px 35px rgba(0,0,0,0.6)',
                    fontFamily: '"Segoe UI", Helvetica, Arial, sans-serif',
                  }}
                >
                  {/* WhatsApp Chat Header */}
                  <div style={{ background: '#202c33', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>
                      BSG
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#e9edef', fontSize: '13px', fontWeight: 600 }}>Bank SulutGo SDM</div>
                      <div style={{ color: '#8696a0', fontSize: '10px' }}>Akun Resmi / Online</div>
                    </div>
                  </div>

                  {/* WhatsApp Chat Wallpaper & Message Bubble Area */}
                  <div
                    style={{
                      background: '#0b141a',
                      backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 0)',
                      backgroundSize: '16px 16px',
                      padding: '16px 12px',
                      minHeight: '260px',
                    }}
                  >
                    {/* Date pill */}
                    <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                      <span style={{ background: '#182229', color: '#8696a0', padding: '3px 10px', borderRadius: '6px', fontSize: '10px' }}>
                        HARI INI
                      </span>
                    </div>

                    {/* Received Message Bubble */}
                    <div
                      style={{
                        background: '#005c4b',
                        color: '#e9edef',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '12px',
                        lineHeight: '1.45',
                        maxWidth: '92%',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        position: 'relative',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {mockupPreviewText}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '10px', color: '#8696a0' }}>
                        <span>09:15</span>
                        <span style={{ color: '#53bdeb' }}>✓✓</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sample Name Switcher */}
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
                  <span>Contoh Nama Target:</span>
                  <input
                    type="text"
                    value={mockupSampleName}
                    onChange={(e) => setMockupSampleName(e.target.value)}
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#f8fafc', padding: '2px 6px', fontSize: '11px' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EXCEL / CSV IMPORT CONFIRMATION & PREVIEW MODAL                  */}
      {/* ========================================================================= */}
      {showImportModal && (
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
          onClick={() => setShowImportModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '650px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                  Konfirmasi Import Data File
                </h2>
                <div style={{ fontSize: '12px', color: '#38bdf8', marginTop: '2px' }}>
                  File: {importFileName} &bull; Terdeteksi: {importPreview.length} pegawai
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                style={{ background: '#334155', border: 'none', color: '#cbd5e1', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#cbd5e1' }}>
              Berikut adalah pratinjau 5 data pertama yang akan ditambahkan ke daftar broadcast:
            </p>

            <div style={{ background: '#0f172a', borderRadius: '8px', border: '1px solid #334155', overflow: 'hidden', marginBottom: '18px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '8px 12px', color: '#94a3b8' }}>Nama Pegawai</th>
                    <th style={{ padding: '8px 12px', color: '#94a3b8' }}>No. WhatsApp</th>
                    <th style={{ padding: '8px 12px', color: '#94a3b8' }}>Cabang / Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 5).map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px 12px', color: '#f8fafc', fontWeight: 500 }}>{row.label}</td>
                      <td style={{ padding: '8px 12px', color: '#38bdf8', fontFamily: 'monospace' }}>{row.phone || '-'}</td>
                      <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{row.cabang || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.length > 5 && (
                <div style={{ padding: '8px 12px', fontSize: '11px', color: '#64748b', textAlign: 'center', background: '#0b1120' }}>
                  ...dan {importPreview.length - 5} pegawai lainnya
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowImportModal(false)}
                style={{ background: '#334155', color: '#cbd5e1', border: 'none', padding: '9px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={handleSaveImport}
                disabled={isImporting}
                style={{ background: '#0f766e', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                {isImporting ? 'Mengimpor...' : `✅ Impor ${importPreview.length} Pegawai`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
