'use client';

import * as React from 'react';
import { RefreshCw, ScrollText, ShieldAlert, ShieldCheck } from 'lucide-react';

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
import { EmptyState, MetricCard, PageHeader, SectionCard, Toolbar } from '../components/ui';
import { Pagination } from '@/components/ui/pagination';
import { TableViewControls } from '@/components/ui/table-view-controls';
import type { ActiveChip, DateRange, SortDir, TableView } from '@/lib/table-view';

interface AuditLog {
  id: number;
  adminUsername: string;
  action: string;
  detail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Read-only palette: colour is decorative, never the sole signal. */
const ACTION_STYLE: Record<string, string> = {
  login: 'border-accent/30 bg-accent/10 text-accent',
  logout: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  login_failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  send_message: 'border-chart-2/30 bg-chart-2/10 text-chart-2',
  send_campaign: 'border-chart-2/30 bg-chart-2/10 text-chart-2',
  save_template: 'border-chart-3/30 bg-chart-3/10 text-chart-3',
  update_template: 'border-chart-3/30 bg-chart-3/10 text-chart-3',
  create_campaign: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  update_campaign: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  delete_template: 'border-destructive/30 bg-destructive/10 text-destructive',
  delete_campaign: 'border-destructive/30 bg-destructive/10 text-destructive',
  delete_admin: 'border-destructive/30 bg-destructive/10 text-destructive',
  create_admin: 'border-accent/30 bg-accent/10 text-accent',
  update_admin: 'border-accent/30 bg-accent/10 text-accent',
  delete_employee: 'border-destructive/30 bg-destructive/10 text-destructive',
  update_employee: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  create_employee: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  delete_recipient: 'border-destructive/30 bg-destructive/10 text-destructive',
  update_recipient: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  import_recipients: 'border-chart-3/30 bg-chart-3/10 text-chart-3',
  public_submit: 'border-chart-2/30 bg-chart-2/10 text-chart-2',
  assign_recipients: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  export_recipients: 'border-chart-3/30 bg-chart-3/10 text-chart-3',
  export_employee_records: 'border-chart-3/30 bg-chart-3/10 text-chart-3',
  update_gateway_config: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  update_webhook_config: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  webhook_invalid_signature: 'border-destructive/30 bg-destructive/10 text-destructive',
  view_admins: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_admin_activity: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_audit_log: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_campaigns: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_employees: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_recipients: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_templates: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_tracking: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_delivery_history: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_gateway_config: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_gateway_status: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_webhook_config: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  view_qr_image: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  request_qr: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
};

const ACTION_LABEL: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  login_failed: 'Login Failed',
  send_message: 'Send Message',
  send_campaign: 'Send Campaign',
  save_template: 'Save Template',
  update_template: 'Update Template',
  delete_template: 'Delete Template',
  create_campaign: 'Create Campaign',
  update_campaign: 'Update Campaign',
  delete_campaign: 'Delete Campaign',
  create_admin: 'Create Admin',
  update_admin: 'Update Admin',
  delete_admin: 'Delete Admin',
  create_employee: 'Create Employee Record',
  update_employee: 'Update Employee Record',
  delete_employee: 'Delete Employee Record',
  create_recipient: 'Create Recipient',
  update_recipient: 'Update Recipient',
  delete_recipient: 'Delete Recipient',
  import_recipients: 'Import Recipients',
  public_submit: 'Public Form Submission',
  assign_recipients: 'Add Recipient',
  export_recipients: 'Export Recipients',
  export_employee_records: 'Export Employee Records',
  update_gateway_config: 'Update Gateway Config',
  update_webhook_config: 'Update Webhook Config',
  webhook_invalid_signature: 'Webhook Signature Rejected',
  view_admins: 'View Admin List',
  view_admin_activity: 'View Admin Activity',
  view_audit_log: 'View Audit Log',
  view_campaigns: 'View Campaign List',
  view_employees: 'View Employee Records',
  view_recipients: 'View Recipient List',
  view_templates: 'View Template List',
  view_tracking: 'View Delivery Status',
  view_delivery_history: 'View Delivery Timeline',
  view_gateway_config: 'View Gateway Config',
  view_gateway_status: 'View Gateway Status',
  view_webhook_config: 'View Webhook Config',
  view_qr_image: 'View QR Image',
  request_qr: 'Request Pairing QR',
};

const FALLBACK_STYLE = 'border-muted-foreground/30 bg-muted/40 text-muted-foreground';

type AuditResponse = {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  destructive: number;
  facets: { admins: string[]; actions: string[] };
};

