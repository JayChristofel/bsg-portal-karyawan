'use client';

import * as React from 'react';
import { ArrowDownAZ, ArrowUpAZ, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';

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
import type { DateRange, TableView } from '@/lib/table-view';

const EMPTY_RANGE: DateRange = { from: '', to: '' };

type Props<T> = {
  view: TableView<T>;
  searchPlaceholder?: string;
  resultLabel?: string;
  className?: string;
};

export function TableViewControls<T>({
  view,
  searchPlaceholder = 'Cari data…',
  resultLabel = 'data',
  className,
}: Props<T>) {
  const [open, setOpen] = React.useState(false);
  const {
    query,
    setQuery,
    filterFields,
    sortFields,
    sortKey,
    sortDir,
    setSort,
    filterValues,
    setFilter,
    toggleMulti,
    getMulti,
    chips,
    activeCount,
    reset,
    isFiltered,
    total,
  } = view;

  const rangeOf = (key: string): DateRange =>
    (filterValues[key] as DateRange | null) ?? EMPTY_RANGE;

  const selectValue = (key: string) => {
    const value = filterValues[key];
    return typeof value === 'string' && value !== '' ? value : '__all__';
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={isFiltered ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <SlidersHorizontal aria-hidden="true" />
          Filter &amp; Urutkan
          {activeCount > 0 ? (
            <span
              className="tabular ml-0.5 rounded-full bg-background/25 px-1.5 text-[11px] font-semibold"
              aria-hidden="true"
            >
              {activeCount}
            </span>
          ) : null}
          <span className="sr-only">
            {isFiltered ? `${activeCount} filter aktif` : 'Belum ada filter aktif'}
          </span>
        </Button>

        {activeCount > 0 ? (
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
        ) : null}

        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          <span className="tabular font-semibold text-foreground">{total}</span> {resultLabel}
          {isFiltered ? ' (terfilter)' : ''}
        </p>
      </div>

      {/* Chip collection must wrap, never clip, so labels stay readable. */}
      {chips.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={chip.onClear}
                className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] text-accent transition-colors hover:bg-accent/20"
              >
                <span className="font-medium">{chip.group}:</span>
                <span className="truncate">{chip.text}</span>
                <X className="size-3 shrink-0" aria-hidden="true" />
                <span className="sr-only">Hapus filter ini</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Filter &amp; Urutkan</DialogTitle>
            <DialogDescription>
              Semua pencarian, filter, dan pengurutan dalam satu tempat. Perubahan langsung
              diterapkan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="tv-search">Pencarian</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="tv-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="pl-9"
                />
              </div>
            </div>

            {sortFields.length > 0 ? (
              <div className="space-y-1.5">
                <Label htmlFor="tv-sort">Urutkan berdasarkan</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={sortKey || (sortFields[0]?.key ?? '')}
                    onValueChange={(v) => setSort(v)}
                  >
                    <SelectTrigger id="tv-sort" className="flex-1">
                      <SelectValue placeholder="Pilih kolom" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortFields.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-1.5">
                    <Button
                      variant={sortDir === 'asc' ? 'default' : 'outline'}
                      size="icon"
                      onClick={() => setSort(sortKey, 'asc')}
                      aria-pressed={sortDir === 'asc'}
                      aria-label="Urutkan menaik"
                      title="Menaik (A–Z)"
                    >
                      <ArrowUpAZ aria-hidden="true" />
                    </Button>
                    <Button
                      variant={sortDir === 'desc' ? 'default' : 'outline'}
                      size="icon"
                      onClick={() => setSort(sortKey, 'desc')}
                      aria-pressed={sortDir === 'desc'}
                      aria-label="Urutkan menurun"
                      title="Menurun (Z–A)"
                    >
                      <ArrowDownAZ aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {filterFields.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Filter
                </p>

                {filterFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    {field.kind === 'multi' ? (
                      <fieldset>
                        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
                          {field.label}
                        </legend>
                        {field.options.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            Tidak ada pilihan tersedia.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {field.options.map((option) => {
                              const checked = getMulti(field.key).includes(option.value);
                              const id = `tv-${field.key}-${option.value}`;
                              return (
                                <div key={option.value} className="flex items-center gap-2">
                                  <input
                                    id={id}
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleMulti(field.key, option.value)}
                                    className="size-4 cursor-pointer accent-[var(--accent)]"
                                  />
                                  <label
                                    htmlFor={id}
                                    className="cursor-pointer text-sm text-foreground"
                                  >
                                    {option.label}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </fieldset>
                    ) : field.kind === 'select' ? (
                      <>
                        <Label htmlFor={`tv-${field.key}`}>{field.label}</Label>
                        <Select
                          value={selectValue(field.key)}
                          onValueChange={(v) =>
                            setFilter(field.key, v === '__all__' ? null : v)
                          }
                        >
                          <SelectTrigger id={`tv-${field.key}`}>
                            <SelectValue placeholder="Semua" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">Semua</SelectItem>
                            {field.options.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    ) : (
                      <fieldset>
                        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
                          {field.label}
                        </legend>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            type="date"
                            aria-label={field.fromLabel ?? `${field.label} dari`}
                            value={rangeOf(field.key).from}
                            onChange={(e) =>
                              setFilter(field.key, {
                                ...rangeOf(field.key),
                                from: e.target.value,
                              })
                            }
                          />
                          <Input
                            type="date"
                            aria-label={field.toLabel ?? `${field.label} sampai`}
                            value={rangeOf(field.key).to}
                            onChange={(e) =>
                              setFilter(field.key, {
                                ...rangeOf(field.key),
                                to: e.target.value,
                              })
                            }
                          />
                        </div>
                      </fieldset>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={reset} disabled={!isFiltered}>
              <RotateCcw aria-hidden="true" />
              Reset Semua
            </Button>
            <Button onClick={() => setOpen(false)}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}