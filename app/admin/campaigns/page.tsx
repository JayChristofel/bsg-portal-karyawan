'use client';

import { useConfirm } from '@/components/confirm-dialog';
import * as React from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Eye,
  Plus,
  UserPlus,
  Rocket,
  Send,
  Timer,
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
import { EmptyState, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { toDatetimeLocal, fromDatetimeLocal } from '@/lib/time';
import { CampaignRecipientsDialog, type CampaignRecipientRow } from '@/components/campaign-recipients-dialog';
import { fetchAllRows } from '@/lib/fetch-all';

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
  failedCount: number;
  readCount: number;
}

interface RecipientApiRow {
  id: number;
  label: string;
  phone: string | null;
  cabang: string | null;
  waStatus: string | null;
  waSentAt: string | null;
  campaignId?: number | null;
}

const toRow = (r: RecipientApiRow): CampaignRecipientRow => ({
  id: r.id,
  title: r.label,
  subtitle: r.phone,
  cabang: r.cabang,
  status: r.waStatus ?? 'pending',
  sentAt: r.waSentAt,
});

interface Template {
  id: number;
  name: string;
  category: string;
  body: string;
}

export default function CampaignsPage() {
  const [confirm, confirmDialog] = useConfirm();
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
  const [editing, setEditing] = React.useState<Campaign | null>(null);

  const [recCampaign, setRecCampaign] = React.useState<Campaign | null>(null);
  const [recMembers, setRecMembers] = React.useState<CampaignRecipientRow[]>([]);
  const [recCandidates, setRecCandidates] = React.useState<CampaignRecipientRow[]>([]);
  const [recLoading, setRecLoading] = React.useState(false);
  const [recBusy, setRecBusy] = React.useState(false);

  const loadRecipients = React.useCallback(async (campaignId: number) => {
    setRecLoading(true);
    try {
      const [res, all] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/recipients`, { cache: 'no-store' }),
        fetchAllRows<RecipientApiRow>('/api/recipients'),
      ]);
      if (!res.ok) throw new Error('members');
      const data = (await res.json()) as { recipients: RecipientApiRow[] };
      setRecMembers(data.recipients.map(toRow));
      // Only contacts that can actually be messaged and are not in any campaign yet.
      setRecCandidates(
        all
          .filter((r) => !r.campaignId && r.phone && (!r.waStatus || r.waStatus === 'pending'))
          .map(toRow),
      );
    } catch (err) {
      console.error('Load campaign recipients error:', err);
      setNotice({ tone: 'err', text: 'Could not load the campaign recipients.' });
    } finally {
      setRecLoading(false);
    }
  }, []);

  const openRecipients = (c: Campaign) => {
    setRecCampaign(c);
    setRecMembers([]);
    setRecCandidates([]);
    void loadRecipients(c.id);
  };

  const changeRecipients = async (method: 'POST' | 'DELETE', ids: number[]) => {
    if (!recCampaign || ids.length === 0) return;
    setRecBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${recCampaign.id}/recipients`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientIds: ids }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ tone: 'err', text: json.error || 'Could not update the recipients.' });
        return;
      }
      setNotice({
        tone: 'ok',
        text: `${json.count} recipient(s) ${method === 'POST' ? 'added to' : 'removed from'} "${recCampaign.name}".`,
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

  const openNew = () => {
    setEditing(null);
    setName('');
    setTemplateId('none');
    setScheduledAt('');
    setOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setName(c.name);
    setTemplateId(c.templateId ? String(c.templateId) : 'none');
    setScheduledAt(toDatetimeLocal(c.scheduledAt));
    setOpen(true);
  };

  const setStatus = async (c: Campaign, status: 'cancelled' | 'draft') => {
    if (
      status === 'cancelled' &&
      !(await confirm({ title: `Cancel campaign "${c.name}"?`, description: 'A cancelled campaign cannot be sent until it is reopened.' }))
    )
      return;
    try {
      const res = await fetch('/api/campaigns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status }),
      });
      const data = await res.json();
      setNotice(
        res.ok
          ? { tone: 'ok', text: `Campaign "${c.name}" ${status === 'cancelled' ? 'cancelled' : 'reopened as a draft'}.` }
          : { tone: 'err', text: data.error || 'Could not change the campaign status.' },
      );
      if (res.ok) void fetchCampaigns();
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setNotice({ tone: 'err', text: 'Campaign name is required.' });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          name,
          templateId: templateId !== 'none' ? Number(templateId) : null,
          scheduledAt: fromDatetimeLocal(scheduledAt),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Campaign "${name}" was ${editing ? 'updated' : 'created'}.` });
        setEditing(null);
        setOpen(false);
        setName('');
        setTemplateId('none');
        setScheduledAt('');
        void fetchCampaigns();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Could not create the campaign.' });
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
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const left = Number(data.remaining ?? 0);
        setNotice({
          tone: data.quotaBlocked ? 'err' : 'ok',
          text:
            `Kampanye "${campaignName}": ${data.successCount} berhasil, ${data.failCount} gagal` +
            (data.quotaBlocked ? '. Kuota harian habis, lanjutkan besok' : '') +
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
      const res = await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' });
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
  const readTotal = campaigns.reduce((sum, c) => sum + c.readCount, 0);
  const readRateHint = sentTotal > 0 ? `${Math.round((readTotal / sentTotal) * 100)}% of sent` : undefined;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Campaign Management"
        description="Create a broadcast campaign, pick a template, schedule the send, and track delivery status."
        actions={
          <Button onClick={() => openNew()}>
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
          { label: 'Read', value: readTotal, icon: Eye, hint: readRateHint },
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
            title="No campaigns yet"
            description="Create your first campaign to start broadcasting to employees."
            action={{ label: 'New Campaign', onClick: () => openNew() }}
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
                          <span className="text-muted-foreground/70">without a template</span>
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
                        {sendingId === c.id ? 'Sending…' : 'Send'}
                      </Button>
                    ) : null}
                    {canSend ? (
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                        Edit
                      </Button>
                    ) : null}
                    {canSend ? (
                      <Button size="sm" variant="ghost" onClick={() => void setStatus(c, 'cancelled')}>
                        Cancel
                      </Button>
                    ) : null}
                    {c.status === 'cancelled' ? (
                      <Button size="sm" variant="outline" onClick={() => void setStatus(c, 'draft')}>
                        Reopen
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => openRecipients(c)}>
                      <UserPlus aria-hidden="true" />
                      Recipients
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

                {/* Stats */}
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
                      {c.failedCount > 0 ? (
                        <span className="ml-2 text-xs font-medium text-destructive">{c.failedCount} failed</span>
                      ) : null}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Eye className="size-3" aria-hidden="true" />
                      Read
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

      <CampaignRecipientsDialog
        open={recCampaign !== null}
        onOpenChange={(o) => !o && setRecCampaign(null)}
        campaignName={recCampaign?.name ?? ''}
        editable={recCampaign?.status === 'draft' || recCampaign?.status === 'scheduled'}
        isLoading={recLoading}
        isBusy={recBusy}
        members={recMembers}
        candidates={recCandidates}
        onAdd={(ids) => void changeRecipients('POST', ids)}
        onRemove={(ids) => void changeRecipients('DELETE', ids)}
      />

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{editing ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
            <DialogDescription>
              Pick a message template and set a send schedule if needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 2026 Data Update"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="campaign-template">Message Template (optional)</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="campaign-template">
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
              <Label htmlFor="campaign-schedule">Scheduled Send (optional)</Label>
              <Input
                id="campaign-schedule"
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
