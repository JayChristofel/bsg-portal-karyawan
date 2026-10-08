'use client';

import * as React from 'react';
import { FileText, Pencil, Plus, Trash2, X } from 'lucide-react';

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
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PageHeader } from '../components/ui';

interface Template {
  id: number;
  name: string;
  category: string;
  body: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Template | null>(null);
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('umum');
  const [body, setBody] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const fetchTemplates = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/templates', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch (err) {
      console.error('Fetch templates error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const openNew = () => {
    setEditing(null);
    setName('');
    setCategory('umum');
    setBody('');
    setOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    setName(t.name);
    setCategory(t.category);
    setBody(t.body);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      setNotice({ tone: 'err', text: 'Nama dan isi template wajib diisi.' });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/templates', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, name, category, body } : { name, category, body }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Template "${name}" berhasil disimpan.` });
        setOpen(false);
        void fetchTemplates();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Could not save the template.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, templateName: string) => {
    if (!window.confirm(`Hapus template "${templateName}"?`)) return;
    try {
      const res = await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Template "${templateName}" berhasil dihapus.` });
        void fetchTemplates();
      } else {
        setNotice({ tone: 'err', text: 'Could not delete the template.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'Terjadi kesalahan saat menghapus.' });
    }
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="WhatsApp Message Templates"
        description="Kelola pustaka template pesan yang dapat dipakai ulang untuk broadcast dan kampanye."
        actions={
          <Button onClick={openNew}>
            <Plus aria-hidden="true" />
            Template Baru
          </Button>
        }
      />

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

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="glass rounded-xl">
          <EmptyState
            icon={FileText}
            title="No templates yet"
            description="Buat template pesan pertama agar dapat dipakai ulang di seluruh kampanye."
            action={{ label: 'New Template', onClick: openNew }}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <li key={t.id} className="glass flex flex-col rounded-xl p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">{t.name}</h3>
                  <span className="mt-1 inline-block rounded border border-chart-2/30 bg-chart-2/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-2">
                    {t.category}
                  </span>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => openEdit(t)}
                    aria-label={`Edit template ${t.name}`}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => void handleDelete(t.id, t.name)}
                    aria-label={`Hapus template ${t.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="tabular mb-3 max-h-28 flex-1 overflow-y-auto rounded-lg bg-background/50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {t.body}
              </div>

              <p className="tabular text-[11px] text-muted-foreground/80">
                Diupdate {new Date(t.updatedAt).toLocaleString('id-ID')}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing ? 'Edit Template' : 'New Template'}
            </DialogTitle>
            <DialogDescription>
              Gunakan tag <code className="tabular">{'{nama}'}</code>,{' '}
              <code className="tabular">{'{link}'}</code>, dan spintax{' '}
              <code className="tabular">{'{opsi1|opsi2}'}</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Pemutakhiran Data Q4 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-category">Category</Label>
              <Input
                id="tpl-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Contoh: pemutakhiran, umum, pelatihan"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">Template Body</Label>
              <textarea
                id="tpl-body"
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hello {nama}, please update your details via {link}."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed resize-vertical outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}