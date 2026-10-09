import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Pagination } from '@/components/ui/pagination';
import { TableViewControls } from '@/components/ui/table-view-controls';
import { useTableView, type FilterField, type SortField } from '@/lib/table-view';

interface Row {
  id: number;
  name: string;
  cabang: string;
  total: number;
  sentAt: string | null;
}

const ROWS: Row[] = [
  { id: 1, name: 'Andi', cabang: 'Manado', total: 10, sentAt: '2026-03-05T09:00:00' },
  { id: 2, name: 'Budi', cabang: 'Manado', total: 30, sentAt: null },
  { id: 3, name: 'Citra', cabang: 'Gorontalo', total: 20, sentAt: '2026-01-10T09:00:00' },
];

const FILTER_FIELDS: FilterField<Row>[] = [
  {
    key: 'cabang',
    label: 'Branch',
    kind: 'select',
    options: [
      { value: 'Manado', label: 'Manado' },
      { value: 'Gorontalo', label: 'Gorontalo' },
    ],
    match: (row, value) => row.cabang === value,
  },
  {
    key: 'totalBand',
    label: 'Total',
    kind: 'multi',
    options: [
      { value: 'low', label: 'Rendah' },
      { value: 'high', label: 'Tinggi' },
    ],
    match: (row, values) => values.some((v) => (v === 'low' ? row.total < 20 : row.total >= 20)),
  },
  {
    key: 'sent',
    label: 'Send period',
    kind: 'date-range',
    dateOf: (row) => row.sentAt,
  },
];

const SORT_FIELDS: SortField<Row>[] = [
  { key: 'name', label: 'Nama', value: (row) => row.name },
  { key: 'total', label: 'Jumlah', value: (row) => row.total },
  { key: 'sent', label: 'Terkirim', value: (row) => row.sentAt },
];

function useHarness() {
  return useTableView<Row>({
    rows: ROWS,
    searchFn: (row, q) => (row.name + row.cabang).toLowerCase().includes(q),
    filterFields: FILTER_FIELDS,
    sortFields: SORT_FIELDS,
    defaultSortKey: 'name',
    defaultSortDir: 'asc',
    defaultPageSize: 2,
  });
}

function Harness() {
  const view = useHarness();
  return (
    <div>
      <TableViewControls view={view} resultLabel="recipients" />
      <ul data-testid="rows">
        {view.pageRows.map((r) => (
          <li key={r.id}>{r.name}</li>
        ))}
      </ul>
      <Pagination
        currentPage={view.page}
        totalPages={view.totalPages}
        totalItems={view.total}
        pageSize={view.pageSize}
        onPageChange={view.setPage}
        onPageSizeChange={view.setPageSize}
      />
      <p data-testid="page">{view.page}</p>
      <p data-testid="total">{view.total}</p>
    </div>
  );
}

/** Radix Select renders a listbox, not a native <select>. */
async function pickOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerLabel: RegExp,
  optionName: string,
) {
  await user.click(screen.getByRole('combobox', { name: triggerLabel }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /filter & sort/i }));
}

/** The popover is non-modal: Escape returns focus to the trigger. */
async function closePanel(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
}

/** Scoped to the row list — active-filter chips are also list items. */
const visibleNames = () =>
  within(screen.getByTestId('rows'))
    .queryAllByRole('listitem')
    .map((el) => el.textContent);

const chipText = () =>
  screen
    .queryAllByRole('button', { name: /remove this filter/i })
    .map((el) => el.textContent ?? '');

describe('TableViewControls — single consolidated entry point', () => {
  it('exposes every filter and sort control behind one button', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getAllByRole('button', { name: /filter & sort/i })).toHaveLength(1);
    await openPanel(user);

    expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^sort by$/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
    expect(screen.getByLabelText('Tinggi')).toBeInTheDocument();
    expect(screen.getByLabelText(/send period from/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/send period to/i)).toBeInTheDocument();
  });

  it('reports no active filters before the admin changes anything', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('button', { name: /no active filters/i })).toBeInTheDocument();

    await openPanel(user);
    expect(screen.getByRole('status')).toHaveTextContent('3 recipients');
  });
});

