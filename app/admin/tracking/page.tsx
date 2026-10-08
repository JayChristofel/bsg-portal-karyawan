'use client';

import * as React from 'react';
import {
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  Toolbar,
} from '../components/ui';

interface Recipient {
  id: number;
  label: string;
  phone: string | null;
  cabang: string | null;
  waStatus: string;
  waSentAt: string | null;
  waMessageId: string | null;
  campaignId: number | null;
  campaignName: string | null;
  isSubmitted: boolean;
  createdAt: string;
}

interface StatusHistory {
  id: number;
  recipientId: number;
  status: string;
  messageId: string | null;
  createdAt: string;
}

interface Campaign {
  id: number;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  readCount: number;
}

const REFRESH_MS = 8000;

const STATUS_FILTERS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'read', label: 'Read' },
] as const;

const DOT_COLOR: Record<string, string> = {
  pending: 'var(--color-chart-3)',
  sent: 'var(--color-chart-2)',
  delivered: 'var(--color-chart-2)',
  read: 'var(--color-chart-1)',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

export default function TrackingPage() {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = React.useState('all');
  const [recipients, setRecipients] = React.useState<Recipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = React.useState<Recipient | null>(null);
  const [history, setHistory] = React.useState<StatusHistory[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [isLive, setIsLive] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const fetchCampaigns = React.useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns ?? []);
      }
    } catch (err) {
      console.error('Fetch campaigns error:', err);
    }
  }, []);

  const fetchRecipients = React.useCallback(async () => {
    try {
      const params = selectedCampaign !== 'all' ? `?campaignId=${selectedCampaign}` : '';
      const res = await fetch(`/api/tracking${params}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRecipients(data.recipients ?? []);
      }
    } catch (err) {
      console.error('Fetch recipients error:', err);
    } finally {
      setIsLoading(false);
      setLastUpdated(new Date());
    }
  }, [selectedCampaign]);

  const fetchHistory = React.useCallback(async (recipientId: number) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/tracking?recipientId=${recipientId}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history ?? []);
        setSelectedRecipient(data.recipient);
      }
    } catch (err) {
      console.error('Fetch history error:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  React.useEffect(() => {
    setIsLoading(true);
    void fetchRecipients();
  }, [fetchRecipients]);

  // Auto-refresh loop — pausable for keyboard/accessibility control
  React.useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchRecipients();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [isLive, fetchRecipients]);

  // Stop work while tab is hidden
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchRecipients();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchRecipients]);

  const filteredRecipients = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recipients.filter((r) => {
      if (statusFilter !== 'all' && r.waStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        r.label.toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q) ||
        (r.cabang ?? '').toLowerCase().includes(q)
      );
    });
  }, [recipients, searchQuery, statusFilter]);

  const stats = React.useMemo(
    () => ({
      total: recipients.length,
      pending: recipients.filter((r) => !r.waStatus || r.waStatus === 'pending').length,
      sent: recipients.filter((r) => r.waStatus === 'sent' || r.waStatus === 'delivered').length,
      read: recipients.filter((r) => r.waStatus === 'read').length,
      submitted: recipients.filter((r) => r.isSubmitted).length,
    }),
    [recipients],
  );

  const exportParams = React.useMemo(() => {
    const p = new URLSearchParams();
    if (selectedCampaign !== 'all') p.set('campaignId', selectedCampaign);
    return p;
  }, [selectedCampaign]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Delivery Tracking"
        description="Monitor WhatsApp delivery status per campaign and per recipient."
        actions={
          <>
            <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Filter campaign">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button asChild variant="outline">
              <a href={`/api/export?${exportParams.toString()}`} target="_blank" rel="noreferrer">
                <FileSpreadsheet aria-hidden="true" />
                Excel
              </a>
            </Button>
            <Button asChild variant="outline">
              <a
                href={`/api/export?${new URLSearchParams([...exportParams, ['format', 'csv']]).toString()}`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText aria-hidden="true" />
                CSV
              </a>
            </Button>
            <Button onClick={() => void fetchRecipients()}>
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />

      {/* Metrics */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <MetricCard label="Total Recipients" value={stats.total} icon={Users} loading={isLoading} />
        <MetricCard label="Pending" value={stats.pending} icon={Clock} loading={isLoading} />
        <MetricCard label="Sent" value={stats.sent} icon={Send} loading={isLoading} />
        <MetricCard label="Read" value={stats.read} icon={Eye} loading={isLoading} />
        <MetricCard label="Submitted Form" value={stats.submitted} icon={UserCheck} loading={isLoading} />
      </div>

      {/* Filters + live controls */}
      <Toolbar>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, number, or branch…"
              className="pl-9"
              aria-label="Search recipients"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-48" aria-label="Filter status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant={isLive ? 'outline' : 'secondary'}
            size="sm"
            onClick={() => setIsLive((v) => !v)}
            aria-pressed={isLive}
            aria-label={isLive ? 'Pause automatic refresh' : 'Resume automatic refresh'}
          >
            {isLive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {isLive ? 'Pause' : 'Resume'}
          </Button>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={
                isLive ? 'size-1.5 rounded-full bg-accent animate-pulse' : 'size-1.5 rounded-full bg-muted-foreground'
              }
              aria-hidden="true"
            />
            {isLive ? 'Live' : 'Paused'}
            {lastUpdated ? ` · ${lastUpdated.toLocaleTimeString('id-ID')}` : ''}
          </p>
        </div>
      </Toolbar>

      {/* List + timeline */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title={`Daftar Penerima (${filteredRecipients.length})`}
          description="Click a recipient to see their status timeline"
          bodyClassName="p-0 sm:p-0"
        >
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredRecipients.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No recipients"
              description={
                searchQuery || statusFilter !== 'all'
                  ? 'Try a different search or status filter.'
                  : 'No recipients in this campaign yet.'
              }
            />
          ) : (
            <ul className="max-h-[560px] divide-y divide-border/50 overflow-y-auto">
              {filteredRecipients.map((r) => {
                const active = selectedRecipient?.id === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => void fetchHistory(r.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 ${
                        active ? 'bg-accent/10' : 'hover:bg-secondary/50'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {r.label}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {r.cabang || '-'} · {r.phone || 'No WA'}
                        </span>
                      </span>
                      <StatusBadge status={r.waStatus} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Status Timeline"
          description={
            selectedRecipient
              ? selectedRecipient.label
              : 'Delivery status change history'
          }
        >
          {isLoadingHistory ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !selectedRecipient ? (
            <EmptyState
              icon={Clock}
              title="No recipient selected"
              description="Select a recipient from the list to see their delivery history."
            />
          ) : history.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No history yet"
              description="No status changes recorded for this recipient."
            />
          ) : (
            <ol className="relative max-h-[520px] space-y-5 overflow-y-auto pl-6">
              <span
                className="absolute top-1 bottom-1 left-2 w-0.5 bg-border"
                aria-hidden="true"
              />
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span
                    className="absolute top-1.5 -left-[18px] size-3 rounded-full border-2 border-card"
                    style={{ background: DOT_COLOR[h.status] ?? 'var(--color-muted-foreground)' }}
                    aria-hidden="true"
                  />
                  <p
                    className="text-sm font-semibold"
                    style={{ color: DOT_COLOR[h.status] ?? 'var(--color-foreground)' }}
                  >
                    {STATUS_LABEL[h.status] ?? h.status}
                  </p>
                  <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString('id-ID')}
                  </p>
                  {h.messageId ? (
                    <p className="tabular mt-1 truncate text-[11px] text-muted-foreground/80">
                      ID: {h.messageId}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      <p className="mt-4 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        <Download className="size-3" aria-hidden="true" />
        Export follows the selected campaign filter
      </p>
    </div>
  );
}