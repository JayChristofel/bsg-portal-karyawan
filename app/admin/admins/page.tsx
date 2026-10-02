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
import { EmptyState, MetricCard, PageHeader, SectionCard } from '../components/ui';

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

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) {
      setNotice({ tone: 'err', text: 'Username dan password wajib diisi.' });
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
        setNotice({ tone: 'ok', text: `Admin "${username}" berhasil dibuat.` });
        setOpen(false);
        setUsername('');
        setPassword('');
        void fetchAdmins();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Gagal membuat admin.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Hapus admin "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admins?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Admin "${name}" berhasil dihapus.` });
        void fetchAdmins();
      } else {
        const data = await res.json();
        setNotice({ tone: 'err', text: data.error || 'Gagal menghapus admin.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'Terjadi kesalahan saat menghapus.' });
    }
  };

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="Manajemen Admin"
        description="Kelola akun administrator yang dapat mengakses panel admin."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden="true" />
            Admin Baru
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4">
        <MetricCard label="Total Admin" value={admins.length} icon={UserCog} loading={isLoading} />
        <MetricCard
          label="Status"
          value="Aktif"
          icon={ShieldCheck}
          loading={isLoading}
          hint="Semua akun dapat login"
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
            aria-label="Tutup pesan"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <SectionCard bodyClassName="p-0 sm:p-0">
        {isLoading ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : admins.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="Belum ada akun admin"
            description="Tambahkan akun administrator pertama untuk mengakses panel ini."
            action={{ label: 'Admin Baru', onClick: () => setOpen(true) }}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Username</TableHead>
                  <TableHead>Tanggal Dibuat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((a) => (
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
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Admin Baru</DialogTitle>
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
                placeholder="Masukkan username"
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
              {isSaving ? 'Menyimpan…' : 'Simpan Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}