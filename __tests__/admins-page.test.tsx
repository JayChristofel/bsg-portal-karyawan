import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AdminsPage from '@/app/admin/admins/page';

/**
 * The admin table is the account-management surface: it must show who the
 * signed-in operator is, expose view/edit/delete, and refuse to delete an
 * account until the username has been typed out.
 */

const ADMINS = [
  { id: 1, username: 'admin', createdAt: '2026-01-02T09:00:00.000Z' },
  { id: 2, username: 'operator', createdAt: '2026-02-11T09:00:00.000Z' },
];

type FetchCall = { url: string; method: string; body?: string };

let calls: FetchCall[] = [];

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  calls = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body as string | undefined });

      if (url.startsWith('/api/auth/me')) return jsonResponse({ username: 'admin' });
      if (url.startsWith('/api/admins/') && url.includes('/activity')) {
        return jsonResponse({
          admin: ADMINS[1],
          activity: [
            {
              id: 9,
              action: 'login',
              detail: 'Login successful',
              ipAddress: '10.0.0.5',
              createdAt: '2026-02-11T10:00:00.000Z',
            },
          ],
        });
      }
      if (url.startsWith('/api/admins')) {
        if (method === 'PUT') return jsonResponse({ admin: { ...ADMINS[1], username: 'operator2' } });
        if (method === 'DELETE') return jsonResponse({ success: true });
        return jsonResponse({ admins: ADMINS });
      }

      return jsonResponse({}, false);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderPage() {
  const user = userEvent.setup();
  render(<AdminsPage />);
  await screen.findByText('operator');
  return user;
}

describe('Admins page', () => {
  it('lists accounts and marks the signed-in one', async () => {
    await renderPage();

    expect(screen.getByText('admin')).toBeInTheDocument();
    const selfRow = screen.getByText('admin').closest('tr');
    expect(within(selfRow as HTMLElement).getByText('You')).toBeInTheDocument();

    const otherRow = screen.getByText('operator').closest('tr');
    expect(within(otherRow as HTMLElement).queryByText('You')).not.toBeInTheDocument();
  });

  it('does not allow deleting the signed-in account', async () => {
    await renderPage();

    const selfRow = screen.getByText('admin').closest('tr') as HTMLElement;
    expect(within(selfRow).getByRole('button', { name: /delete admin/i })).toBeDisabled();
  });

  it('requires typing the username before deleting another account', async () => {
    const user = await renderPage();

    const row = screen.getByText('operator').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /delete operator/i }));

    const confirmField = await screen.findByLabelText(/type/i);
    const confirmButton = screen.getByRole('button', { name: /delete admin/i });

    expect(confirmButton).toBeDisabled();

    await user.type(confirmField, 'wrong-name');
    expect(confirmButton).toBeDisabled();

    await user.clear(confirmField);
    await user.type(confirmField, 'operator');
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('id=2'))).toBe(true);
    });
  });

  it('renames an account through PUT', async () => {
    const user = await renderPage();

    const row = screen.getByText('operator').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /edit username/i }));

    const field = await screen.findByLabelText('Username');
    await user.clear(field);
    await user.type(field, 'operator2');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const put = calls.find((c) => c.method === 'PUT');
      expect(put?.url).toContain('id=2');
      expect(JSON.parse(put?.body ?? '{}')).toEqual({ username: 'operator2' });
    });
  });

  it('opens the activity history for an account', async () => {
    const user = await renderPage();

    const row = screen.getByText('operator').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /view activity/i }));

    expect(await screen.findByText('Admin Activity')).toBeInTheDocument();
    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/admins/2/activity')).toBe(true);
  });
});