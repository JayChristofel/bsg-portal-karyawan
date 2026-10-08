"use client"

import * as React from "react"
import { ArrowDownAZ, ArrowUpAZ, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { DateRange, TableView } from "@/lib/table-view"

const EMPTY_RANGE: DateRange = { from: "", to: "" }

type Props<T> = {
  view: TableView<T>
  searchPlaceholder?: string
  resultLabel?: string
  className?: string
}

function PanelSection({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function DirectionToggle({
  dir,
  onChange,
}: {
  dir: "asc" | "desc"
  onChange: (dir: "asc" | "desc") => void
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Arah pengurutan">
      <Button
        variant={dir === "asc" ? "secondary" : "outline"}
        size="icon"
        className="flex-1"
        onClick={() => onChange("asc")}
        aria-pressed={dir === "asc"}
        aria-label="Urutkan menaik"
        title="Menaik (A–Z)"
      >
        <ArrowUpAZ aria-hidden="true" />
      </Button>
      <Button
        variant={dir === "desc" ? "secondary" : "outline"}
        size="icon"
        className="flex-1"
        onClick={() => onChange("desc")}
        aria-pressed={dir === "desc"}
        aria-label="Urutkan menurun"
        title="Menurun (Z–A)"
      >
        <ArrowDownAZ aria-hidden="true" />
      </Button>
    </div>
  )
}

export function TableViewControls<T>({
  view,
  searchPlaceholder = "Cari data…",
  resultLabel = "data",
  className,
}: Props<T>) {
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
  } = view

  const rangeOf = (key: string): DateRange =>
    (filterValues[key] as DateRange | null) ?? EMPTY_RANGE

  const selectValue = (key: string) => {
    const value = filterValues[key]
    return typeof value === "string" && value !== "" ? value : "__all__"
  }

  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant={isFiltered ? "secondary" : "outline"} size="sm">
            <SlidersHorizontal aria-hidden="true" />
            Filter &amp; Urutkan
            {activeCount > 0 ? (
              <span
                className="tabular bg-accent text-accent-foreground ml-0.5 rounded-full px-1.5 text-[11px] font-semibold"
                aria-hidden="true"
              >
                {activeCount}
              </span>
            ) : null}
            <span className="sr-only">
              {isFiltered ? `${activeCount} filter aktif` : "Belum ada filter aktif"}
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[min(24rem,calc(100vw-2rem))] p-0"
        >
          <div className="max-h-[min(32rem,calc(100vh-8rem))] overflow-y-auto">
            <div className="space-y-4 p-4">
              <PanelSection label="Pencarian">
                <div className="relative">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    aria-label="Pencarian"
                    className="h-9 pl-8"
                  />
                </div>
              </PanelSection>

              {sortFields.length > 0 ? (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="tv-sort"
                    className="text-xs text-muted-foreground"
                  >
                    Urutkan
                  </Label>
                  <div className="flex gap-1.5">
                    <Select
                      value={sortKey || sortFields[0]?.key}
                      onValueChange={(v) => setSort(v)}
                    >
                      <SelectTrigger id="tv-sort" className="h-9 flex-1">
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
                    <DirectionToggle
                      dir={sortDir}
                      onChange={(dir) => setSort(sortKey, dir)}
                    />
                  </div>
                </div>
              ) : null}

              {filterFields.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    Filter
                  </p>

                  {filterFields.map((field) => (
                    <div key={field.key}>
                      {field.kind === "multi" ? (
                        <fieldset className="space-y-1.5">
                          <legend className="text-muted-foreground mb-1.5 text-xs">
                            {field.label}
                          </legend>
                          {field.options.length === 0 ? (
                            <p className="text-muted-foreground text-xs">
                              Tidak ada pilihan tersedia.
                            </p>
                          ) : (
                            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                              {field.options.map((option) => {
                                const id = `tv-${field.key}-${option.value}`
                                const selected = getMulti(field.key).includes(
                                  option.value
                                )
                                return (
                                  <div
                                    key={option.value}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={id}
                                      checked={selected}
                                      onCheckedChange={() =>
                                        toggleMulti(field.key, option.value)
                                      }
                                    />
                                    <label
                                      htmlFor={id}
                                      className="cursor-pointer text-sm"
                                    >
                                      {option.label}
                                    </label>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </fieldset>
                      ) : field.kind === "select" ? (
                        <PanelSection
                          label={field.label}
                          htmlFor={`tv-${field.key}`}
                        >
                          <Select
                            value={selectValue(field.key)}
                            onValueChange={(v) =>
                              setFilter(field.key, v === "__all__" ? null : v)
                            }
                          >
                            <SelectTrigger
                              id={`tv-${field.key}`}
                              className="h-9"
                            >
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">All</SelectItem>
                              {field.options.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </PanelSection>
                      ) : (
                        <fieldset className="space-y-1.5">
                          <legend className="text-muted-foreground mb-1.5 text-xs">
                            {field.label}
                          </legend>
                          <div className="flex gap-1.5">
                            <Input
                              type="date"
                              aria-label={`${field.label} dari`}
                              value={rangeOf(field.key).from}
                              onChange={(e) =>
                                setFilter(field.key, {
                                  ...rangeOf(field.key),
                                  from: e.target.value,
                                })
                              }
                              className="h-9 min-w-0 flex-1"
                            />
                            <Input
                              type="date"
                              aria-label={`${field.label} sampai`}
                              value={rangeOf(field.key).to}
                              onChange={(e) =>
                                setFilter(field.key, {
                                  ...rangeOf(field.key),
                                  to: e.target.value,
                                })
                              }
                              className="h-9 min-w-0 flex-1"
                            />
                          </div>
                        </fieldset>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="bg-muted/30 flex items-center justify-between gap-2 border-t px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={!isFiltered}
              >
                <RotateCcw aria-hidden="true" />
                Reset
              </Button>
              <p role="status" aria-live="polite" className="text-muted-foreground text-xs">
                <span className="tabular text-foreground font-semibold">{total}</span>{" "}
                {resultLabel}
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Chip collection must wrap, never clip, so labels stay readable. */}
      {chips.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={chip.onClear}
                className="border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors"
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
    </div>
  )
}