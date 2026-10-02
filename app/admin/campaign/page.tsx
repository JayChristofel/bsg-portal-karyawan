'use client';

import * as React from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Building2,
  Clock,
  Eye,
  FileSpreadsheet,
  Gauge,
  Loader2,
  Megaphone,
  MessageSquareText,
  PauseCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Timer,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, MetricCard, PageHeader, SectionCard, StatusBadge } from '../components/ui';
import { cn } from '@/lib/utils';

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

const DEFAULT_TEMPLATE =
  '{Yth.|Kepada Yth.} Bapak/Ibu {nama},\n\nSehubungan dengan *pemutakhiran data jabatan pegawai Bank SulutGo*, harap kesediaan Bapak/Ibu untuk melakukan konfirmasi jabatan dan unit kerja melalui portal resmi berikut:\n\n{link}\n\nMohon konfirmasi dilakukan paling lambat *hari ini, pukul 16.00 WITA* untuk memastikan data jabatan dan unit kerja telah sesuai.\n\nTerima kasih atas kerja samanya.\n\n*Divisi SDM / Human Capital*\n*Bank SulutGo*';

/** Spintax: replaces {a|b|c} with one random pick; leaves {nama}/{link} intact. */
function processSpintax(text: string): string {
  const spintaxRegex = /\{([^{}]+)\}/g;
  let result = text;
  let matches = spintaxRegex.exec(result);
  let iterations = 0;

  while (matches && iterations < 20) {
    iterations++;
    const fullMatch = matches[0];
    const choices = matches[1].split('|');
    const isVariable =
      choices.length === 1 &&
      (choices[0].toLowerCase() === 'nama' || choices[0].toLowerCase() === 'link');
    if (!isVariable) {
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      result = result.replace(fullMatch, chosen);
    }
    matches = spintaxRegex.exec(result);
  }
  return result;
}

type DelayProfile = 'safe' | 'balanced' | 'fast';
type FilterTab = 'all' | 'pending' | 'sent' | 'read' | 'submitted' | 'not_submitted';

const TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Terkirim' },
  { value: 'read', label: 'Dibaca' },
  { value: 'submitted', label: 'Sudah Isi Form' },
  { value: 'not_submitted', label: 'Belum Isi Form' },
];

const DELAY_META: Record<DelayProfile, { label: string; range: string }> = {
  safe: { label: 'Aman', range: '4–8 detik acak' },
  balanced: { label: 'Seimbang', range: '2,5–5 detik acak' },
  fast: { label: 'Cepat', range: '2–3 detik' },
};

const TONE_OK: React.CSSProperties = { background: 'transparent', color: '#e9edef' };

