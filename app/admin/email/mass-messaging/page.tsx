'use client';

import * as React from 'react';
import {
  Building2,
  Eye,
  Gauge,
  Loader2,
  Mail,
  Megaphone,
  PauseCircle,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
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
import { EmptyState, PageHeader, SectionCard, StatStrip, StatusBadge } from '../../components/ui';
import { Pagination } from '@/components/ui/pagination';
import { TableViewControls } from '@/components/ui/table-view-controls';
import { useTableView } from '@/lib/table-view';
import { cn } from '@/lib/utils';

function parseCsv(text: string): unknown[][] {
  const rows: unknown[][] = [];
  let row: unknown[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

type DelayProfile = 'safe' | 'balanced' | 'fast';

const EMAIL_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
};

const DELAY_META: Record<DelayProfile, { label: string; range: string }> = {
  safe: { label: 'Safe', range: '60–120s random' },
  balanced: { label: 'Balanced', range: '30–60s random' },
  fast: { label: 'Fast', range: '15–30s' },
};

interface RecipientRow {
  id: number;
  name: string;
  email: string;
  cabang: string | null;
  status: string;
  messageId: string | null;
  sentAt: string | null;
  createdAt: string;
}

export default function EmailBroadcastPage() {
  const [data, setData] = React.useState<RecipientRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const [inputText, setInputText] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);

  const [isBulkSending, setIsBulkSending] = React.useState(false);
  const [bulkProgress, setBulkProgress] = React.useState<string | null>(null);
  const [delayProfile, setDelayProfile] = React.useState<DelayProfile>('balanced');
  const [enableCooldown, setEnableCooldown] = React.useState(true);
  const [cooldownCountdown, setCooldownCountdown] = React.useState<number | null>(null);

  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());

  const [msgTemplate, setMsgTemplate] = React.useState('');
  const [showTemplateModal, setShowTemplateModal] = React.useState(false);
  const [showImportModal, setShowImportModal] = React.useState(false);
  const [importPreview, setImportPreview] = React.useState<Array<{ name: string; email: string; cabang: string }>>([]);
  const [importFileName, setImportFileName] = React.useState<string | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [sendingMap, setSendingMap] = React.useState<Record<number, boolean>>({});
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const fetchData = React.useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const res = await fetch('/api/email/recipients', { cache: 'no-store' });
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

  const handleRegisterManual = async () => {
    const lines = inputText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) { setNotice({ tone: 'err', text: 'Enter at least one recipient.' }); return; }
    const items = lines.map((line) => {
      const parts = line.split(',');
      return { name: (parts[0] || '').trim(), email: (parts[1] || '').trim(), cabang: (parts[2] || '').trim() };
    });
    setIsGenerating(true);
    try {
      const res = await fetch('/api/email/recipients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (json.success) { setInputText(''); setNotice({ tone: 'ok', text: `Registered ${json.count} recipients.` }); void fetchData(); }
      else setNotice({ tone: 'err', text: json.error || 'Could not register recipients.' });
    } finally { setIsGenerating(false); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const MAX_ROWS = 10_000;
        let rawJson: unknown[][] = [];
        if (/\.csv$/i.test(file.name)) {
          rawJson = parseCsv(String(evt.target?.result ?? '')).slice(0, MAX_ROWS);
        } else {
          const buf = evt.target?.result;
          if (!(buf instanceof ArrayBuffer)) throw new Error('Could not read the file.');
          const wb = new (await import('exceljs')).default.Workbook();
          await wb.xlsx.load(buf);
          const ws = wb.worksheets[0];
          if (ws) ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber > MAX_ROWS) return;
            rawJson.push(row.values as unknown[]);
          });
        }
        if (rawJson.length < 2) { setNotice({ tone: 'err', text: 'File is empty or has no data rows.' }); return; }
        const headerRow = (rawJson[0] || []).map((h) => String(h || '').toLowerCase().trim());
        let nameIdx = headerRow.findIndex((h) => h.includes('nama') || h.includes('name') || h.includes('pegawai') || h.includes('karyawan'));
        let emailIdx = headerRow.findIndex((h) => h.includes('email') || h.includes('mail'));
        let cabangIdx = headerRow.findIndex((h) => h.includes('cabang') || h.includes('unit') || h.includes('kantor'));
        if (nameIdx === -1) nameIdx = 0;
        if (emailIdx === -1) emailIdx = 1;
        if (cabangIdx === -1 && rawJson[0]?.length > 2) cabangIdx = 2;
        const parsed: Array<{ name: string; email: string; cabang: string }> = [];
        for (let i = 1; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || row.length === 0) continue;
          const name = String(row[nameIdx] || '').trim();
          const email = String(row[emailIdx] || '').trim();
          const cabang = cabangIdx !== -1 ? String(row[cabangIdx] || '').trim() : '';
          if (name && email) parsed.push({ name, email, cabang });
        }
        if (parsed.length === 0) { setNotice({ tone: 'err', text: 'No valid records found.' }); return; }
        setImportPreview(parsed);
        setShowImportModal(true);
      } catch (err) {
        setNotice({ tone: 'err', text: `Could not read: ${(err as Error).message}` });
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveImport = async () => {
    if (importPreview.length === 0) return;
    setIsImporting(true);
    try {
      const res = await fetch('/api/email/recipients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: importPreview }),
      });
      const json = await res.json();
      if (json.success) { setNotice({ tone: 'ok', text: `Imported ${json.count} recipients.` }); setShowImportModal(false); setImportPreview([]); setImportFileName(null); void fetchData(); }
      else setNotice({ tone: 'err', text: json.error || 'Could not import.' });
    } catch { setNotice({ tone: 'err', text: 'Network error.' }); }
    finally { setIsImporting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Remove this recipient?')) return;
    try {
      const res = await fetch(`/api/email/recipients?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) void fetchData();
      else setNotice({ tone: 'err', text: json.error || 'Could not delete.' });
    } catch { setNotice({ tone: 'err', text: 'Delete failed.' }); }
  };

  const handleSendEmail = async (row: RecipientRow) => {
    if (!row.email) { setNotice({ tone: 'err', text: `${row.name} doesn't have an email address.` }); return; }
    setSendingMap((prev) => ({ ...prev, [row.id]: true }));
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: row.email,
          recipientId: row.id,
          subject: 'Email dari Portal Pegawai',
          html: msgTemplate || `<p>Halo ${row.name},</p><p>Ini adalah email broadcast dari Portal Pegawai.</p>`,
          text: msgTemplate ? 'Halo ' + row.name + ', ini adalah email broadcast.' : '',
        }),
      });
      const json = await res.json();
      if (json.success) { setNotice({ tone: 'ok', text: `Email sent to ${row.name} (${row.email}).` }); void fetchData(); }
      else setNotice({ tone: 'err', text: `Send failed: ${json.error || json.detail || 'unknown'}` });
    } catch (err) { setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` }); }
    finally { setSendingMap((prev) => ({ ...prev, [row.id]: false })); }
  };

  const handleBulkSendEmail = async () => {
    const targets = view.rows.filter((r) => r.status === 'pending');
    if (targets.length === 0) { setNotice({ tone: 'err', text: 'No pending recipients match the current filters.' }); return; }
    const confirmMsg = `Send email broadcast to ${targets.length} recipients with status Pending?\n\nSettings:\n- Delay: ${DELAY_META[delayProfile].label} (${DELAY_META[delayProfile].range})\n- Cooldown: ${enableCooldown ? 'On (20s rest every 20 emails)' : 'Off'}`;
    if (!window.confirm(confirmMsg)) return;
    setIsBulkSending(true);
    let successCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      setBulkProgress(`Mengirim ${i + 1} dari ${targets.length}: ${row.name} (${row.email})…`);
      try {
        const res = await fetch('/api/email/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: row.email,
            recipientId: row.id,
            subject: 'Email dari Portal Pegawai',
            html: msgTemplate || `<p>Halo ${row.name},</p><p>Ini adalah email broadcast dari Portal Pegawai.</p>`,
          }),
        });
        const json = await res.json();
        if (json.success) successCount++;
      } catch { /* continue */ }
      if (enableCooldown && (i + 1) % 20 === 0 && i + 1 < targets.length) {
        for (let cd = 60; cd > 0; cd--) {
          setCooldownCountdown(cd);
          setBulkProgress(`Cooldown: resting ${cd}s…`);
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCooldownCountdown(null);
      } else {
        let delayMs = 60000;
        if (delayProfile === 'safe') delayMs = Math.floor(Math.random() * 60001) + 60000;
        else if (delayProfile === 'fast') delayMs = Math.floor(Math.random() * 15001) + 15000;
        else delayMs = Math.floor(Math.random() * 30001) + 30000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    setIsBulkSending(false);
    setBulkProgress(null);
    setNotice({ tone: 'ok', text: `Broadcast finished. Sent to ${successCount} of ${targets.length} recipients.` });
    void fetchData();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Remove ${selectedIds.size} recipients?`)) return;
    let deleted = 0;
    for (const id of selectedIds) {
      try { const res = await fetch(`/api/email/recipients?id=${id}`, { method: 'DELETE' }); if (res.ok) deleted++; } catch { /* */ }
    }
    setSelectedIds(new Set());
    setNotice({ tone: 'ok', text: `Deleted ${deleted} of ${selectedIds.size} recipients.` });
    void fetchData();
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === view.rows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(view.rows.map((r) => r.id)));
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const total = data.length;
  const pendingCount = data.filter((r) => !r.status || r.status === 'pending').length;
  const sentCount = data.filter((r) => r.status === 'sent' || r.status === 'delivered').length;
  const deliveredCount = data.filter((r) => r.status === 'delivered').length;
  const failedCount = data.filter((r) => r.status === 'failed').length;
  const successRate = total - pendingCount > 0 ? Math.round((sentCount / (total - pendingCount)) * 100) : 0;

  const cabangList = React.useMemo(() => Array.from(new Set(data.map((r) => r.cabang).filter(Boolean))).sort() as string[], [data]);

  const statusOptions = React.useMemo(() => {
    const present = new Set(data.map((r) => r.status ?? 'pending'));
    return Array.from(present).sort().map((s) => ({ value: s, label: EMAIL_STATUS_LABEL[s] ?? s }));
  }, [data]);

  const view = useTableView<RecipientRow>({
    rows: data,
    searchFn: (row, q) => (row.name + ' ' + row.email + ' ' + (row.cabang ?? '')).toLowerCase().includes(q),
    filterFields: [
      { key: 'cabang', label: 'Branch', kind: 'select', options: cabangList.map((c) => ({ value: c, label: c })), match: (row, value) => row.cabang === value },
      { key: 'status', label: 'Email status', kind: 'multi', options: statusOptions, match: (row, values) => values.includes(row.status ?? 'pending') },
      { key: 'email', label: 'Email address', kind: 'multi', options: [{ value: 'has', label: 'Has email' }, { value: 'none', label: 'No email' }], match: (row, values) => values.some((v) => (v === 'has' ? Boolean(row.email) : !row.email)) },
      { key: 'created', label: 'Date added', kind: 'date-range', dateOf: (row) => row.createdAt },
      { key: 'sent', label: 'Date sent', kind: 'date-range', dateOf: (row) => row.sentAt },
    ],
    sortFields: [
      { key: 'name', label: 'Name', value: (row) => row.name },
      { key: 'created', label: 'Date added', value: (row) => row.createdAt },
      { key: 'sent', label: 'Date sent', value: (row) => row.sentAt },
      { key: 'cabang', label: 'Branch', value: (row) => row.cabang },
      { key: 'status', label: 'Status', value: (row) => EMAIL_STATUS_LABEL[row.status] ?? row.status },
    ],
    defaultSortKey: 'created',
    defaultSortDir: 'desc',
  });

  const pendingTargets = React.useMemo(() => view.rows.filter((r) => r.status === 'pending').length, [view.rows]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" aria-hidden="true" tabIndex={-1} />

      <PageHeader
        title="Email Mass Messaging"
        description="Kelola recipients, atur pacing kirim, dan broadcast email ke pegawai."
        actions={
          <>
            <Button variant="outline" onClick={() => setShowTemplateModal(true)}>
              <Mail className="size-3.5" aria-hidden="true" />
              Template Pesan
            </Button>
            <Button onClick={() => void handleBulkSendEmail()} disabled={isBulkSending || pendingTargets === 0}>
              {isBulkSending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Megaphone className="size-3.5" aria-hidden="true" />}
              Broadcast {pendingTargets > 0 ? `(${pendingTargets})` : ''}
            </Button>
          </>
        }
      />

      {notice ? (
        <div role="status" className={cn('mb-4 rounded-lg border px-4 py-3 text-sm', notice.tone === 'ok' ? 'border-accent/30 bg-accent/10 text-accent' : 'border-destructive/30 bg-destructive/10 text-destructive')}>
          {notice.text}
        </div>
      ) : null}

      {bulkProgress ? (
        <div role="status" aria-live="polite" className="mb-4 flex items-center gap-2.5 rounded-lg border border-chart-2/30 bg-chart-2/10 px-4 py-3 text-sm text-chart-2">
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

      <StatStrip
        className="mb-4"
        loading={isLoading}
        items={[
          { label: 'Recipients', value: total, icon: Users },
          { label: 'Pending', value: pendingCount, icon: Mail },
          { label: 'Sent', value: sentCount, icon: Send },
          { label: 'Delivered', value: deliveredCount, icon: Mail },
          { label: 'Failed', value: failedCount, icon: X },
          { label: 'Success rate', value: `${successRate}%`, icon: Gauge },
        ]}
      />

      <SectionCard title="Recipients & Sending" description="Add recipients and tune sending pace." className="mb-4" bodyClassName="p-0 sm:p-0">
        <div className="grid gap-x-6 gap-y-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sending</p>
            <div className="space-y-1.5">
              <Label htmlFor="delay-profile-email">Delay profile</Label>
              <Select value={delayProfile} onValueChange={(v) => setDelayProfile(v as DelayProfile)} disabled={isBulkSending}>
                <SelectTrigger id="delay-profile-email"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DELAY_META) as DelayProfile[]).map((k) => (
                    <SelectItem key={k} value={k}>{DELAY_META[k].label} — {DELAY_META[k].range}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button id="cooldown-toggle-email" type="button" role="switch" aria-checked={enableCooldown} disabled={isBulkSending} onClick={() => setEnableCooldown((v) => !v)} className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-input bg-transparent px-3 py-2 text-left transition-colors hover:bg-secondary/40 disabled:opacity-50">
              <span className="min-w-0 text-sm text-foreground">Batch cooldown</span>
              <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', enableCooldown ? 'bg-accent' : 'bg-muted')} aria-hidden="true">
                <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform', enableCooldown ? 'translate-x-4' : 'translate-x-0')} />
              </span>
            </button>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3 shrink-0 text-accent" aria-hidden="true" />
              <span>Pauses for 20 seconds after every 20 emails. Do not close this tab while a broadcast is running.</span>
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Add recipients</p>
            <div className="grid gap-2">
              <Button variant="outline" className="justify-start" onClick={() => fileInputRef.current?.click()} disabled={isBulkSending}>
                <Upload className="size-3.5" aria-hidden="true" />
                Import Excel or CSV
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Import reads an Excel/CSV file you choose.</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Manual entry</p>
            <div className="space-y-2">
              <textarea rows={3} value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={'Andi Pratama, andi@company.com, Kantor Pusat\nBudi Santoso, budi@company.com, KCP Manado'} aria-label="Manual recipient data" className="tabular w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" />
              <Button className="w-full" onClick={() => void handleRegisterManual()} disabled={isGenerating || !inputText.trim()}>
                {isGenerating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus className="size-3.5" aria-hidden="true" />}
                Register manually
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">One per line: Name, Email, Branch.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Recipients (${view.total})`} description="Send individually, or use Broadcast above." bodyClassName="p-0 sm:p-0">
        <div className="flex flex-col gap-3 border-b border-border/60 p-3 sm:flex-row sm:items-start sm:justify-between">
          <TableViewControls view={view} searchPlaceholder="Search name, email, or branch…" resultLabel="recipients" />
          {selectedIds.size > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-accent">{selectedIds.size} selected</span>
              <Button size="sm" variant="destructive" onClick={() => void handleBulkDelete()}>
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} aria-label="Clear selection">
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : view.total === 0 ? (
          <EmptyState icon={Megaphone} title={view.isFiltered ? 'No recipients match filters' : 'No recipients yet'} description={view.isFiltered ? 'Try adjusting filters.' : 'Import a file or add manually.'} action={view.isFiltered ? { label: 'Reset Filters', onClick: view.reset } : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10"><input type="checkbox" checked={view.rows.length > 0 && selectedIds.size === view.rows.length} onChange={() => toggleSelectAll()} className="size-4 cursor-pointer accent-[var(--accent)]" aria-label="Select all" /></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((row) => {
                  const sending = Boolean(sendingMap[row.id]);
                  return (
                    <TableRow key={row.id}>
                      <TableCell><input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelectRow(row.id)} className="size-4 cursor-pointer accent-[var(--accent)]" aria-label={`Select ${row.name}`} /></TableCell>
                      <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                      <TableCell className="tabular text-chart-2">{row.email || <span className="text-muted-foreground">— none</span>}</TableCell>
                      <TableCell className="text-muted-foreground">{row.cabang || '-'}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => void handleSendEmail(row)} disabled={sending || isBulkSending}>
                            {sending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}
                            Send
                          </Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => void handleDelete(row.id)} aria-label={`Delete ${row.name}`} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="size-3.5" aria-hidden="true" />
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
        {view.total > 0 && <Pagination currentPage={view.page} totalPages={view.totalPages} totalItems={view.total} pageSize={view.pageSize} onPageChange={view.setPage} onPageSizeChange={view.setPageSize} />}
      </SectionCard>

      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="glass-strong sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Email Template</DialogTitle>
            <DialogDescription>Use variables: {'{{name}}'}, {'{{email}}'}, {'{{cabang}}'}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="email-tpl">Message Body (HTML)</Label>
            <textarea id="email-tpl" rows={10} value={msgTemplate} onChange={(e) => setMsgTemplate(e.target.value)} placeholder={'<h1>Halo {{name}}</h1><p>Email Anda: {{email}}</p><p>Cabang: {{cabang}}</p>'} className="tabular w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateModal(false)}>Close</Button>
            <Button onClick={() => setShowTemplateModal(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="glass-strong sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Confirm File Import</DialogTitle>
            <DialogDescription>File: {importFileName} · Detected: {importPreview.length} records</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-lg border border-border/60">
            <Table>
              <TableHeader className="bg-background/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Branch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importPreview.slice(0, 5).map((row, idx) => (
                  <TableRow key={`${row.name}-${idx}`}>
                    <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                    <TableCell className="tabular text-chart-2">{row.email}</TableCell>
                    <TableCell className="text-muted-foreground">{row.cabang || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>Cancel</Button>
            <Button onClick={() => void handleSaveImport()} disabled={isImporting}>
              {isImporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Mail className="size-3.5" aria-hidden="true" />}
              {isImporting ? 'Importing…' : `Import ${importPreview.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}