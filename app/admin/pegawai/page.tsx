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
                Audit lingkungan &amp; identitas · Record ID #{row.id}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <DetailSection
                icon={<User className="size-3.5" />}
                title="Identitas Kepegawaian"
                items={[
                  { label: 'NIP', value: row.nip, mono: true },
                  { label: 'Kantor Cabang', value: row.cabang || '-' },
                  { label: 'Jabatan sesuai SK', value: row.jabatan_sk || '-' },
                  { label: 'Jabatan Saat Ini', value: row.jabatan_sekarang || '-' },
                ]}
              />

              <DetailSection
                icon={<Monitor className="size-3.5" />}
                title="Perangkat & Browser"
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
                title="Jaringan & Geolokasi"
                items={[
                  { label: 'IP Address', value: row.ip_address || '-', mono: true },
                  { label: 'ASN / ISP', value: row.asn_isp || '-' },
                  { label: 'Approx. Location', value: row.approx_location || 'Indonesia' },
                  { label: 'Referrer Asal', value: row.referrer || 'Direct' },
                ]}
              />

              <DetailSection
                icon={<Clock className="size-3.5" />}
                title="Aktivitas & Waktu"
                items={[
                  { label: 'Waktu Submit', value: row.created_at },
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
  const [search, setSearch] = React.useState('');
  const [selectedCabang, setSelectedCabang] = React.useState('all');
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
      setError('Semua kolom wajib diisi.');
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
        setError(json.error || 'Gagal menambah data.');
      }
    } catch {
      setError('Terjadi kesalahan jaringan.');
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
        setError(json.error || 'Gagal menyimpan perubahan.');
      }
    } catch {
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data pegawai ini?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/pegawai/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        void fetchData();
      } else {
        setError(json.error || 'Gagal menghapus.');
      }
    } catch {
      setError('Terjadi kesalahan jaringan.');
    }
  };

  const cabangList = React.useMemo(
    () => Array.from(new Set(data.map((d) => d.cabang).filter(Boolean))).sort(),
    [data],
  );

  const filteredData = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((row) => {
      const matchSearch = q
        ? (
            row.name +
            ' ' +
            row.nip +
            ' ' +
            row.jabatan_sk +
            ' ' +
            row.jabatan_sekarang +
            ' ' +
            (row.ip_address ?? '') +
            ' ' +
            (row.os ?? '') +
            ' ' +
            (row.device_type ?? '')
          )
            .toLowerCase()
            .includes(q)
        : true;
      const matchCabang = selectedCabang === 'all' ? true : row.cabang === selectedCabang;
      return matchSearch && matchCabang;
    });
  }, [data, search, selectedCabang]);

  const mobileCount = React.useMemo(
    () => data.filter((r) => (r.device_type || '').toLowerCase().includes('mobile')).length,
    [data],
  );
  const cabangCount = React.useMemo(() => new Set(data.map((d) => d.cabang).filter(Boolean)).size, [data]);
  const isFiltered = search.trim() !== '' || selectedCabang !== 'all';

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Data Pegawai & Audit Lingkungan"
        description="Kolom sensitif terenkripsi AES-256-GCM, dilengkapi audit perangkat, jaringan, dan waktu pengisian."
        actions={
          <>
            <Button onClick={() => setAddOpen(true)}>
              <Plus aria-hidden="true" />
              Tambah Data
            </Button>
            <Button asChild variant="outline">
              <a href="/api/export.csv" download>
                <Download aria-hidden="true" />
                Unduh Rekap CSV
              </a>
            </Button>
          </>
        }
      />

      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MetricCard label="Total Data" value={data.length} icon={Users} loading={isLoading} hint="Seluruh submission" />
        <MetricCard label="Cabang Terdata" value={cabangCount} icon={MapPin} loading={isLoading} hint="Kantor cabang" />
        <MetricCard label="Akses Mobile" value={mobileCount} icon={Smartphone} loading={isLoading} hint="Dari perangkat ponsel" />
        <MetricCard
          label="Tersaring"
          value={filteredData.length}
          icon={Search}
          loading={isLoading}
          hint={isFiltered ? 'Dari filter aktif' : 'Seluruh data'}
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
            aria-label="Tutup pesan error"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Filters */}
      <Toolbar>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, NIP, jabatan, IP, perangkat…"
              className="pl-9"
              aria-label="Cari data pegawai"
            />
          </div>
          <Select value={selectedCabang} onValueChange={setSelectedCabang}>
            <SelectTrigger className="sm:w-64" aria-label="Filter kantor cabang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Cabang ({data.length})</SelectItem>
              {cabangList.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Menampilkan <span className="tabular font-semibold text-foreground">{filteredData.length}</span>{' '}
          dari <span className="tabular">{data.length}</span> data
        </p>
      </Toolbar>

      {/* Table */}
      <SectionCard bodyClassName="p-0 sm:p-0">
        {isLoading ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : filteredData.length === 0 ? (
          <EmptyState
            icon={Users}
            title={isFiltered ? 'Tidak ditemukan data yang cocok' : 'Belum ada data pegawai'}
            description={
              isFiltered
                ? 'Coba ubah kata kunci pencarian atau filter cabang.'
                : 'Tambahkan data pegawai pertama untuk memulai.'
            }
            action={
              isFiltered
                ? {
                    label: 'Reset Filter',
                    onClick: () => {
                      setSearch('');
                      setSelectedCabang('all');
                    },
                  }
                : { label: 'Tambah Data', onClick: () => setAddOpen(true) }
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Nama Lengkap</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Kantor Cabang</TableHead>
                  <TableHead>Perangkat</TableHead>
                  <TableHead>Jaringan / Lokasi</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((row) => {
                  const isEditing = editingId === row.id;
                  const isMobile = (row.device_type || '').toLowerCase().includes('mobile');
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
                            aria-label="Nama"
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
                            aria-label="NIP"
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
                              placeholder="Jabatan Sekarang"
                              className="h-8"
                              aria-label="Jabatan Sekarang"
                            />
                            <Input
                              value={editForm.jabatan_sk}
                              onChange={(e) => setEditForm({ ...editForm, jabatan_sk: e.target.value })}
                              placeholder="Jabatan SK"
                              className="h-8"
                              aria-label="Jabatan SK"
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
                            <SelectTrigger className="h-8 min-w-40" aria-label="Kantor Cabang">
                              <SelectValue placeholder="Pilih cabang" />
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
                              aria-label="Batal edit"
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
                              title="Lihat rincian audit lengkap"
                              aria-label={`Lihat rincian audit ${row.name}`}
                            >
                              <Search aria-hidden="true" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => handleStartEdit(row)}
                              title="Edit data pegawai"
                              aria-label={`Edit data ${row.name}`}
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => void handleDelete(row.id)}
                              title="Hapus data"
                              aria-label={`Hapus data ${row.name}`}
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
      </SectionCard>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="glass-strong sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Tambah Data Pegawai Baru</DialogTitle>
            <DialogDescription>
              Isi seluruh kolom. Data akan dienkripsi sebelum disimpan.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nama Lengkap" htmlFor="add-name">
              <Input
                id="add-name"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="Contoh: Andi Pratama"
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
            <Field label="Jabatan SK" htmlFor="add-jabatan-sk">
              <Input
                id="add-jabatan-sk"
                value={addForm.jabatan_sk}
                onChange={(e) => setAddForm({ ...addForm, jabatan_sk: e.target.value })}
                placeholder="Jabatan sesuai SK"
              />
            </Field>
            <Field label="Jabatan Sekarang" htmlFor="add-jabatan-sekarang">
              <Input
                id="add-jabatan-sekarang"
                value={addForm.jabatan_sekarang}
                onChange={(e) => setAddForm({ ...addForm, jabatan_sekarang: e.target.value })}
                placeholder="Jabatan saat ini"
              />
            </Field>
            <Field label="Kantor Cabang" className="sm:col-span-2">
              <Select
                value={addForm.cabang}
                onValueChange={(v) => setAddForm({ ...addForm, cabang: v })}
              >
                <SelectTrigger aria-label="Pilih kantor cabang">
                  <SelectValue placeholder="-- Pilih Kantor Cabang --" />
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
              Simpan Pegawai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AuditDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  );
}