'use client';

import { useConfirm } from '@/components/confirm-dialog';
import * as React from 'react';
import { Mail, Plus, Search, Trash2, Upload, Users, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PageHeader, StatStrip, StatusBadge } from '../../components/ui';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface EmailRecipient {
  id: number;
  name: string;
  email: string;
  cabang: string | null;
  campaignId: number | null;
  status: string;
  messageId: string | null;
  sentAt: string | null;
  createdAt: string;
}

export default function EmailRecipientsPage() {
  const [confirm, confirmDialog] = useConfirm();
  const [recipients, setRecipients] = React.useState<EmailRecipient[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [cabang, setCabang] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [importing, setImporting] = React.useState(false);

  const fetchRecipients = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/email/recipients', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRecipients(data.recipients ?? []);
      }
    } catch (err) {
      console.error('Fetch recipients error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchRecipients();
  }, [fetchRecipients]);

  const filtered = recipients.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) {
      setNotice({ tone: 'err', text: 'Name and email are required.' });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/email/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, cabang }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Recipient "${name}" was added.` });
        setOpen(false);
        setName('');
        setEmail('');
        setCabang('');
        void fetchRecipients();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Could not add the recipient.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, recipientName: string) => {
    if (!(await confirm({ title: `Delete recipient "${recipientName}"?` }))) return;
    try {
      const res = await fetch(`/api/email/recipients?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Recipient "${recipientName}" was deleted.` });
        void fetchRecipients();
      } else {
        setNotice({ tone: 'err', text: 'Could not delete the recipient.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'An error occurred while deleting.' });
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((l) => l.trim());
      const rows = lines.slice(1).map((line) => {
        const [name, email, cabang] = line.split(',').map((s) => s.trim());
        return { name, email, cabang };
      }).filter((r) => r.name && r.email);

      let added = 0;
      for (const row of rows) {
        const res = await fetch('/api/email/recipients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(row),
        });
        if (res.ok) added++;
      }
      setNotice({ tone: 'ok', text: `Imported ${added} recipients from CSV.` });
      void fetchRecipients();
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const pendingCount = recipients.filter((r) => r.status === 'pending').length;
  const sentCount = recipients.filter((r) => r.status === 'sent').length;
  const deliveredCount = recipients.filter((r) => r.status === 'delivered').length;
  const failedCount = recipients.filter((r) => r.status === 'failed').length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Email Recipients"
        description="Kelola daftar penerima email untuk campaign broadcast."
        actions={
          <>
            <label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => void handleImportCSV(e)}
                className="hidden"
                disabled={importing}
              />
              <Button asChild variant="outline" disabled={importing}>
                <span>
                  <Upload className="size-3.5" aria-hidden="true" />
                  {importing ? 'Importing…' : 'Import CSV'}
                </span>
              </Button>
            </label>
            <Button onClick={() => setOpen(true)}>
              <Plus aria-hidden="true" />
              Add Recipient
            </Button>
          </>
        }
      />

      {notice ? (
        <div
          role="status"
          className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            notice.tone === 'ok'
              ? 'border-chart-2/30 bg-chart-2/10 text-chart-2'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="cursor-pointer opacity-70 hover:opacity-100"
            aria-label="Dismiss message"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <StatStrip
        className="mb-4"
        loading={isLoading}
        items={[
          { label: 'Total', value: recipients.length, icon: Users },
          { label: 'Pending', value: pendingCount, icon: Mail },
          { label: 'Sent', value: sentCount, icon: Mail },
          { label: 'Delivered', value: deliveredCount, icon: Mail },
          { label: 'Failed', value: failedCount, icon: Mail },
        ]}
      />

      <div className="glass mb-4 flex flex-col gap-3 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter" className="text-xs text-muted-foreground">Status</Label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:border-ring"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-xl">
          <EmptyState
            icon={Users}
            title={recipients.length === 0 ? 'No recipients yet' : 'No matching recipients'}
            description={recipients.length === 0
              ? 'Add recipients manually or import from CSV to get started.'
              : 'Try adjusting your search or filter.'}
            action={recipients.length === 0 ? { label: 'Add Recipient', onClick: () => setOpen(true) } : undefined}
          />
        </div>
      ) : (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>{r.cabang || '—'}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="tabular text-xs text-muted-foreground">
                    {r.sentAt ? new Date(r.sentAt).toLocaleString('id-ID') : '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void handleDelete(r.id, r.name)}
                      aria-label={`Delete recipient ${r.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Add Recipient</DialogTitle>
            <DialogDescription>
              Tambahkan penerima email satu per satu atau gunakan Import CSV untuk bulk add.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="er-name">Name</Label>
              <Input
                id="er-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Budi Santoso"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="er-email">Email</Label>
              <Input
                id="er-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. budi@company.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="er-cabang">Cabang (optional)</Label>
              <Input
                id="er-cabang"
                value={cabang}
                onChange={(e) => setCabang(e.target.value)}
                placeholder="e.g. Jakarta Pusat"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Add Recipient'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
