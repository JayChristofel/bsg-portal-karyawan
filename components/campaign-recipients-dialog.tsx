'use client';

import * as React from 'react';
import { Loader2, Search, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/app/admin/components/ui';

export interface CampaignRecipientRow {
  id: number;
  title: string;
  subtitle?: string | null;
  cabang?: string | null;
  status: string;
  sentAt?: string | null;
  events?: { event: string; createdAt: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignName: string;
  /** Recipients can only be added/removed while the campaign has not started sending. */
  editable: boolean;
  isLoading: boolean;
  isBusy: boolean;
  members: CampaignRecipientRow[];
  /** Recipients not yet in any campaign. */
  candidates: CampaignRecipientRow[];
  onAdd: (ids: number[]) => void;
  onRemove: (ids: number[]) => void;
}

const REMOVABLE = new Set(['pending', 'failed']);

function matches(row: CampaignRecipientRow, q: string): boolean {
  if (!q) return true;
  const hay = `${row.title} ${row.subtitle ?? ''} ${row.cabang ?? ''}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function CampaignRecipientsDialog({
  open,
  onOpenChange,
  campaignName,
  editable,
  isLoading,
  isBusy,
  members,
  candidates,
  onAdd,
  onRemove,
}: Props) {
  const [tab, setTab] = React.useState<'members' | 'add'>('members');
  const [query, setQuery] = React.useState('');
  const [picked, setPicked] = React.useState<Set<number>>(new Set());

  // A fresh dialog (or a changed list) must not keep ids that no longer exist.
  React.useEffect(() => {
    if (!open) {
      setPicked(new Set());
      setQuery('');
      setTab('members');
    }
  }, [open]);
  React.useEffect(() => setPicked(new Set()), [tab, members, candidates]);

  const rows = (tab === 'members' ? members : candidates).filter((r) => matches(r, query));
  const selectable = rows.filter((r) => (tab === 'add' ? true : REMOVABLE.has(r.status)));
  const allPicked = selectable.length > 0 && selectable.every((r) => picked.has(r.id));

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(selectable.map((r) => r.id)));

  const counts = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">Penerima — {campaignName}</DialogTitle>
          <DialogDescription>
            {members.length} penerima
            {Object.entries(counts).map(([s, n]) => ` · ${s}: ${n}`)}
            {editable ? '' : ' · kampanye ini tidak bisa diubah penerimanya lagi.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5">
          {(
            [
              ['members', `Anggota (${members.length})`],
              ...(editable ? ([['add', `Tambah (${candidates.length})`]] as const) : []),
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, kontak, atau cabang…"
            className="pl-8"
            aria-label="Cari penerima"
          />
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border/60">
          {isLoading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Memuat…
            </p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {tab === 'add'
                ? 'Tidak ada penerima yang belum masuk kampanye.'
                : 'Belum ada penerima di kampanye ini.'}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {editable && selectable.length > 0 ? (
                <li className="flex items-center gap-3 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                  <Checkbox checked={allPicked} onCheckedChange={toggleAll} aria-label="Pilih semua yang tampil" />
                  Pilih semua yang tampil ({selectable.length})
                </li>
              ) : null}
              {rows.map((r) => {
                const canPick = editable && (tab === 'add' || REMOVABLE.has(r.status));
                return (
                  <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                    {canPick ? (
                      <Checkbox
                        checked={picked.has(r.id)}
                        onCheckedChange={() => toggle(r.id)}
                        aria-label={`Pilih ${r.title}`}
                        className="mt-0.5"
                      />
                    ) : (
                      <span className="w-4" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[r.subtitle, r.cabang].filter(Boolean).join(' · ') || '-'}
                      </p>
                      {r.events && r.events.length > 0 ? (
                        <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          {r.events.map((e) => (
                            <span key={`${e.event}-${e.createdAt}`} className="tabular">
                              {e.event} · {new Date(e.createdAt).toLocaleString('id-ID')}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge status={r.status} />
                      {r.sentAt ? (
                        <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(r.sentAt).toLocaleString('id-ID')}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          {editable && tab === 'add' ? (
            <Button onClick={() => onAdd([...picked])} disabled={isBusy || picked.size === 0}>
              {isBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
              Tambahkan {picked.size || ''}
            </Button>
          ) : null}
          {editable && tab === 'members' ? (
            <Button variant="outline" onClick={() => onRemove([...picked])} disabled={isBusy || picked.size === 0}>
              {isBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserMinus aria-hidden="true" />}
              Keluarkan {picked.size || ''}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
