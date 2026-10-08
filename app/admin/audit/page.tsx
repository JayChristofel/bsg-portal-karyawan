'use client';

import * as React from 'react';
import { RefreshCw, ScrollText, ShieldAlert, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { EmptyState, MetricCard, PageHeader, SectionCard, Toolbar } from '../components/ui';
import { Pagination } from '@/components/ui/pagination';
import { TableViewControls } from '@/components/ui/table-view-controls';
import { useTableView } from '@/lib/table-view';

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
  assign_recipients: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
};

const ACTION_LABEL: Record<string, string> = {
  login: 'Login',
  send_message: 'Kirim Pesan',
  send_campaign: 'Kirim Kampanye',
  save_template: 'Simpan Template',
  update_template: 'Ubah Template',
  delete_template: 'Hapus Template',
  create_campaign: 'Buat Kampanye',
  update_campaign: 'Ubah Kampanye',
  delete_campaign: 'Hapus Kampanye',
  create_admin: 'Buat Admin',
  delete_admin: 'Hapus Admin',
  assign_recipients: 'Tambah Penerima',
};

const FALLBACK_STYLE = 'border-muted-foreground/30 bg-muted/40 text-muted-foreground';

export default function AuditPage() {
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [limit, setLimit] = React.useState('50');

  const fetchLogs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit });
      const res = await fetch(`/api/audit?${params}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } catch (err) {
      console.error('Fetch audit logs error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  React.useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const uniqueAdmins = React.useMemo(
    () => Array.from(new Set(logs.map((l) => l.adminUsername))).sort(),
    [logs],
  );

  const actionOptions = React.useMemo(() => {
    const present = new Set(logs.map((l) => l.action));
    return Array.from(present)
      .sort()
      .map((action) => ({ value: action, label: ACTION_LABEL[action] ?? action }));
  }, [logs]);

  const view = useTableView<AuditLog>({
    rows: logs,
    searchFn: (row, q) =>
      row.adminUsername.toLowerCase().includes(q) ||
      (row.detail ?? '').toLowerCase().includes(q) ||
      (row.ipAddress ?? '').toLowerCase().includes(q) ||
      row.action.toLowerCase().includes(q),
    filterFields: [
      {
        key: 'action',
        label: 'Jenis aksi',
        kind: 'multi',
        options: actionOptions,
        match: (row, values) => values.includes(row.action),
      },
      {
        key: 'admin',
        label: 'Administrator',
        kind: 'select',
        options: uniqueAdmins.map((a) => ({ value: a, label: a })),
        match: (row, value) => row.adminUsername === value,
      },
      {
        key: 'created',
        label: 'Periode waktu',
        kind: 'date-range',
        dateOf: (row) => row.createdAt,
      },
    ],
    sortFields: [
      { key: 'created', label: 'Waktu', value: (row) => row.createdAt },
      { key: 'action', label: 'Jenis aksi', value: (row) => ACTION_LABEL[row.action] ?? row.action },
      { key: 'admin', label: 'Administrator', value: (row) => row.adminUsername },
      { key: 'ip', label: 'IP Address', value: (row) => row.ipAddress },
    ],
    defaultSortKey: 'created',
    defaultSortDir: 'desc',
  });

  const destructiveCount = React.useMemo(
    () => logs.filter((l) => l.action.startsWith('delete')).length,
    [logs],
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Audit Log"
        description="Jejak aktivitas administrator untuk keamanan dan akuntabilitas."
        actions={
          <Button variant="outline" onClick={() => void fetchLogs()}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <MetricCard label="Entri Dimuat" value={logs.length} icon={ScrollText} loading={isLoading} />
        <MetricCard label="Admin Terlibat" value={uniqueAdmins.length} icon={ShieldCheck} loading={isLoading} />
        <MetricCard
          label="Aksi Destruktif"
          value={destructiveCount}
          icon={ShieldAlert}
          loading={isLoading}
          hint="Penghapusan data"
        />
      </div>

      <Toolbar>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TableViewControls
            view={view}
            searchPlaceholder="Cari admin, detail, atau IP…"
            resultLabel="entri log"
          />
          <Select value={limit} onValueChange={setLimit}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Muat jumlah entri">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['20', '50', '100', '200', '500'].map((n) => (
                <SelectItem key={n} value={n}>
                  {n} entri
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      <SectionCard bodyClassName="p-0 sm:p-0">
        {isLoading ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : view.total === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={view.isFiltered ? 'Tidak ditemukan log yang cocok' : 'Belum ada log aktivitas'}
            description={
              view.isFiltered
                ? 'Coba ubah kata kunci, jenis aksi, atau periode waktu.'
                : 'Setiap login dan perubahan data admin akan tercatat di sini.'
            }
            action={view.isFiltered ? { label: 'Reset Filter', onClick: view.reset } : undefined}
          />
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader className="bg-background/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-44">Aksi</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="hidden md:table-cell">Waktu</TableHead>
                  <TableHead className="hidden lg:table-cell">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((log) => (
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