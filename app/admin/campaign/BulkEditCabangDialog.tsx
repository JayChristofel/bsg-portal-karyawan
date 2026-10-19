'use client';

import { Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function BulkEditCabangDialog({
  open,
  onOpenChange,
  count,
  value,
  onValueChange,
  isSaving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  value: string;
  onValueChange: (value: string) => void;
  isSaving: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Edit Branch</DialogTitle>
          <DialogDescription>
            Change the branch for {count} selected recipients.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="New branch name (e.g. KCP Manado)"
            aria-label="New branch name"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSaving || !value.trim()}>
            {isSaving ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Building2 aria-hidden="true" />
            )}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
