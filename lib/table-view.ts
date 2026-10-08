'use client';

import * as React from 'react';

export type SortDir = 'asc' | 'desc';

export type FilterOption = { value: string; label: string };

export type DateRange = { from: string; to: string };

export type FilterValue = string | string[] | DateRange | null;

export type MultiFilterField<T> = {
  key: string;
  label: string;
  kind: 'multi';
  options: FilterOption[];
  match: (row: T, values: string[]) => boolean;
};

export type SelectFilterField<T> = {
  key: string;
  label: string;
  kind: 'select';
  options: FilterOption[];
  match: (row: T, value: string) => boolean;
};

export type DateRangeFilterField<T> = {
  key: string;
  label: string;
  kind: 'date-range';
  fromLabel?: string;
  toLabel?: string;
  dateOf: (row: T) => Date | string | null;
};

export type FilterField<T> =
  | MultiFilterField<T>
  | SelectFilterField<T>
  | DateRangeFilterField<T>;

export type SortField<T> = {
  key: string;
  label: string;
  value: (row: T) => string | number | null;
};

export type TableViewConfig<T> = {
  rows: T[];
  searchFn: (row: T, query: string) => boolean;
  filterFields?: FilterField<T>[];
  sortFields?: SortField<T>[];
  defaultSortKey?: string;
  defaultSortDir?: SortDir;
  defaultPageSize?: number;
};

export type ActiveChip = {
  key: string;
  group: string;
  text: string;
  onClear: () => void;
};

export type TableView<T> = {
  rows: T[];
  pageRows: T[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  query: string;
  setQuery: (query: string) => void;
  filterValues: Record<string, FilterValue>;
  setFilter: (key: string, value: FilterValue) => void;
  toggleMulti: (key: string, value: string) => void;
  getMulti: (key: string) => string[];
  sortKey: string;
  sortDir: SortDir;
  setSort: (key: string, dir?: SortDir) => void;
  filterFields: FilterField<T>[];
  sortFields: SortField<T>[];
  activeCount: number;
  chips: ActiveChip[];
  reset: () => void;
  isFiltered: boolean;
};

const EMPTY_RANGE: DateRange = { from: '', to: '' };

function startOfDay(value: string): number | null {
  if (!value) return null;
  const t = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

function endOfDay(value: string): number | null {
  if (!value) return null;
  const t = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isNaN(t) ? null : t;
}

function timeOf(value: Date | string | null): number | null {
  if (value == null || value === '') return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
  dir: SortDir,
): number {
  const aEmpty = a == null || a === '';
  const bEmpty = b == null || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const result =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });

  return dir === 'asc' ? result : -result;
}

