'use client';

import * as React from 'react';
import { Plus, ShieldCheck, Trash2, UserCog, X } from 'lucide-react';

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

interface Admin {
  id: number;
  username: string;
  createdAt: string;
}

export default function AdminsPage() {
  const [admins, setAdmins] = React.useState<Admin[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const fetchAdmins = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admins', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins ?? []);
      }
    } catch (err) {
      console.error('Fetch admins error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAdmins();
  }, [fetchAdmins]);

  const view = useTableView<Admin>({
    rows: admins,
    searchFn: (row, q) => row.username.toLowerCase().includes(q),
    filterFields: [
      {
        key: 'created',
        label: 'Creation period',
        kind: 'date-range',
        dateOf: (row) => row.createdAt,
      },
    ],
    sortFields: [
      { key: 'username', label: 'Username', value: (row) => row.username },
      { key: 'created', label: 'Date created', value: (row) => row.createdAt },
    ],
    defaultSortKey: 'created',
    defaultSortDir: 'desc',
  });

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) {
      setNotice({ tone: 'err', text: 'Username and password are required.' });
      return;
    }
    if (password.length < 8) {
      setNotice({ tone: 'err', text: 'Password minimal 8 karakter.' });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Admin "${username}" was created.` });
        setOpen(false);
        setUsername('');
        setPassword('');
        void fetchAdmins();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Could not create the admin.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete admin "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admins?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Admin "${name}" was deleted.` });
        void fetchAdmins();
      } else {
        const data = await res.json();
        setNotice({ tone: 'err', text: data.error || 'Could not delete the admin.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'An error occurred while deleting.' });
    }
  };

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="Admin Accounts"
        description="Manage the administrator accounts that can access this panel."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden="true" />
            Admin Baru
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4">
        <MetricCard label="Total Admins" value={admins.length} icon={UserCog} loading={isLoading} />
        <MetricCard
          label="Status"
          value="Active"
          icon={ShieldCheck}
          loading={isLoading}
          hint="All accounts can sign in"
        />
      </div>

      {notice ? (
        <div
          role="status"
          className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            notice.tone === 'ok'
              ? 'border-chart-2/30 bg-chart-2/10 text-chart-2'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="cursor-pointer opacity-70 hover:opacity-100"
            aria-label="Dismiss message"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <Toolbar>
        <TableViewControls
          view={view}
          searchPlaceholder="Search username…"
          resultLabel="admin accounts"
        />
      </Toolbar>

      <SectionCard bodyClassName="p-0 sm:p-0">
        {isLoading ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : view.total === 0 ? (
          <EmptyState
            icon={UserCog}
            title={view.isFiltered ? 'No accounts match these filters' : 'No admin accounts yet'}
            description={
              view.isFiltered
                ? 'Try adjusting the search or filters above.'
                : 'Add the first administrator account to access this panel.'
            }
            action={
              view.isFiltered
                ? { label: 'Reset Filters', onClick: view.reset }
                : { label: 'New Admin', onClick: () => setOpen(true) }
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Username</TableHead>
                  <TableHead>Date Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-foreground">{a.username}</TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleDelete(a.id, a.username)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 aria-hidden="true" />
                        Hapus
                      </Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">New Admin</DialogTitle>
            <DialogDescription>
              Buat akun administrator baru. Password minimal 8 karakter.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-username">Username</Label>
              <Input
                id="admin-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter a username"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                autoComplete="new-password"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Create Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}