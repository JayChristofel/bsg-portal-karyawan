'use client';

import * as React from 'react';
import { CABANG_GROUPS } from '@/lib/cabang';
import {
  Clock,
  Download,
  Globe,
  Laptop,
  MapPin,
  Monitor,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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

interface PegawaiRow {
  id: number;
  created_at: string;
  name: string;
  nip: string;
  jabatan_sk: string;
  jabatan_sekarang: string;
  cabang: string;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  screen_resolution: string | null;
  language: string | null;
  referrer: string | null;
  session_id: string | null;
  event: string | null;
  time_on_page: number | null;
  page_path: string | null;
  asn_isp: string | null;
  approx_location: string | null;
  connection_type: string | null;
}

interface EditForm {
  name: string;
  nip: string;
  jabatan_sk: string;
  jabatan_sekarang: string;
  cabang: string;
}

const EMPTY_FORM: EditForm = {
  name: '',
  nip: '',
  jabatan_sk: '',
  jabatan_sekarang: '',
  cabang: '',
};

const CABANG_OPTIONS = Object.entries(CABANG_GROUPS);

/* ────────────────────────────────────────────────────────────
   Shared field wrapper
   ──────────────────────────────────────────────────────────── */

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Audit detail modal
   ──────────────────────────────────────────────────────────── */

type DetailItem = { label: string; value: React.ReactNode; mono?: boolean };

function DetailSection({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: DetailItem[];
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-background/40 p-4">
      <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground uppercase">
        <span className="text-accent" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h4>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd
              className={
                item.mono
                  ? 'tabular mt-0.5 truncate text-sm text-chart-2'
                  : 'mt-0.5 truncate text-sm text-foreground'
              }
              title={typeof item.value === 'string' ? item.value : undefined}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AuditDetailDialog({ row, onClose }: { row: PegawaiRow | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {row ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">{row.name}</DialogTitle>
              <DialogDescription>
                Environment &amp; identity audit · Record ID #{row.id}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <DetailSection
                icon={<User className="size-3.5" />}
                title="Employment Identity"
                items={[
                  { label: 'Employee ID', value: row.nip, mono: true },
                  { label: 'Branch Office', value: row.cabang || '-' },
                  { label: 'Position per SK', value: row.jabatan_sk || '-' },
                  { label: 'Current Position', value: row.jabatan_sekarang || '-' },
                ]}
              />

              <DetailSection
                icon={<Monitor className="size-3.5" />}
                title="Device & Browser"
                items={[
                  { label: 'Device Type', value: row.device_type || 'Desktop' },
                  { label: 'Operating System', value: row.os || '-' },
                  { label: 'Browser', value: row.browser || '-' },
                  { label: 'Screen Resolution', value: row.screen_resolution || '-' },
                  { label: 'Language / Locale', value: row.language || 'id-ID' },
                  { label: 'Connection Type', value: row.connection_type || '-' },
                ]}
              />

              <DetailSection
                icon={<Globe className="size-3.5" />}
                title="Network & Geolocation"
                items={[
                  { label: 'IP Address', value: row.ip_address || '-', mono: true },
                  { label: 'ASN / ISP', value: row.asn_isp || '-' },
                  { label: 'Approx. Location', value: row.approx_location || 'Indonesia' },
                  { label: 'Referrer Asal', value: row.referrer || 'Direct' },
                ]}
              />

              <DetailSection
                icon={<Clock className="size-3.5" />}
                title="Activity & Timing"
                items={[
                  { label: 'Submitted At', value: row.created_at },
                  { label: 'Time on Page', value: `${row.time_on_page ?? 0} detik` },
                  { label: 'Page Path', value: row.page_path || '/', mono: true },
                  { label: 'Session ID', value: row.session_id || '-', mono: true },
                ]}
              />

              <div>
                <p className="mb-1.5 text-[11px] text-muted-foreground">Raw User-Agent</p>
                <code className="tabular block break-all rounded-md bg-background/60 p-2.5 text-[11px] text-muted-foreground">
                  {row.user_agent || '-'}
                </code>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Tutup
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────── */

export default function PegawaiPage() {
  const [data, setData] = React.useState<PegawaiRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [detailRow, setDetailRow] = React.useState<PegawaiRow | null>(null);

  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState<EditForm>(EMPTY_FORM);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editForm, setEditForm] = React.useState<EditForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/pegawai', { cache: 'no-store' });
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleAdd = async () => {
    if (
      !addForm.name.trim() ||
      !addForm.nip.trim() ||
      !addForm.jabatan_sk.trim() ||
      !addForm.jabatan_sekarang.trim() ||
      !addForm.cabang.trim()
    ) {
      setError('All fields are required.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/pegawai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const json = await res.json();
      if (json.success) {
        setAddForm(EMPTY_FORM);
        setAddOpen(false);
        void fetchData();
      } else {
        setError(json.error || 'Could not add the record.');
      }
    } catch {
      setError('A network error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (row: PegawaiRow) => {
    setEditingId(row.id);
    setEditForm({
      name: row.name,
      nip: row.nip,
      jabatan_sk: row.jabatan_sk,
      jabatan_sekarang: row.jabatan_sekarang,
      cabang: row.cabang,
    });
  };

  const handleSaveEdit = async (id: number) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pegawai/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (json.success) {
        setEditingId(null);
        void fetchData();
      } else {
        setError(json.error || 'Could not save the changes.');
      }
    } catch {
      setError('A network error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this employee record?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/pegawai/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        void fetchData();
      } else {
        setError(json.error || 'Could not delete the record.');
      }
    } catch {
      setError('A network error occurred.');
    }
  };

  const isMobileRow = (row: PegawaiRow) =>
    (row.device_type ?? '').toLowerCase().includes('mobile');

  const distinct = React.useCallback(
    (pick: (row: PegawaiRow) => string | null) =>
      Array.from(new Set(data.map(pick).filter((v): v is string => Boolean(v)))).sort(),
    [data],
  );

  const view = useTableView<PegawaiRow>({
    rows: data,
    searchFn: (row, q) =>
      (
        row.name +
        ' ' +
        row.nip +
        ' ' +
        row.jabatan_sk +
        ' ' +
        row.jabatan_sekarang +
        ' ' +
        (row.cabang ?? '') +
        ' ' +
        (row.ip_address ?? '') +
        ' ' +
        (row.os ?? '') +
        ' ' +
        (row.browser ?? '') +
        ' ' +
        (row.device_type ?? '')
      )
        .toLowerCase()
        .includes(q),
    filterFields: [
      {
        key: 'cabang',
        label: 'Branch',
        kind: 'select',
        options: distinct((r) => r.cabang).map((c) => ({ value: c, label: c })),
        match: (row, value) => row.cabang === value,
      },
      {
        key: 'device',
        label: 'Device type',
        kind: 'multi',
        options: [
          { value: 'mobile', label: 'Mobile' },
          { value: 'desktop', label: 'Desktop' },
        ],
        match: (row, values) =>
          values.some((v) =>
            v === 'mobile'
              ? isMobileRow(row)
              : !isMobileRow(row) && Boolean(row.device_type),
          ),
      },
      {
        key: 'os',
        label: 'Operating system',
        kind: 'select',
        options: distinct((r) => r.os).map((o) => ({ value: o, label: o })),
        match: (row, value) => row.os === value,
      },
      {
        key: 'browser',
        label: 'Browser',
        kind: 'select',
        options: distinct((r) => r.browser).map((b) => ({ value: b, label: b })),
        match: (row, value) => row.browser === value,
      },
      {
        key: 'event',
        label: 'Activity type',
        kind: 'select',
        options: distinct((r) => r.event).map((e) => ({ value: e, label: e })),
        match: (row, value) => row.event === value,
      },
      {
        key: 'submitted',
        label: 'Submission period',
        kind: 'date-range',
        dateOf: (row) => row.created_at,
      },
    ],
    sortFields: [
      { key: 'created', label: 'Submit time', value: (row) => row.created_at },
      { key: 'name', label: 'Full name', value: (row) => row.name },
      { key: 'nip', label: 'Employee ID', value: (row) => row.nip },
      {
        key: 'jabatan',
        label: 'Position',
        value: (row) => row.jabatan_sekarang ?? row.jabatan_sk,
      },
      { key: 'cabang', label: 'Branch', value: (row) => row.cabang },
    ],
    defaultSortKey: 'created',
    defaultSortDir: 'desc',
  });

  const mobileCount = React.useMemo(
    () => data.filter((r) => (r.device_type || '').toLowerCase().includes('mobile')).length,
    [data],
  );
  const cabangCount = React.useMemo(() => new Set(data.map((d) => d.cabang).filter(Boolean)).size, [data]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Employee Records & Environment Audit"
        description="Sensitive columns are AES-256-GCM encrypted, with device, network, and completion-time auditing."
        actions={
          <>
            <Button onClick={() => setAddOpen(true)}>
              <Plus aria-hidden="true" />
              Tambah Data
            </Button>
            <Button asChild variant="outline">
              <a href="/api/export.csv" download>
                <Download aria-hidden="true" />
                Download Summary CSV
              </a>
            </Button>
          </>
        }
      />

      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MetricCard label="Total Records" value={data.length} icon={Users} loading={isLoading} hint="All submissions" />
        <MetricCard label="Branches Recorded" value={cabangCount} icon={MapPin} loading={isLoading} hint="Branch offices" />
        <MetricCard label="Mobile Access" value={mobileCount} icon={Smartphone} loading={isLoading} hint="From mobile devices" />
        <MetricCard
          label="Filtered"
          value={view.total}
          icon={Search}
          loading={isLoading}
          hint={view.isFiltered ? 'From active filters' : 'All records'}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="cursor-pointer opacity-70 hover:opacity-100"
            aria-label="Dismiss error message"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Filters */}
      <Toolbar>
        <TableViewControls
          view={view}
          searchPlaceholder="Search name, NIP, position, IP, device…"
          resultLabel="employee records"
        />
      </Toolbar>

      {/* Table */}
      <SectionCard bodyClassName="p-0 sm:p-0">
        {isLoading ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : view.total === 0 ? (
          <EmptyState
            icon={Users}
            title={view.isFiltered ? 'No records match these filters' : 'No employee records yet'}
            description={
              view.isFiltered
                ? 'Try adjusting the search, filters, or date period.'
                : 'Add the first employee record to get started.'
            }
            action={
              view.isFiltered
                ? { label: 'Reset Filters', onClick: view.reset }
                : { label: 'Add Record', onClick: () => setAddOpen(true) }
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Branch Office</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Network / Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((row) => {
                  const isEditing = editingId === row.id;
                  const isMobile = isMobileRow(row);
                  const DeviceIcon = isMobile ? Smartphone : Laptop;

                  return (
                    <TableRow
                      key={row.id}
                      className={isEditing ? 'bg-background/50' : undefined}
                    >
                      <TableCell className="tabular text-xs text-muted-foreground">{row.id}</TableCell>

                      <TableCell className="tabular text-xs whitespace-nowrap text-muted-foreground">
                        {row.created_at}
                      </TableCell>

                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="h-8 min-w-32"
                            aria-label="Name"
                          />
                        ) : (
                          <span className="font-medium text-foreground">{row.name}</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={editForm.nip}
                            onChange={(e) => setEditForm({ ...editForm, nip: e.target.value })}
                            className="tabular h-8 min-w-40"
                            aria-label="Employee ID"
                          />
                        ) : (
                          <code className="tabular rounded bg-background/60 px-1.5 py-0.5 text-xs text-chart-2">
                            {row.nip}
                          </code>
                        )}
                      </TableCell>

                      <TableCell>
                        {isEditing ? (
                          <div className="flex min-w-44 flex-col gap-1.5">
                            <Input
                              value={editForm.jabatan_sekarang}
                              onChange={(e) =>
                                setEditForm({ ...editForm, jabatan_sekarang: e.target.value })
                              }
                              placeholder="Current position"
                              className="h-8"
                              aria-label="Current position"
                            />
                            <Input
                              value={editForm.jabatan_sk}
                              onChange={(e) => setEditForm({ ...editForm, jabatan_sk: e.target.value })}
                              placeholder="SK position"
                              className="h-8"
                              aria-label="SK position"
                            />
                          </div>
                        ) : (
                          <div className="min-w-40">
                            <div className="font-medium text-foreground">{row.jabatan_sekarang}</div>
                            <div className="text-[11px] text-muted-foreground">SK: {row.jabatan_sk}</div>
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        {isEditing ? (
                          <Select
                            value={editForm.cabang}
                            onValueChange={(v) => setEditForm({ ...editForm, cabang: v })}
                          >
                            <SelectTrigger className="h-8 min-w-40" aria-label="Branch office">
                              <SelectValue placeholder="Select branch" />
                            </SelectTrigger>
                            <SelectContent>
                              {CABANG_OPTIONS.map(([grp, items]) => (
                                <SelectGroup key={grp}>
                                  <SelectLabel>{grp}</SelectLabel>
                                  {items.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm">{row.cabang}</span>
                        )}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs">
                          <DeviceIcon className="size-3.5 text-accent" aria-hidden="true" />
                          <span className="font-medium text-foreground">{row.os || 'OS'}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.browser || '-'} · {row.device_type || 'Desktop'}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="tabular text-xs text-chart-2">{row.ip_address || '-'}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="size-3 shrink-0" aria-hidden="true" />
                          <span className="max-w-40 truncate">{row.approx_location || 'Indonesia'}</span>
                        </div>
                      </TableCell>

                      <TableCell className="text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleSaveEdit(row.id)}
                              disabled={isSaving}
                            >
                              Simpan
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                              aria-label="Cancel edit"
                            >
                              <X aria-hidden="true" />
                            </Button>
                          </div>
                        ) : (
                          <div className="inline-flex gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setDetailRow(row)}
                              title="View full audit details"
                              aria-label={`View audit details for ${row.name}`}
                            >
                              <Search aria-hidden="true" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => handleStartEdit(row)}
                              title="Edit employee record"
                              aria-label={`Edit ${row.name}`}
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => void handleDelete(row.id)}
                              title="Delete record"
                              aria-label={`Delete ${row.name}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="glass-strong sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Add New Employee Record</DialogTitle>
            <DialogDescription>
              Fill in every field. Data is encrypted before storage.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full Name" htmlFor="add-name">
              <Input
                id="add-name"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="e.g. Andi Pratama"
              />
            </Field>
            <Field label="NIP" htmlFor="add-nip">
              <Input
                id="add-nip"
                value={addForm.nip}
                onChange={(e) => setAddForm({ ...addForm, nip: e.target.value })}
                placeholder="198501012010011001"
                className="tabular"
              />
            </Field>
            <Field label="SK Position" htmlFor="add-jabatan-sk">
              <Input
                id="add-jabatan-sk"
                value={addForm.jabatan_sk}
                onChange={(e) => setAddForm({ ...addForm, jabatan_sk: e.target.value })}
                placeholder="Position per SK"
              />
            </Field>
            <Field label="Current Position" htmlFor="add-jabatan-sekarang">
              <Input
                id="add-jabatan-sekarang"
                value={addForm.jabatan_sekarang}
                onChange={(e) => setAddForm({ ...addForm, jabatan_sekarang: e.target.value })}
                placeholder="Current position"
              />
            </Field>
            <Field label="Branch Office" className="sm:col-span-2">
              <Select
                value={addForm.cabang}
                onValueChange={(v) => setAddForm({ ...addForm, cabang: v })}
              >
                <SelectTrigger aria-label="Select branch office">
                  <SelectValue placeholder="-- Select Branch Office --" />
                </SelectTrigger>
                <SelectContent>
                  {CABANG_OPTIONS.map(([grp, items]) => (
                    <SelectGroup key={grp}>
                      <SelectLabel>{grp}</SelectLabel>
                      {items.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void handleAdd()} disabled={isSaving}>
              Save Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AuditDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  );
}