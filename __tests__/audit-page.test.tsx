import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuditPage from '@/app/admin/audit/page';

/**
 * The audit table is unbounded and read-heavy, so filtering and paging must
 * happen on the server. These tests pin the query string the page sends, since
 * silently falling back to "load 50 rows and filter in the browser" would hide
 * entries from anyone reviewing older activity.
 */

const LOG = {
  id: 1,
  adminUsername: 'admin',
  action: 'delete_admin',
  detail: 'Admin "operator" (ID: 2) dihapus',
  ipAddress: '10.0.0.7',
  createdAt: '2026-02-11T10:00:00.000Z',
};

let requested: string[] = [];

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  requested = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      requested.push(url.search);
      return jsonResponse({
        logs: [LOG],
        total: 412,
        page: Number(url.searchParams.get('page')) || 1,
        pageSize: 50,
        totalPages: 9,
        destructive: 12,
        facets: { admins: ['admin', 'operator'], actions: ['delete_admin', 'login'] },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Audit page', () => {
  it('requests a server page instead of a fixed slice', async () => {
    render(<AuditPage />);

    await screen.findByText('Delete Admin');

    expect(requested[0]).toContain('page=1');
    expect(requested[0]).toContain('pageSize=50');
    expect(requested[0]).toContain('sort=created');
  });

  it('reports the server total, not the loaded row count', async () => {
    render(<AuditPage />);

    await screen.findByText('Delete Admin');
    // The same totals also appear in the pagination footer, so assert presence
    // rather than a single match.
    expect(screen.getAllByText('412').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
  });

  it('sends the action filter to the server after the debounce', async () => {
    const user = userEvent.setup();
    render(<AuditPage />);
    await screen.findByText('Delete Admin');

    await user.click(screen.getByRole('button', { name: /filter & sort/i }));
    await user.click(await screen.findByLabelText('Action type'));
    await user.click(await screen.findByRole('option', { name: 'Delete Admin' }));

    await waitFor(() => {
      expect(requested.some((q) => q.includes('action=delete_admin'))).toBe(true);
    });
  });

  it('resets to the first page when the search query changes', async () => {
    const user = userEvent.setup();
    render(<AuditPage />);
    await screen.findByText('Delete Admin');

    await user.click(screen.getByRole('button', { name: /filter & sort/i }));
    const search = await screen.findByLabelText('Search');
    await user.type(search, 'operator');

    await waitFor(() => {
      expect(requested.some((q) => q.includes('search=operator') && q.includes('page=1'))).toBe(
        true,
      );
    });
  });
});