export function useTableView<T>(config: TableViewConfig<T>): TableView<T> {
  const {
    rows,
    searchFn,
    filterFields = [],
    sortFields = [],
    defaultSortKey,
    defaultSortDir = 'desc',
    defaultPageSize = 10,
  } = config;

  const [query, setQueryState] = React.useState('');
  const [filterValues, setFilterValues] = React.useState<Record<string, FilterValue>>({});
  const [sortKey, setSortKey] = React.useState<string>(
    defaultSortKey ?? sortFields[0]?.key ?? '',
  );
  const [sortDir, setSortDir] = React.useState<SortDir>(defaultSortDir);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSizeState] = React.useState(defaultPageSize);

  /* Specs are re-created each render when declared inline. Reading them through
     refs keeps the memo below stable while still picking up fresh options. */
  const filterFieldsRef = React.useRef(filterFields);
  filterFieldsRef.current = filterFields;
  const sortFieldsRef = React.useRef(sortFields);
  sortFieldsRef.current = sortFields;

  const fields = filterFieldsRef.current;
  const sorts = sortFieldsRef.current;

  const searchRef = React.useRef(searchFn);
  searchRef.current = searchFn;

  const visibleRows = React.useMemo(() => {
    const search = searchRef.current;
    const q = query.trim().toLowerCase();
    const active = fields.filter((field) => {
      const value = filterValues[field.key];
      if (field.kind === 'multi') return Array.isArray(value) && value.length > 0;
      if (field.kind === 'select') return typeof value === 'string' && value !== '';
      if (field.kind === 'date-range') {
        const range = (value as DateRange | null) ?? EMPTY_RANGE;
        return Boolean(range.from || range.to);
      }
      return false;
    });

    return rows.filter((row) => {
      if (q && !search(row, q)) return false;

      for (const field of active) {
        const value = filterValues[field.key];
        if (field.kind === 'multi') {
          if (!field.match(row, value as string[])) return false;
        } else if (field.kind === 'select') {
          if (!field.match(row, value as string)) return false;
        } else {
          const range = (value as DateRange | null) ?? EMPTY_RANGE;
          const time = timeOf(field.dateOf(row));
          if (time == null) return false;
          const from = startOfDay(range.from);
          const to = endOfDay(range.to);
          if (from != null && time < from) return false;
          if (to != null && time > to) return false;
        }
      }
      return true;
    });
    // Specs and search are read through refs (pure, derived from `rows`), so
    // keeping them out of the deps preserves memoisation across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, filterValues]);

  const sortedRows = React.useMemo(() => {
    const field = sortFieldsRef.current.find((s) => s.key === sortKey);
    if (!field) return visibleRows;

    return [...visibleRows].sort((a, b) => compareValues(field.value(a), field.value(b), sortDir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  const clampedPage = Math.min(page, totalPages);

  React.useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
  }, [page, clampedPage]);

  const setQuery = React.useCallback((next: string) => {
    setQueryState(next);
    setPage(1);
  }, []);

  const setFilter = React.useCallback((key: string, value: FilterValue) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const toggleMulti = React.useCallback((key: string, value: string) => {
    setFilterValues((prev) => {
      const current = Array.isArray(prev[key]) ? (prev[key] as string[]) : [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
    setPage(1);
  }, []);

  const getMulti = React.useCallback(
    (key: string) => {
      const value = filterValues[key];
      return Array.isArray(value) ? value : [];
    },
    [filterValues],
  );

  const setSort = React.useCallback((key: string, dir?: SortDir) => {
    setSortKey(key);
    if (dir) setSortDir(dir);
    setPage(1);
  }, []);

  const setPageSize = React.useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const reset = React.useCallback(() => {
    setQueryState('');
    setFilterValues({});
    setPage(1);
  }, []);

  const chips = React.useMemo(() => {
    const result: ActiveChip[] = [];

    if (query.trim()) {
      const text = query.trim();
      result.push({
        key: '__query',
        group: 'Cari',
        text,
        onClear: () => setQueryState(''),
      });
    }

    for (const field of fields) {
      const value = filterValues[field.key];
      if (field.kind === 'multi') {
        const selected = Array.isArray(value) ? value : [];
        for (const item of selected) {
          const label = field.options.find((o) => o.value === item)?.label ?? item;
          result.push({
            key: `${field.key}:${item}`,
            group: field.label,
            text: label,
            onClear: () => toggleMulti(field.key, item),
          });
        }
      } else if (field.kind === 'select') {
        if (typeof value === 'string' && value !== '') {
          const label = field.options.find((o) => o.value === value)?.label ?? value;
          result.push({
            key: field.key,
            group: field.label,
            text: label,
            onClear: () => setFilter(field.key, null),
          });
        }
      } else {
        const range = (value as DateRange | null) ?? EMPTY_RANGE;
        if (range.from || range.to) {
          const text =
            range.from && range.to
              ? `${range.from} → ${range.to}`
              : range.from
                ? `Dari ${range.from}`
                : `Sampai ${range.to}`;
          result.push({
            key: field.key,
            group: field.label,
            text,
            onClear: () => setFilter(field.key, null),
          });
        }
      }
    }

    return result;
  }, [fields, filterValues, query, setFilter, toggleMulti]);

  const pageRows = React.useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, clampedPage, pageSize]);

  return {
    rows: sortedRows,
    pageRows,
    total: sortedRows.length,
    totalPages,
    page: clampedPage,
    pageSize,
    setPage,
    setPageSize,
    query,
    setQuery,
    filterValues,
    setFilter,
    toggleMulti,
    getMulti,
    sortKey,
    sortDir,
    setSort,
    filterFields: fields,
    sortFields: sorts,
    activeCount: chips.length,
    chips,
    reset,
    isFiltered: chips.length > 0,
  };
}