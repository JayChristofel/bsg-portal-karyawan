'use client';

import * as React from 'react';
import { Eye, Pencil, Plus, ScrollText, ShieldCheck, Trash2, UserCog, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

interface ActivityEntry {
  id: number;
  action: string;
  detail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Mirrors the labels on the audit page so an entry reads the same in both places. */
const ACTIVITY_LABEL: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  login_failed: 'Login Failed',
  create_admin: 'Admin Created',
  update_admin: 'Username Updated',
  delete_admin: 'Admin Deleted',
  view_admins: 'Viewed Admin List',
  view_admin_activity: 'Viewed This Activity',
  view_audit_log: 'Viewed Audit Log',
  view_campaigns: 'Viewed Campaign List',
  view_employees: 'Viewed Employee Records',
  view_recipients: 'Viewed Recipient List',
  view_templates: 'Viewed Template List',
  view_tracking: 'Viewed Delivery Status',
  view_delivery_history: 'Viewed Delivery Timeline',
  view_gateway_config: 'Viewed Gateway Config',
  view_gateway_status: 'Viewed Gateway Status',
  view_webhook_config: 'Viewed Webhook Config',
  view_qr_image: 'Viewed QR Image',
  request_qr: 'Requested Pairing QR',
  update_gateway_config: 'Updated Gateway Config',
  update_webhook_config: 'Updated Webhook Config',
  create_employee: 'Employee Record Created',
  update_employee: 'Employee Record Updated',
  delete_employee: 'Employee Record Deleted',
  update_recipient: 'Recipient Updated',
  delete_recipient: 'Recipient Deleted',
  import_recipients: 'Recipients Imported',
  public_submit: 'Public Form Submitted',
  assign_recipients: 'Recipients Assigned',
  export_recipients: 'Recipients Exported',
  export_employee_records: 'Employee Records Exported',
  send_message: 'Message Sent',
  send_campaign: 'Campaign Sent',
  save_template: 'Template Saved',
  update_template: 'Template Updated',
  delete_template: 'Template Deleted',
  create_campaign: 'Campaign Created',
  update_campaign: 'Campaign Updated',
  delete_campaign: 'Campaign Deleted',
  webhook_invalid_signature: 'Webhook Signature Rejected',
};

const formatDate = (value: string) => new Date(value).toLocaleString('id-ID');

export default function AdminsPage() {
  const [admins, setAdmins] = React.useState<Admin[]>([]);
  const [currentUsername, setCurrentUsername] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  // Create
  const [open, setOpen] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  // Edit
  const [editing, setEditing] = React.useState<Admin | null>(null);
  const [editUsername, setEditUsername] = React.useState('');
  const [isEditSaving, setIsEditSaving] = React.useState(false);

  // View
  const [viewing, setViewing] = React.useState<Admin | null>(null);
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [isActivityLoading, setIsActivityLoading] = React.useState(false);

  // Delete
  const [deleting, setDeleting] = React.useState<Admin | null>(null);
  const [confirmText, setConfirmText] = React.useState('');
  const [isDeleting, setIsDeleting] = React.useState(false);

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

  // The list endpoint only returns id/username/createdAt, so the signed-in
  // account is identified by matching the session cookie's admin on first load.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.username) setCurrentUsername(data.username);
      } catch {
        // Non-critical: the "You" badge simply stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const closeCreate = () => {
    setOpen(false);
    setUsername('');
    setPassword('');
  };

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) {
      setNotice({ tone: 'err', text: 'Username and password are required.' });
      return;
    }
    if (password.length < 8) {
      setNotice({ tone: 'err', text: 'Password must be at least 8 characters.' });
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
        setNotice({ tone: 'ok', text: `Admin "${username.trim()}" was created.` });
        closeCreate();
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

  const handleEdit = async () => {
    if (!editing) return;
    const next = editUsername.trim();
    if (!next) {
      setNotice({ tone: 'err', text: 'Username is required.' });
      return;
    }
    setIsEditSaving(true);
    try {
      const res = await fetch(`/api/admins?id=${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: next }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Username updated to "${next}".` });
        setEditing(null);
        // If the signed-in account was renamed, keep the badge accurate.
        if (currentUsername === editing.username) setCurrentUsername(next);
        void fetchAdmins();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Could not update the admin.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsEditSaving(false);
    }
  };

  const openActivity = async (admin: Admin) => {
    setViewing(admin);
    setIsActivityLoading(true);
    setActivity([]);
    try {
      const res = await fetch(`/api/admins/${admin.id}/activity`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setActivity(data.activity ?? []);
      }
    } catch (err) {
      console.error('Fetch admin activity error:', err);
    } finally {
      setIsActivityLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    if (confirmText.trim() !== deleting.username) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admins?id=${deleting.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Admin "${deleting.username}" was deleted.` });
        setDeleting(null);
        setConfirmText('');
        void fetchAdmins();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Could not delete the admin.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'An error occurred while deleting.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmMatches = Boolean(deleting) && confirmText.trim() === deleting?.username;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Admin Accounts"
        description="Manage the administrator accounts that can access this panel."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden="true" />
            New Admin
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
                {view.pageRows.map((a) => {
                  const isSelf = currentUsername !== '' && a.username === currentUsername;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-foreground">
                        <span className="flex items-center gap-2">
                          {a.username}
                          {isSelf ? (
                            <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-accent">
                              You
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {formatDate(a.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void openActivity(a)}
                            aria-label={`View activity for ${a.username}`}
                          >
                            <Eye aria-hidden="true" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(a);
                              setEditUsername(a.username);
                            }}
                            aria-label={`Edit username for ${a.username}`}
                          >
                            <Pencil aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isSelf}
                            onClick={() => {
                              setDeleting(a);
                              setConfirmText('');
                            }}
                            className="text-muted-foreground hover:text-destructive disabled:hover:text-muted-foreground"
                            aria-label={`Delete ${a.username}`}
                            title={isSelf ? 'You cannot delete your own account' : undefined}
                          >
                            <Trash2 aria-hidden="true" />
                            Delete
                          </Button>
                        </div>
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

      {/* Create */}
      <Dialog open={open} onOpenChange={closeCreate}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">New Admin</DialogTitle>
            <DialogDescription>
              Create an administrator account. The password must be at least 8 characters.
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
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeCreate}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Create Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit username */}
      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Username</DialogTitle>
            <DialogDescription>
              Rename "{editing?.username}". The password is not changed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="edit-username">Username</Label>
            <Input
              id="edit-username"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleEdit()} disabled={isEditSaving}>
              {isEditSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View activity */}
      <Dialog open={viewing !== null} onOpenChange={(next) => !next && setViewing(null)}>
        <DialogContent className="glass-strong sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Admin Activity</DialogTitle>
            <DialogDescription>
              {viewing?.username} — account created {viewing ? formatDate(viewing.createdAt) : ''}.
            </DialogDescription>
          </DialogHeader>

          {isActivityLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <ScrollText className="size-4" aria-hidden="true" />
              No activity recorded for this account yet.
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader className="bg-background/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-48">Action</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead className="hidden sm:table-cell">Time</TableHead>
                    <TableHead className="hidden md:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs font-medium whitespace-nowrap">
                        {ACTIVITY_LABEL[entry.action] ?? entry.action}
                      </TableCell>
                      <TableCell className="min-w-0 text-xs text-muted-foreground">
                        {entry.detail ?? '-'}
                        <span className="tabular mt-0.5 block text-[11px] sm:hidden">
                          {formatDate(entry.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell className="tabular hidden text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
                        {formatDate(entry.createdAt)}
                      </TableCell>
                      <TableCell className="tabular hidden text-xs text-chart-2 md:table-cell">
                        {entry.ipAddress || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete — requires typing the username */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeleting(null);
            setConfirmText('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.username}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the administrator account and its sign-in ability. This
              action is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-username">
              Type <span className="font-semibold text-foreground">{deleting?.username}</span> to
              confirm
            </Label>
            <Input
              id="confirm-username"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={deleting?.username}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmMatches || isDeleting}
              onClick={(event) => {
                // Keep the dialog open while the request is in flight so a
                // failure can be reported without losing the typed value.
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? 'Deleting…' : 'Delete Admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}