export default function BroadcastPage() {
  const [data, setData] = React.useState<RecipientRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const [inputText, setInputText] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);

  const [isBulkSending, setIsBulkSending] = React.useState(false);
  const [bulkProgress, setBulkProgress] = React.useState<string | null>(null);
  const [delayProfile, setDelayProfile] = React.useState<DelayProfile>('balanced');
  const [enableCooldown, setEnableCooldown] = React.useState(true);
  const [cooldownCountdown, setCooldownCountdown] = React.useState<number | null>(null);

  const [activeTab, setActiveTab] = React.useState<FilterTab>('all');
  const [selectedCabang, setSelectedCabang] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  const [msgTemplate, setMsgTemplate] = React.useState(DEFAULT_TEMPLATE);
  const [showTemplateModal, setShowTemplateModal] = React.useState(false);
  const [mockupSampleName, setMockupSampleName] = React.useState('Andi Pratama, S.E.');
  const [mockupPreviewText, setMockupPreviewText] = React.useState('');

  const [showImportModal, setShowImportModal] = React.useState(false);
  const [importPreview, setImportPreview] = React.useState<
    Array<{ label: string; phone: string; cabang: string }>
  >([]);
  const [importFileName, setImportFileName] = React.useState<string | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [sendingMap, setSendingMap] = React.useState<Record<number, boolean>>({});
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const fetchData = React.useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const res = await fetch('/api/recipients', { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
    const interval = window.setInterval(() => void fetchData(true), 8000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  // Live mockup preview
  React.useEffect(() => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://portal-pegawai.internal';
    const spun = processSpintax(msgTemplate);
    setMockupPreviewText(
      spun.replace(/\{nama\}/gi, mockupSampleName).replace(/\{link\}/gi, `${origin}/`),
    );
  }, [msgTemplate, mockupSampleName]);

  const handlePullFromPegawai = async () => {
    if (
      !window.confirm(
        'Tarik semua data pegawai yang ada di database ke dalam daftar broadcast WhatsApp ini?',
      )
    )
      return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull_from_pegawai' }),
      });
      const json = await res.json();
      if (json.success) {
        setNotice({ tone: 'ok', text: json.message || `Berhasil menarik ${json.count} pegawai.` });
        void fetchData();
      } else {
        setNotice({ tone: 'err', text: json.error || 'Gagal menarik data pegawai.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'Terjadi kesalahan jaringan.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegisterManual = async () => {
    const lines = inputText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!lines.length) {
      setNotice({ tone: 'err', text: 'Masukkan minimal satu data pegawai.' });
      return;
    }

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
        setNotice({ tone: 'ok', text: `Berhasil mendaftarkan ${json.count} penerima.` });
        void fetchData();
      } else {
        setNotice({ tone: 'err', text: json.error || 'Gagal mendaftarkan penerima broadcast.' });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawJson: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rawJson.length < 2) {
          setNotice({ tone: 'err', text: 'File Excel/CSV kosong atau tidak memiliki baris data.' });
          return;
        }

        const headerRow: string[] = (rawJson[0] || []).map((h) =>
          String(h || '').toLowerCase().trim(),
        );
        let nameIdx = headerRow.findIndex(
          (h) => h.includes('nama') || h.includes('name') || h.includes('pegawai') || h.includes('karyawan'),
        );
        let phoneIdx = headerRow.findIndex(
          (h) =>
            h.includes('phone') ||
            h.includes('wa') ||
            h.includes('hp') ||
            h.includes('telepon') ||
            h.includes('nomor') ||
            h.includes('no'),
        );
        let cabangIdx = headerRow.findIndex(
          (h) => h.includes('cabang') || h.includes('unit') || h.includes('kantor') || h.includes('kcp'),
        );

        if (nameIdx === -1) nameIdx = 0;
        if (phoneIdx === -1) phoneIdx = 1;
        if (cabangIdx === -1 && rawJson[0]?.length > 2) cabangIdx = 2;

        const parsed: Array<{ label: string; phone: string; cabang: string }> = [];
        for (let i = 1; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || row.length === 0) continue;

          const label = String(row[nameIdx] || '').trim();
          let phone = String(row[phoneIdx] || '').trim();
          const cabang = cabangIdx !== -1 ? String(row[cabangIdx] || '').trim() : '';

          // Normalize scientific notation from Excel (e.g. 6.2812E+11)
          if (phone.includes('e+') || phone.includes('E+')) {
            const num = Number(phone);
            if (!Number.isNaN(num)) phone = num.toLocaleString('fullwide', { useGrouping: false });
          }

          if (label) parsed.push({ label, phone, cabang });
        }

        if (parsed.length === 0) {
          setNotice({ tone: 'err', text: 'Tidak ada data pegawai yang valid terbaca dari file.' });
          return;
        }

        setImportPreview(parsed);
        setShowImportModal(true);
      } catch (err) {
        setNotice({ tone: 'err', text: `Gagal membaca file: ${(err as Error).message}` });
      }
    };

    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
        setNotice({
          tone: 'ok',
          text: `Berhasil mengimpor ${json.count} penerima dari file ${importFileName}.`,
        });
        setShowImportModal(false);
        setImportPreview([]);
        setImportFileName(null);
        void fetchData();
      } else {
        setNotice({ tone: 'err', text: json.error || 'Gagal menyimpan data impor.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'Terjadi kesalahan jaringan saat menyimpan.' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Hapus penerima ini dari daftar broadcast?')) return;
    try {
      const res = await fetch(`/api/recipients/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) void fetchData();
      else setNotice({ tone: 'err', text: json.error || 'Gagal menghapus.' });
    } catch {
      setNotice({ tone: 'err', text: 'Terjadi kesalahan saat menghapus.' });
    }
  };

  const handleSendWA = async (row: RecipientRow) => {
    let targetPhone = row.phone;
    if (!targetPhone) {
      const phoneInput = window.prompt(
        `Masukkan nomor WhatsApp untuk ${row.label} (contoh: 08123456789):`,
      );
      if (!phoneInput?.trim()) return;
      targetPhone = phoneInput.trim();
      await fetch(`/api/recipients/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone }),
      });
    }

    setSendingMap((prev) => ({ ...prev, [row.id]: true }));
    try {
      const portalLink = `${window.location.origin}/`;
      const message = processSpintax(msgTemplate)
        .replace(/\{nama\}/gi, row.label)
        .replace(/\{link\}/gi, portalLink);

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: row.id, phone: targetPhone, message }),
      });

      const json = await res.json();
      if (json.isSuccess || json.code === 'SUCCESS' || json.code === 'OK' || json.message_id) {
        setNotice({
          tone: 'ok',
          text: `Pesan WhatsApp berhasil dikirim ke ${row.label} (${targetPhone}).`,
        });
        void fetchData();
      } else {
        setNotice({
          tone: 'err',
          text: `Gagal mengirim: ${json.message || 'Periksa koneksi WhatsApp Gateway'}`,
        });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Terjadi kesalahan: ${(err as Error).message}` });
    } finally {
      setSendingMap((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const handleBulkSendWA = async () => {
    const targets = filteredData.filter((r) => r.phone && (r.waStatus === 'pending' || !r.waSentAt));
    if (targets.length === 0) {
      setNotice({
        tone: 'err',
        text: 'Tidak ada penerima dengan nomor WhatsApp yang berstatus Pending pada filter saat ini.',
      });
      return;
    }

    const confirmMsg = `Kirim broadcast WhatsApp ke ${targets.length} penerima berstatus Pending?\n\nPengaturan Anti-Banned:\n- Profil Jeda: ${DELAY_META[delayProfile].label} (${DELAY_META[delayProfile].range})\n- Cooldown: ${enableCooldown ? 'Aktif (istirahat 20s tiap 20 pesan)' : 'Nonaktif'}`;

    if (!window.confirm(confirmMsg)) return;

    setIsBulkSending(true);
    let successCount = 0;
    const portalLink = `${window.location.origin}/`;

    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      setBulkProgress(`Mengirim ${i + 1} dari ${targets.length}: ${row.label} (${row.phone})…`);

      try {
        const message = processSpintax(msgTemplate)
          .replace(/\{nama\}/gi, row.label)
          .replace(/\{link\}/gi, portalLink);

        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientId: row.id, phone: row.phone, message }),
        });

        const json = await res.json();
        if (json.isSuccess || json.code === 'SUCCESS' || json.code === 'OK' || json.message_id) {
          successCount++;
        }
      } catch {
        // continue to next recipient
      }

      if (enableCooldown && (i + 1) % 20 === 0 && i + 1 < targets.length) {
        for (let cd = 20; cd > 0; cd--) {
          setCooldownCountdown(cd);
          setBulkProgress(
            `Anti-Spam Cooldown: Beristirahat ${cd} detik sebelum melanjutkan batch berikutnya…`,
          );
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCooldownCountdown(null);
      } else {
        let delayMs = 3000;
        if (delayProfile === 'safe') delayMs = Math.floor(Math.random() * 4001) + 4000;
        else if (delayProfile === 'fast') delayMs = Math.floor(Math.random() * 1001) + 2000;
        else delayMs = Math.floor(Math.random() * 2501) + 2500;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    setIsBulkSending(false);
    setBulkProgress(null);
    setNotice({
      tone: 'ok',
      text: `Broadcast selesai. Berhasil mengirim ke ${successCount} dari ${targets.length} penerima.`,
    });
    void fetchData();
  };

  /* ── Derived ─────────────────────────────────────────────── */

  const total = data.length;
  const pendingCount = data.filter((r) => !r.waStatus || r.waStatus === 'pending').length;
  const sentCount = data.filter((r) => r.waStatus === 'sent' || r.waStatus === 'delivered').length;
  const readCount = data.filter((r) => r.waStatus === 'read').length;
  const submittedCount = data.filter((r) => r.isSubmitted).length;
  const readRate = total - pendingCount > 0 ? Math.round((readCount / (total - pendingCount)) * 100) : 0;
  const submitRate = total > 0 ? Math.round((submittedCount / total) * 100) : 0;

  const cabangList = React.useMemo(
    () => Array.from(new Set(data.map((r) => r.cabang).filter(Boolean))).sort() as string[],
    [data],
  );

  const filteredData = React.useMemo(
    () =>
      data.filter((row) => {
        if (activeTab === 'pending' && row.waStatus && row.waStatus !== 'pending') return false;
        if (activeTab === 'sent' && row.waStatus !== 'sent' && row.waStatus !== 'delivered') return false;
        if (activeTab === 'read' && row.waStatus !== 'read') return false;
        if (activeTab === 'submitted' && !row.isSubmitted) return false;
        if (activeTab === 'not_submitted' && row.isSubmitted) return false;
        if (selectedCabang !== 'all' && row.cabang !== selectedCabang) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            row.label.toLowerCase().includes(q) ||
            (row.phone || '').toLowerCase().includes(q) ||
            (row.cabang || '').toLowerCase().includes(q)
          );
        }
        return true;
      }),
    [data, activeTab, selectedCabang, searchQuery],
  );

  const pendingTargets = React.useMemo(
    () => filteredData.filter((r) => r.phone && (r.waStatus === 'pending' || !r.waSentAt)).length,
    [filteredData],
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileUpload}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <PageHeader
        title="Broadcast WhatsApp"
        description="Kelola penerima, atur anti-ban, dan kirim pesan massal dengan spintax."
        actions={
          <>
            <Button variant="outline" onClick={() => setShowTemplateModal(true)}>
              <MessageSquareText aria-hidden="true" />
              Template Pesan
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload aria-hidden="true" />
              Import File
            </Button>
            <Button onClick={() => void handleBulkSendWA()} disabled={isBulkSending || pendingTargets === 0}>
              {isBulkSending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Megaphone aria-hidden="true" />
              )}
              Broadcast {pendingTargets > 0 ? `(${pendingTargets})` : ''}
            </Button>
          </>
        }
      />

      {notice ? (
        <div
          role="status"
          className={cn(
            'mb-4 rounded-lg border px-4 py-3 text-sm',
            notice.tone === 'ok'
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-destructive/30 bg-destructive/10 text-destructive',
          )}
        >
          {notice.text}
        </div>
      ) : null}

      {bulkProgress ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center gap-2.5 rounded-lg border border-chart-2/30 bg-chart-2/10 px-4 py-3 text-sm text-chart-2"
        >
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          <span className="flex-1 tabular">{bulkProgress}</span>
          {cooldownCountdown !== null ? (
            <Badge variant="outline" className="border-chart-3/30 bg-chart-3/10 text-[10px] text-chart-3">
              <PauseCircle className="size-3" aria-hidden="true" />
              {cooldownCountdown}s
            </Badge>
          ) : null}
        </div>
      ) : null}

      {/* Metrics */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total Penerima" value={total} icon={Users} loading={isLoading} />
        <MetricCard label="Pending" value={pendingCount} icon={Clock} loading={isLoading} />
        <MetricCard label="Terkirim" value={sentCount} icon={Send} loading={isLoading} />
        <MetricCard label="Dibaca" value={readCount} icon={Eye} loading={isLoading} />
        <MetricCard label="Read Rate" value={`${readRate}%`} icon={Gauge} loading={isLoading} />
        <MetricCard label="Sudah Isi Form" value={submittedCount} icon={UserCheck} hint={`${submitRate}%`} loading={isLoading} />
      </div>

      {/* Anti-ban engine */}
      <SectionCard
        title="Anti-Banned & Sending Engine"
        description="Jeda acak antar pesan dan batch cooldown untuk mencegah pemblokiran akun oleh Meta."
        className="mb-4"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="delay-profile">Profil Jeda Pengiriman</Label>
            <Select
              value={delayProfile}
              onValueChange={(v) => setDelayProfile(v as DelayProfile)}
              disabled={isBulkSending}
            >
              <SelectTrigger id="delay-profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DELAY_META) as DelayProfile[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {DELAY_META[k].label} — {DELAY_META[k].range}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cooldown-toggle">Batch Cooldown</Label>
            <button
              id="cooldown-toggle"
              type="button"
              role="switch"
              aria-checked={enableCooldown}
              disabled={isBulkSending}
              onClick={() => setEnableCooldown((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-input bg-transparent px-3 py-2 text-left transition-colors hover:bg-secondary/40 disabled:opacity-50"
            >
              <span className="text-sm text-foreground">
                Istirahat 20 detik setiap 20 pesan
              </span>
              <span
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                  enableCooldown ? 'bg-accent' : 'bg-muted',
                )}
                aria-hidden="true"
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform',
                    enableCooldown ? 'translate-x-4' : 'translate-x-0',
                  )}
                />
              </span>
            </button>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-px size-3 shrink-0 text-accent" aria-hidden="true" />
          Saat aktif, proses berhenti otomatis setiap 20 pesan selama 20 detik. Jangan tutup tab selama
          broadcast berjalan.
        </p>
      </SectionCard>

      {/* Registration */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Tarik dari Data Pegawai"
          description="Masukkan seluruh pegawai yang sudah submit form ke daftar broadcast."
        >
          <Button onClick={() => void handlePullFromPegawai()} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Building2 aria-hidden="true" />
            )}
            Tarik Semua Data Pegawai
          </Button>
        </SectionCard>

        <SectionCard
          title="Pendaftaran Manual"
          description="Format satu baris per pegawai: Nama, No. WhatsApp, Cabang"
        >
          <div className="space-y-3">
            <textarea
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={'Andi Pratama, 08123456789, Kantor Pusat\nBudi Santoso, 08129876543, KCP Manado'}
              aria-label="Data penerima manual"
              className="tabular w-full resize-vertical rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <Button onClick={() => void handleRegisterManual()} disabled={isGenerating || !inputText.trim()}>
              {isGenerating ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus aria-hidden="true" />
              )}
              Daftarkan Manual
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* Filters */}
      <SectionCard bodyClassName="p-3 sm:p-3">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const active = activeTab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setActiveTab(t.value)}
                aria-pressed={active}
                className={cn(
                  'min-h-8 cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'border-accent/30 bg-accent/12 text-accent'
                    : 'border-border/70 text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, nomor, atau cabang…"
              className="pl-9"
              aria-label="Cari penerima"
            />
          </div>
          <Select value={selectedCabang} onValueChange={setSelectedCabang}>
            <SelectTrigger className="sm:w-64" aria-label="Filter cabang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Cabang ({total})</SelectItem>
              {cabangList.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {/* Recipients table */}
      <SectionCard
        title={`Daftar Penerima (${filteredData.length})`}
        description="Kirim pesan per penerima atau gunakan Broadcast Massal di atas"
        className="mt-4"
        bodyClassName="p-0 sm:p-0"
      >
        {isLoading ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : filteredData.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Belum ada penerima"
            description="Tarik dari data pegawai, daftarkan manual, atau import dari file Excel/CSV."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nama</TableHead>
                  <TableHead>No. WhatsApp</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Status WA</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((row) => {
                  const sending = Boolean(sendingMap[row.id]);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                      <TableCell className="tabular text-chart-2">
                        {row.phone || <span className="text-muted-foreground">— belum ada</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.cabang || '-'}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.waStatus} />
                      </TableCell>
                      <TableCell>
                        {row.isSubmitted ? (
                          <Badge
                            variant="outline"
                            className="border-accent/30 bg-accent/10 text-[10px] text-accent"
                          >
                            Sudah
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Belum</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleSendWA(row)}
                            disabled={sending || isBulkSending}
                          >
                            {sending ? (
                              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Send aria-hidden="true" />
                            )}
                            Kirim
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => void handleDelete(row.id)}
                            aria-label={`Hapus ${row.label}`}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* ── Template modal with phone mockup ─────────────────── */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-base">Template Pesan &amp; Pratinjau</DialogTitle>
            <DialogDescription>
              Tag: <code className="tabular">{'{nama}'}</code>,{' '}
              <code className="tabular">{'{link}'}</code>, spintax{' '}
              <code className="tabular">{'{opsi1|opsi2}'}</code>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-broadcast">Isi Pesan</Label>
              <textarea
                id="tpl-broadcast"
                rows={14}
                value={msgTemplate}
                onChange={(e) => setMsgTemplate(e.target.value)}
                className="tabular w-full resize-vertical rounded-md border border-input bg-transparent px-3 py-2 text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-accent">
                  Preview Tampilan di Layar HP Target
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    const origin =
                      typeof window !== 'undefined'
                        ? window.location.origin
                        : 'https://portal-pegawai.internal';
                    setMockupPreviewText(
                      processSpintax(msgTemplate)
                        .replace(/\{nama\}/gi, mockupSampleName)
                        .replace(/\{link\}/gi, `${origin}/`),
                    );
                  }}
                >
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  Acak Spintax Baru
                </Button>
              </div>

              {/* Phone frame */}
              <div
                style={TONE_OK}
                className="overflow-hidden rounded-[28px] border-[8px] border-[#1f2c34] shadow-[0_15px_35px_rgba(0,0,0,0.6)]"
              >
                <div
                  className="flex items-center gap-2.5 border-b border-white/6 px-3.5 py-2.5"
                  style={{ background: '#202c33' }}
                >
                  <div
                    className="flex size-8 items-center justify-center rounded-full text-[13px] font-bold text-white"
                    style={{ background: '#00a884' }}
                  >
                    BSG
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[#e9edef]">Bank SulutGo SDM</div>
                    <div className="text-[10px] text-[#8696a0]">Akun Resmi / Online</div>
                  </div>
                </div>

                <div
                  className="min-h-64 px-3 py-4"
                  style={{
                    background: '#0b141a',
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 0)',
                    backgroundSize: '16px 16px',
                  }}
                >
                  <div className="mb-3 text-center">
                    <span
                      className="rounded-md px-2.5 py-0.5 text-[10px] text-[#8696a0]"
                      style={{ background: '#182229' }}
                    >
                      HARI INI
                    </span>
                  </div>
                  <div
                    className="max-w-[92%] rounded-lg px-3 py-2.5 text-xs leading-relaxed break-words whitespace-pre-wrap text-[#e9edef]"
                    style={{ background: '#005c4b', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                  >
                    {mockupPreviewText}
                    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#8696a0]">
                      <span>09:15</span>
                      <span style={{ color: '#53bdeb' }}>✓✓</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Contoh Nama Target:</span>
                <Input
                  value={mockupSampleName}
                  onChange={(e) => setMockupSampleName(e.target.value)}
                  className="h-7 max-w-48 text-xs"
                  aria-label="Contoh nama target untuk pratinjau"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateModal(false)}>
              Tutup
            </Button>
            <Button onClick={() => setShowTemplateModal(false)}>
              <Plus aria-hidden="true" />
              Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import preview modal ─────────────────────────────── */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Konfirmasi Import Data File</DialogTitle>
            <DialogDescription>
              File: {importFileName} · Terdeteksi: {importPreview.length} pegawai
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">
            Berikut pratinjau 5 data pertama yang akan ditambahkan ke daftar broadcast.
          </p>

          <div className="overflow-hidden rounded-lg border border-border/60">
            <Table>
              <TableHeader className="bg-background/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nama Pegawai</TableHead>
                  <TableHead>No. WhatsApp</TableHead>
                  <TableHead>Cabang / Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importPreview.slice(0, 5).map((row, idx) => (
                  <TableRow key={`${row.label}-${idx}`}>
                    <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                    <TableCell className="tabular text-chart-2">{row.phone || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{row.cabang || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {importPreview.length > 5 ? (
              <p className="border-t border-border/60 bg-background/60 py-2 text-center text-[11px] text-muted-foreground">
                …dan {importPreview.length - 5} pegawai lainnya
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>
              Batal
            </Button>
            <Button onClick={() => void handleSaveImport()} disabled={isImporting}>
              {isImporting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <FileSpreadsheet aria-hidden="true" />
              )}
              {isImporting ? 'Mengimpor…' : `Impor ${importPreview.length} Pegawai`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}