export default function AuditPage() {
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [destructive, setDestructive] = React.useState(0);
  const [facets, setFacets] = React.useState<{ admins: string[]; actions: string[] }>({
    admins: [],
    actions: [],
  });
  const [isLoading, setIsLoading] = React.useState(true);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [query, setQuery] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [actionFilter, setActionFilter] = React.useState('all');
  const [adminFilter, setAdminFilter] = React.useState('all');
  const [range, setRange] = React.useState<DateRange>({ from: '', to: '' });
  const [sortKey, setSortKey] = React.useState('created');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');

  // Debounce so typing in the search box does not fire a request per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchLogs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort: sortKey,
        dir: sortDir,
      });
      if (search) params.set('search', search);
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (adminFilter !== 'all') params.set('admin', adminFilter);
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);

      const res = await fetch(`/api/audit?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data: AuditResponse = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setDestructive(data.destructive ?? 0);
      if (data.facets) setFacets(data.facets);
    } catch (err) {
      console.error('Fetch audit logs error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, actionFilter, adminFilter, range.from, range.to, sortKey, sortDir]);

  React.useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Any change to the query itself invalidates the current page offset.
  React.useEffect(() => {
    setPage(1);
  }, [search, actionFilter, adminFilter, range.from, range.to, sortKey, sortDir, pageSize]);

  const actionOptions = React.useMemo(
    () => facets.actions.map((a) => ({ value: a, label: ACTION_LABEL[a] ?? a })),
    [facets.actions],
  );

  const adminOptions = React.useMemo(
    () => facets.admins.map((a) => ({ value: a, label: a })),
    [facets.admins],
  );

  const reset = React.useCallback(() => {
    setQuery('');
    setSearch('');
    setActionFilter('all');
    setAdminFilter('all');
    setRange({ from: '', to: '' });
    setPage(1);
  }, []);

  const chips: ActiveChip[] = [];
  if (search) chips.push({ key: 'search', group: 'Search', text: search, onClear: () => setQuery('') });
  if (actionFilter !== 'all') {
    chips.push({
      key: 'action',
      group: 'Action',
      text: ACTION_LABEL[actionFilter] ?? actionFilter,
      onClear: () => setActionFilter('all'),
    });
  }
  if (adminFilter !== 'all') {
    chips.push({ key: 'admin', group: 'Admin', text: adminFilter, onClear: () => setAdminFilter('all') });
  }
  if (range.from || range.to) {
    chips.push({
      key: 'created',
      group: 'Period',
      text: `${range.from || '…'} → ${range.to || '…'}`,
      onClear: () => setRange({ from: '', to: '' }),
    });
  }

  const isFiltered = chips.length > 0;

  // The audit table is paginated on the server, so this adapter exists only to
  // reuse the shared filter/sort controls against the query string.
  const view: TableView<AuditLog> = {
    rows: logs,
    pageRows: logs,
    total,
    totalPages,
    page,
    pageSize,
    setPage,
    setPageSize,
    query,
    setQuery,
    filterValues: {
      action: actionFilter === 'all' ? null : actionFilter,
      admin: adminFilter === 'all' ? null : adminFilter,
      created: range.from || range.to ? range : null,
    },
    setFilter: (key, value) => {
      if (key === 'action') setActionFilter(typeof value === 'string' && value ? value : 'all');
      if (key === 'admin') setAdminFilter(typeof value === 'string' && value ? value : 'all');
      if (key === 'created') {
        const next = (value ?? {}) as Partial<DateRange>;
        setRange({ from: next.from ?? '', to: next.to ?? '' });
      }
    },
    toggleMulti: () => {},
    getMulti: () => [],
    sortKey,
    sortDir,
    setSort: (key, dir) => {
      if (dir) {
        setSortKey(key);
        setSortDir(dir);
        return;
      }
      if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    filterFields: [
      { key: 'action', label: 'Action type', kind: 'select', options: actionOptions, match: () => true },
      { key: 'admin', label: 'Administrator', kind: 'select', options: adminOptions, match: () => true },
      { key: 'created', label: 'Time period', kind: 'date-range', dateOf: (row) => row.createdAt },
    ],
    sortFields: [
      { key: 'created', label: 'Time', value: (row) => row.createdAt },
      { key: 'action', label: 'Action type', value: (row) => ACTION_LABEL[row.action] ?? row.action },
      { key: 'admin', label: 'Administrator', value: (row) => row.adminUsername },
      { key: 'ip', label: 'IP Address', value: (row) => row.ipAddress },
    ],
    activeCount: chips.length,
    chips,
    reset,
    isFiltered,
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Audit Log"
        description="Every read and change recorded for security and accountability."
        actions={
          <Button variant="outline" onClick={() => void fetchLogs()}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <MetricCard label="Total Entries" value={total} icon={ScrollText} loading={isLoading} />
        <MetricCard label="Actors Involved" value={facets.admins.length} icon={ShieldCheck} loading={isLoading} />
        <MetricCard
          label="Destructive Actions"
          value={destructive}
          icon={ShieldAlert}
          loading={isLoading}
          hint="Matching the current filter"
        />
      </div>

      <Toolbar>
        <TableViewControls
          view={view}
          searchPlaceholder="Search admin, detail, action, or IP…"
          resultLabel="log entries"
        />
      </Toolbar>

      <SectionCard bodyClassName="p-0 sm:p-0">
        {isLoading ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={isFiltered ? 'No logs match these filters' : 'No activity logged yet'}
            description={
              isFiltered
                ? 'Try adjusting the search, action type, administrator, or time period.'
                : 'Every login and admin data change is recorded here.'
            }
            action={isFiltered ? { label: 'Reset Filter', onClick: reset } : undefined}
          />
        ) : (
          <>
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="bg-background/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-44">Actions</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead className="hidden md:table-cell">Time</TableHead>
                    <TableHead className="hidden lg:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
                            ACTION_STYLE[log.action] ?? FALLBACK_STYLE
                          }`}
                        >
                          {ACTION_LABEL[log.action] ?? log.action}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-0">
                        <span className="font-medium text-foreground">{log.adminUsername}</span>
                        {log.detail ? (
                          <span className="text-muted-foreground"> — {log.detail}</span>
                        ) : null}
                        <span className="tabular mt-0.5 block text-[11px] text-muted-foreground/80 md:hidden">
                          {new Date(log.createdAt).toLocaleString('id-ID')}
                        </span>
                      </TableCell>
                      <TableCell className="tabular hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                        {new Date(log.createdAt).toLocaleString('id-ID')}
                      </TableCell>
                      <TableCell className="tabular hidden text-xs text-chart-2 lg:table-cell">
                        {log.ipAddress || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
}
