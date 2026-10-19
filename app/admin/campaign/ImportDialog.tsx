'use client';

import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function ImportDialog({
  open,
  onOpenChange,
  fileName,
  preview,
  isImporting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string | null;
  preview: Array<{ label: string; phone: string; cabang: string }>;
  isImporting: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Confirm File Import</DialogTitle>
          <DialogDescription>
            File: {fileName} · Detected: {preview.length} employees
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Preview of the first 5 records that will be added to the broadcast list.
        </p>

        <div className="overflow-hidden rounded-lg border border-border/60">
          <Table>
            <TableHeader className="bg-background/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Employee Name</TableHead>
                <TableHead>No. WhatsApp</TableHead>
                <TableHead>Branch / Unit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.slice(0, 5).map((row, idx) => (
                <TableRow key={`${row.label}-${idx}`}>
                  <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                  <TableCell className="tabular text-chart-2">{row.phone || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{row.cabang || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {preview.length > 5 ? (
            <p className="border-t border-border/60 bg-background/60 py-2 text-center text-[11px] text-muted-foreground">
              …and {preview.length - 5} more employees
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isImporting}>
            {isImporting ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <FileSpreadsheet aria-hidden="true" />
            )}
            {isImporting ? 'Importing…' : `Import ${preview.length} Employees`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
