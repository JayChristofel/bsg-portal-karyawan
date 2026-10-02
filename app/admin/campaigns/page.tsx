'use client';

import * as React from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Eye,
  Plus,
  Rocket,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PageHeader, StatusBadge } from '../components/ui';

interface Campaign {
  id: number;
  name: string;
  status: string;
  templateId: number | null;
  templateName: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  totalRecipients: number;
  sentCount: number;
  readCount: number;
}

interface Template {
  id: number;
  name: string;
  category: string;
  body: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [templateId, setTemplateId] = React.useState('none');
  const [scheduledAt, setScheduledAt] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [sendingId, setSendingId] = React.useState<number | null>(null);

  const fetchCampaigns = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/campaigns', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns ?? []);
      }
    } catch (err) {
      console.error('Fetch campaigns error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTemplates = React.useCallback(async () => {
    try {
      const res = await fetch('/api/templates', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch (err) {
      console.error('Fetch templates error:', err);
    }
  }, []);

  React.useEffect(() => {
    void fetchCampaigns();
    void fetchTemplates();
  }, [fetchCampaigns, fetchTemplates]);

  const handleSave = async () => {
    if (!name.trim()) {
      setNotice({ tone: 'err', text: 'Nama kampanye wajib diisi.' });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          templateId: templateId !== 'none' ? Number(templateId) : null,
          scheduledAt: scheduledAt || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Kampanye "${name}" berhasil dibuat.` });
        setOpen(false);
        setName('');
        setTemplateId('none');
        setScheduledAt('');
        void fetchCampaigns();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Gagal membuat kampanye.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async (id: number, campaignName: string) => {
    if (!window.confirm(`Kirim kampanye "${campaignName}" sekarang?`)) return;
    setSendingId(id);
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setNotice({
          tone: 'ok',
          text: `Kampanye "${campaignName}" selesai: ${data.successCount} berhasil, ${data.failCount} gagal.`,
        });
        void fetchCampaigns();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Gagal mengirim kampanye.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (id: number, campaignName: string) => {
    if (!window.confirm(`Hapus kampanye "${campaignName}"?`)) return;
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Kampanye "${campaignName}" berhasil dihapus.` });
        void fetchCampaigns();
      } else {
        setNotice({ tone: 'err', text: 'Gagal menghapus kampanye.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'Terjadi kesalahan saat menghapus.' });
    }
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Manajemen Kampanye"
        description="Buat kampanye broadcast, pilih template, jadwalkan kirim, dan pantau status pengiriman."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden="true" />
            Kampanye Baru
          </Button>
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
            aria-label="Tutup pesan"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="glass rounded-xl">
          <EmptyState
            icon={ClipboardList}
            title="Belum ada kampanye"
            description="Buat kampanye pertama untuk mulai melakukan broadcast ke pegawai."
            action={{ label: 'Kampanye Baru', onClick: () => setOpen(true) }}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {campaigns.map((c) => {
            const readRate =
              c.totalRecipients > 0 ? Math.round((c.readCount / c.totalRecipients) * 100) : 0;
            const canSend = c.status === 'draft' || c.status === 'scheduled';

            return (
              <li key={c.id} className="glass rounded-xl p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">{c.name}</h3>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Template:{' '}
                        {c.templateName ? (
                          <span className="text-foreground">{c.templateName}</span>
                        ) : (
                          <span className="text-muted-foreground/70">tanpa template</span>
                        )}
                      </span>
                      {c.scheduledAt ? (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="size-3" aria-hidden="true" />
                          <span className="tabular">
                            {new Date(c.scheduledAt).toLocaleString('id-ID')}
                          </span>
                        </span>
                      ) : null}
                      {c.sentAt ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="size-3" aria-hidden="true" />
                          <span className="tabular">
                            {new Date(c.sentAt).toLocaleString('id-ID')}
                          </span>
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {canSend ? (
                      <Button
                        size="sm"
                        onClick={() => void handleSend(c.id, c.name)}
                        disabled={sendingId === c.id}
                      >
                        {sendingId === c.id ? (
                          <Rocket className="size-3.5 animate-pulse" aria-hidden="true" />
                        ) : (
                          <Send aria-hidden="true" />
                        )}
                        {sendingId === c.id ? 'Mengirim…' : 'Kirim'}
                      </Button>
                    ) : null}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void handleDelete(c.id, c.name)}
                      aria-label={`Hapus kampanye ${c.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4 sm:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Users className="size-3" aria-hidden="true" />
                      Penerima
                    </dt>
                    <dd className="tabular mt-0.5 text-lg font-semibold text-foreground">
                      {c.totalRecipients}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Send className="size-3" aria-hidden="true" />
                      Terkirim
                    </dt>
                    <dd className="tabular mt-0.5 text-lg font-semibold text-chart-2">
                      {c.sentCount}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Eye className="size-3" aria-hidden="true" />
                      Dibaca
                    </dt>
                    <dd className="tabular mt-0.5 text-lg font-semibold text-accent">
                      {c.readCount}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Read Rate</dt>
                    <dd className="mt-1 flex items-center gap-2">
                      <span className="tabular text-lg font-semibold text-foreground">{readRate}%</span>
                      <span
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/60"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${readRate}%` }}
                        />
                      </span>
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Kampanye Baru</DialogTitle>
            <DialogDescription>
              Pilih template pesan dan jadwalkan waktu kirim bila diperlukan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name">Nama Kampanye</Label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Pemutakhiran Data Q4 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="campaign-template">Template Pesan (Opsional)</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="campaign-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tanpa template —</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="campaign-schedule">Jadwal Kirim (Opsional)</Label>
              <Input
                id="campaign-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Kosongkan untuk menyimpan sebagai draft.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Menyimpan…' : 'Simpan Kampanye'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}