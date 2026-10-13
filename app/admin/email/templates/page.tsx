'use client';

import * as React from 'react';
import { Eye, FileText, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';

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
import { EmptyState, PageHeader, StatStrip } from '../../components/ui';

interface EmailTemplate {
  id: number;
  name: string;
  category: string;
  subject: string;
  htmlBody: string;
  textBody: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EmailTemplate | null>(null);
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('umum');
  const [subject, setSubject] = React.useState('');
  const [htmlBody, setHtmlBody] = React.useState('');
  const [textBody, setTextBody] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [previewing, setPreviewing] = React.useState<EmailTemplate | null>(null);

  const fetchTemplates = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/email/templates', { cache: 'no-store' });
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
    setSubject('');
    setHtmlBody('');
    setTextBody('');
    setOpen(true);
  };

  const openEdit = (t: EmailTemplate) => {
    setEditing(t);
    setName(t.name);
    setCategory(t.category);
    setSubject(t.subject);
    setHtmlBody(t.htmlBody);
    setTextBody(t.textBody || '');
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !htmlBody.trim()) {
      setNotice({ tone: 'err', text: 'Template name and HTML body are required.' });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/email/templates', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing
          ? { id: editing.id, name, category, subject, htmlBody, textBody }
          : { name, category, subject, htmlBody, textBody }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Template "${name}" was saved.` });
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
    if (!window.confirm(`Delete template "${templateName}"?`)) return;
    try {
      const res = await fetch(`/api/email/templates?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotice({ tone: 'ok', text: `Template "${templateName}" was deleted.` });
        void fetchTemplates();
      } else {
        setNotice({ tone: 'err', text: 'Could not delete the template.' });
      }
    } catch {
      setNotice({ tone: 'err', text: 'An error occurred while deleting.' });
    }
  };

  const categoryCount = new Set(templates.map((t) => t.category)).size;
  const avgLength = templates.length
    ? Math.round(templates.reduce((sum, t) => sum + t.htmlBody.length, 0) / templates.length)
    : 0;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Email Templates"
        description="Kelola library template email yang dapat dipakai ulang untuk campaign."
        actions={
          <Button onClick={openNew}>
            <Plus aria-hidden="true" />
            New Template
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

      <StatStrip
        className="mb-4"
        loading={isLoading}
        items={[
          { label: 'Templates', value: templates.length, icon: FileText },
          { label: 'Categories', value: categoryCount, icon: Layers },
          { label: 'Avg length', value: avgLength, hint: 'Characters' },
        ]}
      />

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
            title="No email templates yet"
            description="Create your first email template so it can be reused across campaigns."
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
                    onClick={() => setPreviewing(t)}
                    aria-label={`Preview template ${t.name}`}
                  >
                    <Eye aria-hidden="true" />
                  </Button>
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
                    aria-label={`Delete template ${t.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="mb-3 rounded-lg bg-background/50 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">Subject</p>
                <p className="mt-0.5 truncate text-xs text-foreground">{t.subject || '(no subject)'}</p>
              </div>

              <div
                className="mb-3 max-h-28 flex-1 overflow-y-auto rounded-lg bg-background/50 p-3 text-xs leading-relaxed text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: t.htmlBody }}
              />

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
              Gunakan variabel <code className="tabular">{'{{name}}'}</code>,{' '}
              <code className="tabular">{'{{cabang}}'}</code>,{' '}
              <code className="tabular">{'{{email}}'}</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="etpl-name">Template Name</Label>
              <Input
                id="etpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 2026 Announcement"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="etpl-category">Category</Label>
              <Input
                id="etpl-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. update, general, training"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="etpl-subject">Subject</Label>
              <Input
                id="etpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Update Kebijakan Q4 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="etpl-html">HTML Body</Label>
              <textarea
                id="etpl-html"
                rows={10}
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                placeholder="<h1>Halo {{name}}</h1><p>Email Anda: {{email}}</p>"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs leading-relaxed resize-vertical outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="etpl-text">Plain Text Body (optional)</Label>
              <textarea
                id="etpl-text"
                rows={4}
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                placeholder="Halo {{name}}, email Anda: {{email}}"
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

      <Dialog open={previewing !== null} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="glass-strong sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Preview Template</DialogTitle>
            <DialogDescription>
              {previewing?.name}
            </DialogDescription>
          </DialogHeader>
          <div
            className="rounded-lg border border-border/60 bg-background/50 p-4 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: previewing?.htmlBody || '' }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
