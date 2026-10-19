'use client';

import * as React from 'react';
import {
  CalendarDays,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Inbox,
  RefreshCw,
  Send,
  TrendingUp,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { TableViewControls } from '@/components/ui/table-view-controls';
import { useTableView } from '@/lib/table-view';
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusBadge,
  Toolbar,
} from '../components/ui';

interface CampaignReport {
  id: number;
  name: string;
  status: string;
  createdBy: string | null;
  createdAt: string;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  submitted: number;
}

interface TimelinePoint {
  date: string;
  created: number;
  sent: number;
  delivered: number;
  read: number;
}

interface ReportData {
  summary: {
    totalCampaigns: number;
    totalRecipients: number;
    pending: number;
    sent: number;
    delivered: number;
    read: number;
    submitted: number;
  };
  campaigns: CampaignReport[];
  timeline: TimelinePoint[];
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--color-chart-3)',
  sent: 'var(--color-chart-2)',
  delivered: 'var(--color-chart-4)',
  read: 'var(--color-chart-1)',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

function TrendChart({ data }: { data: TimelinePoint[] }) {
  const W = 600;
  const H = 200;
  const PAD = 10;
  const max = Math.max(1, ...data.map((d) => Math.max(d.sent, d.delivered, d.read)));
  const x = (i: number) => (data.length <= 1 ? W / 2 : PAD + (i / (data.length - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const points = (key: 'sent' | 'delivered' | 'read') =>
    data.map((d, i) => `${x(i)},${y(d[key])}`).join(' ');

  const series = [
    { key: 'sent' as const, label: 'Sent', color: STATUS_COLOR.sent },
    { key: 'delivered' as const, label: 'Delivered', color: STATUS_COLOR.delivered },
    { key: 'read' as const, label: 'Read', color: STATUS_COLOR.read },
  ];

  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  return (
    <div>
      <ul className="mb-4 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Daily delivery trend"
        preserveAspectRatio="none"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + f * (H - PAD * 2)}
            y2={PAD + f * (H - PAD * 2)}
            stroke="var(--color-border)"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((s) => (
          <polyline
            key={s.key}
            points={points(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        {labelIdx.map((i) => (
          <span key={i} className="tabular">
            {data[i].date.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function BroadcastReportPage() {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [campaignId, setCampaignId] = React.useState('all');
  const [data, setData] = React.useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchReport = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (campaignId !== 'all') params.set('campaignId', campaignId);
      const res = await fetch(`/api/reports/broadcast?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData(await res.json());
    } catch (err) {
      console.error('Report fetch error:', err);
      setError('Could not load the report. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [from, to, campaignId]);

  React.useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const summary = data?.summary;
  const campaigns = data?.campaigns ?? [];
  const timeline = data?.timeline ?? [];

  const readRate = summary ? pct(summary.read, summary.totalRecipients) : 0;
  const submitRate = summary ? pct(summary.submitted, summary.totalRecipients) : 0;

  const campaignStatusOptions = React.useMemo(() => {
    const present = new Set(campaigns.map((c) => c.status));
    return Array.from(present).sort().map((s) => ({ value: s, label: s }));
  }, [campaigns]);

  const view = useTableView<CampaignReport>({
    rows: campaigns,
    searchFn: (row, q) => row.name.toLowerCase().includes(q),
    filterFields: [
      {
        key: 'status',
        label: 'Campaign status',
        kind: 'multi',
        options: campaignStatusOptions,
        match: (row, values) => values.includes(row.status),
      },
      {
        key: 'created',
        label: 'Creation period',
        kind: 'date-range',
        dateOf: (row) => row.createdAt,
      },
    ],
    sortFields: [
      { key: 'name', label: 'Campaign name', value: (row) => row.name },
      { key: 'created', label: 'Date created', value: (row) => row.createdAt },
      { key: 'total', label: 'Total recipients', value: (row) => row.totalRecipients },
      { key: 'sent', label: 'Sent', value: (row) => row.sent + row.delivered + row.read },
      { key: 'read', label: 'Read', value: (row) => row.read },
      { key: 'rate', label: 'Read rate', value: (row) => pct(row.read, row.totalRecipients) },
    ],
    defaultSortKey: 'created',
    defaultSortDir: 'desc',
  });

  const exportParams = React.useMemo(() => {
    const p = new URLSearchParams();
    if (campaignId !== 'all') p.set('campaignId', campaignId);
    return p;
  }, [campaignId]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Broadcast Report"
        description="WhatsApp broadcast delivery performance across campaigns."
        actions={
          <>
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
            <Button onClick={() => void fetchReport()} disabled={isLoading}>
              <RefreshCw className={isLoading ? 'animate-spin' : undefined} aria-hidden="true" />
              Perbarui
            </Button>
          </>
        }
      />

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <Toolbar>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full sm:w-40"
              aria-label="Dari tanggal"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full sm:w-40"
              aria-label="Sampai tanggal"
            />
          </div>
          <Select value={campaignId} onValueChange={setCampaignId}>
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
        </div>
      </Toolbar>

      <StatStrip
        className="mb-4"
        loading={isLoading}
        items={[
          { label: 'Campaigns', value: summary?.totalCampaigns ?? 0, icon: ClipboardList },
          { label: 'Recipients', value: summary?.totalRecipients ?? 0, icon: Users },
          { label: 'Sent', value: (summary?.sent ?? 0) + (summary?.delivered ?? 0), icon: Send },
          { label: 'Read', value: summary?.read ?? 0, icon: Eye },
          { label: 'Read Rate', value: `${readRate}%`, icon: TrendingUp },
          { label: 'Forms', value: summary?.submitted ?? 0, icon: UserCheck, hint: `${submitRate}% submit` },
        ]}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Delivery by Campaign"
          description="Status breakdown per campaign"
          actions={
            <ul className="flex flex-wrap items-center gap-3">
              {Object.entries(STATUS_LABEL).map(([key, label]) => (
                <li key={key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: STATUS_COLOR[key] }}
                    aria-hidden="true"
                  />
                  {label}
                </li>
              ))}
            </ul>
          }
        >
          {isLoading ? (
            <div className="space-y-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No campaigns in range"
              description="Adjust the date range or campaign filter to see delivery data."
            />
          ) : (
            <ul className="space-y-3.5">
              {campaigns.map((c) => {
                const total = Math.max(c.totalRecipients, 1);
                const segments = (['pending', 'sent', 'delivered', 'read'] as const)
                  .map((key) => ({ key, value: c[key] }))
                  .filter((s) => s.value > 0);
                return (
                  <li key={c.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="truncate text-xs font-medium text-foreground">{c.name}</span>
                      <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                        {c.read}/{c.totalRecipients} read
                      </span>
                    </div>
                    <div
                      className="flex h-5 w-full gap-0.5 overflow-hidden rounded bg-background/60"
                      role="img"
                      aria-label={`${c.name}: ${c.pending} pending, ${c.sent} sent, ${c.delivered} delivered, ${c.read} read`}
                    >
                      {segments.map((s) => (
                        <div
                          key={s.key}
                          className="h-full"
                          style={{
                            width: `${(s.value / total) * 100}%`,
                            background: STATUS_COLOR[s.key],
                          }}
                          title={`${STATUS_LABEL[s.key]}: ${s.value}`}
                        />
                      ))}
                      {c.totalRecipients === 0 ? (
                        <div className="flex w-full items-center justify-center text-[10px] text-muted-foreground">
                          No recipients
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Delivery Trend"
          description="Daily status events from webhooks"
        >
          {isLoading ? (
            <Skeleton className="h-56 w-full" aria-label="Loading trend chart" />
          ) : timeline.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No activity in range"
              description="No delivery events were recorded for the selected period."
            />
          ) : (
            <TrendChart data={timeline} />
          )}
        </SectionCard>
      </div>

      <Toolbar>
        <TableViewControls
          view={view}
          searchPlaceholder="Search campaigns…"
          resultLabel="campaigns"
        />
      </Toolbar>

      <SectionCard
        title="Campaign Detail"
        description="Performance breakdown per campaign"
        bodyClassName="p-0 sm:p-0"
      >
        {isLoading ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : view.total === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={view.isFiltered ? 'No campaigns match the current filters' : 'No campaigns yet'}
            description={
              view.isFiltered
                ? 'Try adjusting the search, status, or creation period.'
                : 'Each campaign will be listed in this table.'
            }
            action={
              view.isFiltered
                ? { label: 'Reset Filters', onClick: view.reset }
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Read</TableHead>
                  <TableHead className="text-right">Read Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="min-w-40 font-medium text-foreground">{c.name}</TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="tabular text-right">{c.totalRecipients}</TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">{c.pending}</TableCell>
                    <TableCell className="tabular text-right text-chart-2">{c.sent}</TableCell>
                    <TableCell className="tabular text-right text-chart-4">{c.delivered}</TableCell>
                    <TableCell className="tabular text-right text-chart-1">{c.read}</TableCell>
                    <TableCell className="tabular text-right font-semibold">
                      {pct(c.read, c.totalRecipients)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {view.total > 0 && (
          <Pagination
            currentPage={view.page}
            totalPages={view.totalPages}
            totalItems={view.total}
            pageSize={view.pageSize}
            onPageChange={view.setPage}
            onPageSizeChange={view.setPageSize}
          />
        )}
      </SectionCard>

      <p className="mt-4 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        <Download className="size-3" aria-hidden="true" />
        Export follows the selected campaign filter
      </p>
    </div>
  );
}