describe('TableViewControls — searching', () => {
  it('filters rows and surfaces a removable chip', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.type(screen.getByLabelText(/search/i), 'gorontalo');
    await closePanel(user);

    expect(visibleNames()).toEqual(['Citra']);
    expect(chipText().some((t) => t.startsWith('Search:'))).toBe(true);
  });
});

describe('TableViewControls — select filter', () => {
  it('narrows rows and resets to the first page', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByTestId('page')).toHaveTextContent('2');

    await openPanel(user);
    await pickOption(user, /^branch$/i, 'Manado');
    await closePanel(user);

    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(chipText().some((t) => t.startsWith('Branch:'))).toBe(true);
    expect(visibleNames()).toEqual(['Andi', 'Budi']);
  });
});

describe('TableViewControls — multi-select filter', () => {
  it('matches any checked option', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.click(screen.getByLabelText('Tinggi'));
    await closePanel(user);

    expect(visibleNames()).toEqual(['Budi', 'Citra']);
    expect(chipText().some((t) => t.includes('Tinggi'))).toBe(true);
  });

  it('unchecking removes the filter', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.click(screen.getByLabelText('Tinggi'));
    await closePanel(user);
    expect(visibleNames()).toEqual(['Budi', 'Citra']);

    await openPanel(user);
    await user.click(screen.getByLabelText('Tinggi'));
    await closePanel(user);

    expect(chipText().some((t) => t.includes('Tinggi'))).toBe(false);
  });
});

describe('TableViewControls — date range filter', () => {
  it('keeps rows inside the range and excludes null dates', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.type(screen.getByLabelText(/send period from/i), '2026-01-01');
    await user.type(screen.getByLabelText(/send period to/i), '2026-03-31');
    await closePanel(user);

    expect(visibleNames()).toEqual(['Andi', 'Citra']);
    expect(screen.queryByText('Budi')).not.toBeInTheDocument();
  });
});

describe('TableViewControls — sorting', () => {
  it('sorts ascending and descending by the chosen column', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(visibleNames()).toEqual(['Andi', 'Budi']);

    await openPanel(user);
    await user.click(screen.getByRole('button', { name: /sort descending/i }));
    await closePanel(user);
    // Descending by name: Citra, Budi | Andi
    expect(visibleNames()).toEqual(['Citra', 'Budi']);

    await openPanel(user);
    await pickOption(user, /^sort by$/i, 'Jumlah');
    await user.click(screen.getByRole('button', { name: /sort ascending/i }));
    await closePanel(user);
    // Ascending by total: Andi (10), Citra (20) | Budi (30)
    expect(visibleNames()).toEqual(['Andi', 'Citra']);
  });

  it('places empty values last regardless of direction', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await pickOption(user, /^sort by$/i, 'Terkirim');
    await user.click(screen.getByRole('button', { name: /sort ascending/i }));
    await closePanel(user);
    // Budi has no sentAt so it sorts last in both directions: Citra, Andi | Budi
    expect(visibleNames()).toEqual(['Citra', 'Andi']);

    await openPanel(user);
    await user.click(screen.getByRole('button', { name: /sort descending/i }));
    await closePanel(user);
    expect(visibleNames()).toEqual(['Andi', 'Citra']);
  });

  it('exposes direction state to assistive tech', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    expect(screen.getByRole('button', { name: /sort ascending/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /sort descending/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('TableViewControls — pagination', () => {
  it('pages through results and reports the filtered total', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByTestId('total')).toHaveTextContent('3');
    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(screen.queryByText('Citra')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByTestId('page')).toHaveTextContent('2');
    expect(screen.getByText('Citra')).toBeInTheDocument();
  });

  it('clamps the current page when a filter shrinks the result set', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByTestId('page')).toHaveTextContent('2');

    await openPanel(user);
    await pickOption(user, /^branch$/i, 'Gorontalo');
    await closePanel(user);

    expect(screen.getByTestId('page')).toHaveTextContent('1');
  });

  it('changes page size and returns to the first page', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /next page/i }));
    await pickOption(user, /rows per page/i, '10');

    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(visibleNames()).toEqual(['Andi', 'Budi', 'Citra']);
  });
});

