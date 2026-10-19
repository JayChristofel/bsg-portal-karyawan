'use client';

import { useConfirm } from '@/components/confirm-dialog';
import * as React from 'react';
import {
  CalendarClock,
  ClipboardList,
  Eye,
  Pencil,
  Plus,
  Rocket,
  Send,
  Timer,
  Trash2,
  UserPlus,
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
import { EmptyState, PageHeader, StatStrip, StatusBadge } from '../../components/ui';
import { toDatetimeLocal, fromDatetimeLocal } from '@/lib/time';
import { CampaignRecipientsDialog, type CampaignRecipientRow } from '@/components/campaign-recipients-dialog';

interface EmailCampaign {
  id: number;
  name: string;
  subject: string;
  status: string;
  templateId: number | null;
  scheduledAt: string | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failCount: number;
}

interface EmailRecipientApiRow {
  id: number;
  name: string;
  email: string;
  cabang: string | null;
  status: string | null;
  sentAt?: string | null;
  campaignId?: number | null;
  events?: { event: string; createdAt: string }[];
}

const toRow = (r: EmailRecipientApiRow): CampaignRecipientRow => ({
  id: r.id,
  title: r.name,
  subtitle: r.email,
  cabang: r.cabang,
  status: r.status ?? 'pending',
  sentAt: r.sentAt,
  events: r.events,
});

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  category: string;
}

