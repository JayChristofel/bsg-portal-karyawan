'use client';

import { AlertTriangle } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { processSpintax, TONE_OK } from './helpers';

export function TemplateDialog({
  open,
  onOpenChange,
  templates,
  onTemplatesChange,
  selectedIdx,
  onSelectIdx,
  previewText,
  onPreviewText,
  sampleName,
  onSampleName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: string[];
  onTemplatesChange: (next: string[]) => void;
  selectedIdx: number;
  onSelectIdx: (idx: number) => void;
  previewText: string;
  onPreviewText: (text: string) => void;
  sampleName: string;
  onSampleName: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="base">Message Templates &amp; Preview</DialogTitle>
          <DialogDescription>
            {templates.length} template variations — rotated automatically per message. Tags: <code className="tabular">{'{nama}'}</code>, <code className="tabular">{'{link}'}</code>, spintax <code className="tabular">{'{opsi1|opsi2}'}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {templates.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectIdx(idx)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedIdx === idx
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-secondary/60 text-muted-foreground hover:text-foreground',
                )}
              >
                Template {idx + 1}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-broadcast">Message Body (Template {selectedIdx + 1})</Label>
              <textarea
                id="tpl-broadcast"
                rows={14}
                value={templates[selectedIdx] || ''}
                onChange={(e) => {
                  const next = [...templates];
                  next[selectedIdx] = e.target.value;
                  onTemplatesChange(next);
                }}
                className="tabular w-full resize-vertical rounded-md border border-input bg-transparent px-3 py-2 text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-accent">
                  Preview Tampilan di Layar HP Target
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    const origin =
                      typeof window !== 'undefined'
                        ? window.location.origin
                        : 'https://portal-pegawai.internal';
                    const template = templates[selectedIdx] || templates[0];
                    onPreviewText(
                      processSpintax(template)
                        .replace(/\{nama\}/gi, sampleName)
                        .replace(/\{link\}/gi, `${origin}/`),
                    );
                  }}
                >
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  Acak Spintax Baru
                </Button>
              </div>

              {/* Phone frame */}
              <div
                style={TONE_OK}
                className="overflow-hidden rounded-[28px] border-[8px] border-[#1f2c34] shadow-[0_15px_35px_rgba(0,0,0,0.6)]"
              >
                <div
                  className="flex items-center gap-2.5 border-b border-white/6 px-3.5 py-2.5"
                  style={{ background: '#202c33' }}
                >
                  <div
                    className="flex size-8 items-center justify-center rounded-full text-[13px] font-bold text-white"
                    style={{ background: '#00a884' }}
                  >
                    BSG
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[#e9edef]">Bank SulutGo SDM</div>
                    <div className="text-[10px] text-[#8696a0]">Akun Resmi / Online</div>
                  </div>
                </div>

                <div
                  className="min-h-64 px-3 py-4"
                  style={{
                    background: '#0b141a',
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 0)',
                    backgroundSize: '16px 16px',
                  }}
                >
                  <div className="mb-3 text-center">
                    <span
                      className="rounded-md px-2.5 py-0.5 text-[10px] text-[#8696a0]"
                      style={{ background: '#182229' }}
                    >
                      HARI INI
                    </span>
                  </div>
                  <div
                    className="max-w-[92%] rounded-lg px-3 py-2.5 text-xs leading-relaxed break-words whitespace-pre-wrap text-[#e9edef]"
                    style={{ background: '#005c4b', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                  >
                    {previewText}
                    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#8696a0]">
                      <span>09:15</span>
                      <span style={{ color: '#53bdeb' }}>✓✓</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Sample Target Name:</span>
                <Input
                  value={sampleName}
                  onChange={(e) => onSampleName(e.target.value)}
                  className="h-7 max-w-48 text-xs"
                  aria-label="Sample target name for the preview"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