describe('TableViewControls — resetting', () => {
  it('clears search and filter in one step', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.type(screen.getByLabelText(/search/i), 'manado');
    await closePanel(user);
    expect(chipText().some((t) => t.startsWith('Search:'))).toBe(true);

    await openPanel(user);
    await user.click(screen.getByRole('button', { name: /^reset$/i }));
    await closePanel(user);

    expect(chipText()).toEqual([]);
    expect(screen.getByTestId('total')).toHaveTextContent('3');
  });

  it('disables reset until something is filtered', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    expect(screen.getByRole('button', { name: /^reset$/i })).toBeDisabled();
    await closePanel(user);

    await openPanel(user);
    await pickOption(user, /^branch$/i, 'Manado');
    await closePanel(user);

    await openPanel(user);
    expect(screen.getByRole('button', { name: /^reset$/i })).toBeEnabled();
  });

  it('removes a single filter via its chip', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.type(screen.getByLabelText(/search/i), 'manado');
    await closePanel(user);

    await user.click(screen.getByRole('button', { name: /remove this filter/i }));

    expect(screen.getByTestId('total')).toHaveTextContent('3');
  });
});

describe('TableViewControls — chip layout and a11y', () => {
  it('wraps chips so long labels stay readable', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.type(screen.getByLabelText(/search/i), 'manado');
    await pickOption(user, /^branch$/i, 'Gorontalo');
    await closePanel(user);

    const chip = screen.getAllByRole('button', { name: /remove this filter/i })[0];
    const chipList = chip.closest('ul');
    expect(chipList).toHaveClass('flex-wrap');
    expect(chipText().length).toBeGreaterThan(1);
  });

  it('announces the result count in a live region', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('3 recipients');
  });

  it('marks the trigger as a popover opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: /filter & sort/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await openPanel(user);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('groups multi-select options in a labelled fieldset', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    const group = screen.getByRole('group', { name: 'Total' });
    expect(within(group).getByLabelText('Rendah')).toBeInTheDocument();
    expect(within(group).getByLabelText('Tinggi')).toBeInTheDocument();
  });
});

describe('TableViewControls — combined filters', () => {
  it('intersects search, select, and multi-select filters', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await pickOption(user, /^branch$/i, 'Manado');
    await user.click(screen.getByLabelText('Rendah'));
    await user.type(screen.getByLabelText(/search/i), 'andi');
    await closePanel(user);

    expect(visibleNames()).toEqual(['Andi']);
    expect(screen.getByTestId('total')).toHaveTextContent('1');
  });

  it('returns an empty state rather than stale rows when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.type(screen.getByLabelText(/search/i), 'tidak-ada');
    await closePanel(user);

    expect(visibleNames()).toEqual([]);
    expect(screen.getByTestId('total')).toHaveTextContent('0');
  });
});

describe('useTableView — pure view model', () => {
  it('exposes specs and initial state', () => {
    let captured: ReturnType<typeof useTableView<Row>> | null = null;

    function Probe() {
      captured = useHarness();
      return null;
    }

    render(<Probe />);
    const view = captured as unknown as ReturnType<typeof useTableView<Row>>;

    expect(view.filterFields).toHaveLength(3);
    expect(view.sortFields).toHaveLength(3);
    expect(view.isFiltered).toBe(false);
    expect(view.rows).toHaveLength(3);
    expect(view.pageRows).toHaveLength(2);
    expect(view.totalPages).toBe(2);
  });
});