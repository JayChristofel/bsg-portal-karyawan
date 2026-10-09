'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ClipboardList,
  Eye,
  Megaphone,
  RefreshCw,
  Send,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  Toolbar,
} from './components/ui';
import { Pagination } from '@/components/ui/pagination';
import { TableViewControls } from '@/components/ui/table-view-controls';
import { useTableView } from '@/lib/table-view';

interface CampaignStats {
  id: number;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  readCount: number;
  createdAt: string;
}

interface PegawaiStats {
  total: number;
  submitted: number;
  notSubmitted: number;
}

export default function DashboardPage() {
  const [campaigns, setCampaigns] = React.useState<CampaignStats[]>([]);
  const [pegawaiStats, setPegawaiStats] = React.useState<PegawaiStats>({
    total: 0,
    submitted: 0,
    notSubmitted: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [campaignsRes, pegawaiRes] = await Promise.all([
        fetch('/api/campaigns', { cache: 'no-store' }),
        fetch('/api/recipients', { cache: 'no-store' }),
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns ?? []);
      }

      if (pegawaiRes.ok) {
        const data = await pegawaiRes.json();
        const recipients = data.recipients ?? [];
        const submitted = recipients.filter((r: { isSubmitted?: boolean }) => r.isSubmitted).length;
        setPegawaiStats({
          total: recipients.length,
          submitted,
          notSubmitted: recipients.length - submitted,
        });
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Could not load dashboard data. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totalRecipients = campaigns.reduce((sum, c) => sum + c.totalRecipients, 0);
  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
  const totalRead = campaigns.reduce((sum, c) => sum + c.readCount, 0);
  const overallReadRate = totalRecipients > 0 ? Math.round((totalRead / totalRecipients) * 100) : 0;
  const overallSubmitRate =
    pegawaiStats.total > 0 ? Math.round((pegawaiStats.submitted / pegawaiStats.total) * 100) : 0;

  const maxRecipients = Math.max(...campaigns.map((c) => c.totalRecipients), 1);

  const campaignStatusOptions = React.useMemo(() => {
    const present = new Set(campaigns.map((c) => c.status));
    return Array.from(present).sort().map((s) => ({ value: s, label: s }));
  }, [campaigns]);

  const readRateOf = (c: CampaignStats) =>
    c.totalRecipients > 0 ? (c.readCount / c.totalRecipients) * 100 : 0;

  const view = useTableView<CampaignStats>({
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
      { key: 'sent', label: 'Sent', value: (row) => row.sentCount },
      { key: 'read', label: 'Read', value: (row) => row.readCount },
      { key: 'rate', label: 'Read rate', value: (row) => readRateOf(row) },
    ],
    defaultSortKey: 'created',
    defaultSortDir: 'desc',
  });

  const metrics = [
    { label: 'Total Campaigns', value: campaigns.length, icon: ClipboardList, hint: 'All time' },
    { label: 'Total Recipients', value: totalRecipients, icon: Users, hint: 'Across all campaigns' },
    { label: 'Total Sent', value: totalSent, icon: Send, hint: 'Messages out of the gateway' },
    { label: 'Total Read', value: totalRead, icon: Eye, hint: 'Confirmed read' },
    { label: 'Read Rate', value: `${overallReadRate}%`, icon: TrendingUp, hint: `${totalRead} dari ${totalRecipients}` },
    { label: 'Submit Rate', value: `${overallSubmitRate}%`, icon: UserCheck, hint: `${pegawaiStats.submitted} submitted the form` },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Dashboard Analytics"
        description="Campaign performance and employee response summary."
        actions={
          <Button variant="outline" size="sm" onClick={() => void fetchData()} disabled={isLoading}>
            <RefreshCw className={isLoading ? 'animate-spin' : undefined} aria-hidden="true" />
            Perbarui
          </Button>
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

      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map((m) => (
          <MetricCard
            key={m.label}
            label={m.label}
            value={m.value}
            icon={m.icon}
            hint={m.hint}
            loading={isLoading}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Campaign Comparison"
          description="Recipients per campaign"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/campaigns">
                Kelola
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
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
              icon={Megaphone}
              title="No campaigns yet"
              description="Create your first campaign to compare performance here."
              action={{ label: 'Create Campaign', href: '/admin/campaigns' }}
            />
          ) : (
            <ul className="space-y-3.5">
              {campaigns.map((c) => {
                const width = (c.totalRecipients / maxRecipients) * 100;
                return (
                  <li key={c.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="truncate text-xs font-medium text-foreground">{c.name}</span>
                      <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                        {c.readCount}/{c.totalRecipients} read
                      </span>
                    </div>
                    <div
                      className="h-5 w-full overflow-hidden rounded bg-background/60"
                      role="img"
                      aria-label={`${c.name}: ${c.totalRecipients} recipients`}
                    >
                      <div
                        className="flex h-full min-w-fit items-center rounded bg-linear-to-r from-primary to-chart-2 px-2 text-[11px] font-semibold text-white"
                        style={{ width: `${width}%` }}
                      >
                        {c.totalRecipients}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Employee Response Rate" description="Employee form completion progress">
          {isLoading ? (
            <div className="flex items-center gap-6" aria-busy="true">
              <Skeleton className="size-32 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-6">
                <div className="relative size-32 shrink-0">
                  <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-border)" strokeWidth="12" />
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${(overallSubmitRate / 100) * 314} 314`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="tabular text-xl font-semibold text-foreground">
                      {overallSubmitRate}%
                    </span>
                  </div>
                </div>

                <ul className="min-w-0 flex-1 space-y-3">
                  <li className="flex items-center gap-2.5">
                    <span className="size-3 shrink-0 rounded-sm bg-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-sm text-foreground">Submitted</span>
                    <span className="tabular text-sm font-semibold text-foreground">
                      {pegawaiStats.submitted}
                    </span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="size-3 shrink-0 rounded-sm bg-border" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-sm text-foreground">Not Submitted</span>
                    <span className="tabular text-sm font-semibold text-foreground">
                      {pegawaiStats.notSubmitted}
                    </span>
                  </li>
                </ul>
              </div>

              <dl className="mt-5 grid grid-cols-1 gap-3 rounded-lg bg-background/40 p-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Read Rate</dt>
                  <dd className="tabular mt-0.5 font-semibold text-chart-2">
                    {overallReadRate}% of sent messages were read
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recipients</dt>
                  <dd className="tabular mt-0.5 font-semibold text-accent">
                    {totalRecipients} employees
                  </dd>
                </div>
              </dl>
            </>
          )}
        </SectionCard>
      </div>

      {/* Campaign table */}
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
                : { label: 'Create Campaign', href: '/admin/campaigns' }
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
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Read</TableHead>
                  <TableHead className="text-right">Read Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="tabular text-right">{c.totalRecipients}</TableCell>
                    <TableCell className="tabular text-right text-chart-2">{c.sentCount}</TableCell>
                    <TableCell className="tabular text-right text-accent">{c.readCount}</TableCell>
                    <TableCell className="tabular text-right font-semibold">
                      {Math.round(readRateOf(c))}%
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
    </div>
  );
}