export default function EmailCampaignsPage() {
  const [confirm, confirmDialog] = useConfirm();
  const [campaigns, setCampaigns] = React.useState<EmailCampaign[]>([]);
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EmailCampaign | null>(null);
  const [name, setName] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [templateId, setTemplateId] = React.useState('none');
  const [scheduledAt, setScheduledAt] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [sendingId, setSendingId] = React.useState<number | null>(null);

  const [recCampaign, setRecCampaign] = React.useState<EmailCampaign | null>(null);
  const [recMembers, setRecMembers] = React.useState<CampaignRecipientRow[]>([]);
  const [recCandidates, setRecCandidates] = React.useState<CampaignRecipientRow[]>([]);
  const [recLoading, setRecLoading] = React.useState(false);
  const [recBusy, setRecBusy] = React.useState(false);

  const loadRecipients = React.useCallback(async (campaignId: number) => {
    setRecLoading(true);
    try {
      const [memberRes, allRes] = await Promise.all([
        fetch(`/api/email/campaigns/${campaignId}/recipients`, { cache: 'no-store' }),
        fetch('/api/email/recipients', { cache: 'no-store' }),
      ]);
      if (!memberRes.ok || !allRes.ok) throw new Error('load');
      const members = (await memberRes.json()) as { recipients: EmailRecipientApiRow[] };
      const all = (await allRes.json()) as { recipients: EmailRecipientApiRow[] };
      setRecMembers(members.recipients.map(toRow));
      setRecCandidates(
        all.recipients.filter((r) => !r.campaignId && (!r.status || r.status === 'pending')).map(toRow),
      );
    } catch (err) {
      console.error('Load campaign recipients error:', err);
      setNotice({ tone: 'err', text: 'Could not load the campaign recipients.' });
    } finally {
      setRecLoading(false);
    }
  }, []);

  const openRecipients = (c: EmailCampaign) => {
    setRecCampaign(c);
    setRecMembers([]);
    setRecCandidates([]);
    void loadRecipients(c.id);
  };

  const changeRecipients = async (ids: number[], add: boolean) => {
    if (!recCampaign || ids.length === 0) return;
    setRecBusy(true);
    try {
      const res = await fetch('/api/email/recipients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          add ? { ids, campaignId: recCampaign.id } : { ids, campaignId: null, fromCampaignId: recCampaign.id },
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ tone: 'err', text: json.error || 'Could not update the recipients.' });
        return;
      }
      setNotice({
        tone: 'ok',
        text: `${json.count} recipient(s) ${add ? 'added to' : 'removed from'} "${recCampaign.name}".`,
      });
      await Promise.all([loadRecipients(recCampaign.id), fetchCampaigns()]);
    } catch {
      setNotice({ tone: 'err', text: 'Network error while updating the recipients.' });
    } finally {
      setRecBusy(false);
    }
  };

  const fetchCampaigns = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/email/campaigns', { cache: 'no-store' });
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
      const res = await fetch('/api/email/templates', { cache: 'no-store' });
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

  const openNew = () => {
    setEditing(null);
    setName('');
    setSubject('');
    setTemplateId('none');
    setScheduledAt('');
    setOpen(true);
  };

  const openEdit = (c: EmailCampaign) => {
    setEditing(c);
    setName(c.name);
    setSubject(c.subject);
    setTemplateId(c.templateId ? String(c.templateId) : 'none');
    setScheduledAt(toDatetimeLocal(c.scheduledAt));
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setNotice({ tone: 'err', text: 'Campaign name is required.' });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/email/campaigns', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing
          ? { id: editing.id, name, subject, templateId: templateId !== 'none' ? Number(templateId) : null, scheduledAt: fromDatetimeLocal(scheduledAt) }
          : { name, subject, templateId: templateId !== 'none' ? Number(templateId) : null, scheduledAt: fromDatetimeLocal(scheduledAt) }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Campaign "${name}" was saved.` });
        setOpen(false);
        void fetchCampaigns();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Could not save the campaign.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async (id: number, campaignName: string) => {
    if (!(await confirm({ title: `Send campaign "${campaignName}" now?` }))) return;
    setSendingId(id);
    try {
      const res = await fetch(`/api/email/campaigns/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const left = Number(data.remaining ?? 0);
        setNotice({
          tone: data.failCount > 0 ? 'err' : 'ok',
          text:
            `Kampanye "${campaignName}": ${data.successCount} berhasil, ${data.failCount} gagal` +
            (left > 0 ? `. ${left} penerima masih menunggu, tekan Kirim lagi untuk melanjutkan.` : '.'),
        });
        void fetchCampaigns();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Could not send the campaign.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (id: number, campaignName: string) => {
    if (!(await confirm({ title: `Delete campaign "${campaignName}"?` }))) return;
    try {
      const res = await fetch(`/api/email/campaigns?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Campaign "${campaignName}" was deleted.` });
        void fetchCampaigns();
      } else {
        setNotice({ tone: 'err', text: 'Could not delete the campaign.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'An error occurred while deleting.' });
    }
  };

  const scheduledCount = campaigns.filter(
    (c) => c.status === 'scheduled' || c.status === 'draft',
  ).length;
  const recipientTotal = campaigns.reduce((sum, c) => sum + c.totalRecipients, 0);
  const sentTotal = campaigns.reduce((sum, c) => sum + c.sentCount, 0);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Email Campaigns"
        description="Buat kampanye email, pilih template, jadwalkan kirim, dan pantau status pengiriman."
        actions={
          <Button onClick={openNew}>
            <Plus aria-hidden="true" />
            New Campaign
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
          { label: 'Campaigns', value: campaigns.length, icon: ClipboardList },
          { label: 'Scheduled', value: scheduledCount, icon: Timer },
          { label: 'Recipients', value: recipientTotal, icon: Users },
          { label: 'Sent', value: sentTotal, icon: Send },
        ]}
      />

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
            title="No email campaigns yet"
            description="Create your first email campaign to start broadcasting to employees."
            action={{ label: 'New Campaign', onClick: openNew }}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {campaigns.map((c) => {
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
                        Subject:{' '}
                        <span className="text-foreground">{c.subject || '(no subject)'}</span>
                      </span>
                      {c.status === 'scheduled' ? (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="size-3" aria-hidden="true" />
                          <span>Scheduled</span>
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
                        {sendingId === c.id ? 'Sending…' : 'Send'}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => openRecipients(c)}>
                      <UserPlus aria-hidden="true" />
                      Recipients
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="size-3" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void handleDelete(c.id, c.name)}
                      aria-label={`Delete campaign ${c.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4 sm:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Users className="size-3" aria-hidden="true" />
                      Recipients
                    </dt>
                    <dd className="tabular mt-0.5 text-lg font-semibold text-foreground">
                      {c.totalRecipients}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Send className="size-3" aria-hidden="true" />
                      Sent
                    </dt>
                    <dd className="tabular mt-0.5 text-lg font-semibold text-chart-2">
                      {c.sentCount}
                      {c.failCount > 0 ? (
                        <span className="ml-2 text-xs font-medium text-destructive">{c.failCount} failed</span>
                      ) : null}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Eye className="size-3" aria-hidden="true" />
                      Delivered
                    </dt>
                    <dd className="tabular mt-0.5 text-lg font-semibold text-accent">
                      {c.deliveredCount}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Success Rate</dt>
                    <dd className="mt-1 flex items-center gap-2">
                      <span className="tabular text-lg font-semibold text-foreground">
                        {c.totalRecipients > 0
                          ? `${Math.round((c.sentCount / c.totalRecipients) * 100)}%`
                          : '—'}
                      </span>
                      <span
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/60"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{
                            width: `${c.totalRecipients > 0 ? Math.round((c.sentCount / c.totalRecipients) * 100) : 0}%`,
                          }}
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

      <CampaignRecipientsDialog
        open={recCampaign !== null}
        onOpenChange={(o) => !o && setRecCampaign(null)}
        campaignName={recCampaign?.name ?? ''}
        editable={recCampaign?.status === 'draft' || recCampaign?.status === 'scheduled'}
        isLoading={recLoading}
        isBusy={recBusy}
        members={recMembers}
        candidates={recCandidates}
        onAdd={(ids) => void changeRecipients(ids, true)}
        onRemove={(ids) => void changeRecipients(ids, false)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing ? 'Edit Campaign' : 'New Campaign'}
            </DialogTitle>
            <DialogDescription>
              Pilih template email dan set jadwal kirim jika diperlukan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ec-name">Campaign Name</Label>
              <Input
                id="ec-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 2026 Announcement"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ec-subject">Subject</Label>
              <Input
                id="ec-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Update Kebijakan Q4 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ec-template">Email Template (optional)</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="ec-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No template —</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ec-schedule">Scheduled Send (optional)</Label>
              <Input
                id="ec-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave empty to save as a draft.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
