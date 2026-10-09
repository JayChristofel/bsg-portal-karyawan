'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Clock, FileText, Send, type LucideIcon } from 'lucide-react';

/* ────────────────────────────────────────────────────────────
   Page header
   ──────────────────────────────────────────────────────────── */

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Metric card
   ──────────────────────────────────────────────────────────── */

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  loading?: boolean;
  className?: string;
};

export function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
  delta,
  loading,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('glass overflow-hidden', className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          {Icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/60 ring-1 ring-white/5">
              <Icon className="size-4 text-accent" aria-hidden="true" />
            </span>
          ) : null}
        </div>

        {loading ? (
          <Skeleton className="mt-3 h-8 w-24" />
        ) : (
          <p className="tabular mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
            {value}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-2">
          {delta ? (
            <span
              className={cn(
                'tabular text-[11px] font-semibold',
                delta.direction === 'up' && 'text-accent',
                delta.direction === 'down' && 'text-destructive',
                delta.direction === 'flat' && 'text-muted-foreground',
              )}
            >
              {delta.value}
            </span>
          ) : null}
          {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────
   Stat strip
   ──────────────────────────────────────────────────────────── */

/**
 * A row of metrics that reads as one band instead of a wall of cards.
 *
 * Six MetricCards stacked two or three per row cost roughly 200px of vertical
 * space and forced labels like "TOTAL RECIPIENTS" to wrap onto two lines. Here
 * the items are a wrapping flex collection with `whitespace-nowrap` labels, so
 * the row stays a single line on desktop and folds to two on small screens
 * without any label breaking mid-word.
 *
 * Labels must be short. The strip does not truncate them by design — a
 * half-cut metric name is worse than a shorter one.
 */
export function StatStrip({
  items,
  loading,
  className,
}: {
  items: {
    label: string;
    value: React.ReactNode;
    icon?: LucideIcon;
    hint?: string;
  }[];
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn('glass overflow-hidden', className)}>
      <CardContent className="flex flex-wrap items-center gap-y-3 p-0 sm:divide-x sm:divide-border/60">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex min-w-0 flex-1 basis-[calc(50%-1rem)] items-center gap-2.5 px-3 py-3 sm:basis-0 sm:px-4"
            >
              {Icon ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/60 ring-1 ring-white/5">
                  <Icon className="size-4 text-accent" aria-hidden="true" />
                </span>
              ) : null}
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                  {item.label}
                </p>
                {loading ? (
                  <Skeleton className="mt-1 h-6 w-12" />
                ) : (
                  <p className="tabular mt-0.5 text-xl leading-tight font-semibold text-foreground">
                    {item.value}
                  </p>
                )}
                {item.hint && !loading ? (
                  <p className="text-xs whitespace-nowrap text-muted-foreground">{item.hint}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

const STATUS_META: Record<
  string,
  { label: string; icon: LucideIcon; className: string }
> = {
  /* Message delivery */
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  },
  sent: {
    label: 'Sent',
    icon: Send,
    className: 'border-blue-400/30 bg-blue-400/10 text-blue-700 dark:text-blue-300',
  },
  delivered: {
    label: 'Delivered',
    icon: CheckCircle2,
    className: 'border-accent/30 bg-accent/10 text-accent',
  },
  read: {
    label: 'Read',
    icon: CheckCircle2,
    className: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
  },
  failed: {
    label: 'Failed',
    icon: AlertCircle,
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },

  /* Campaign lifecycle */
  draft: {
    label: 'Draft',
    icon: FileText,
    className: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  },
  scheduled: {
    label: 'Scheduled',
    icon: Clock,
    className: 'border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300',
  },
  sending: {
    label: 'Sending',
    icon: Send,
    className: 'border-blue-400/30 bg-blue-400/10 text-blue-700 dark:text-blue-300',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'border-accent/30 bg-accent/10 text-accent',
  },
  active: {
    label: 'Active',
    icon: CheckCircle2,
    className: 'border-accent/30 bg-accent/10 text-accent',
  },
  inactive: {
    label: 'Disabled',
    icon: AlertCircle,
    className: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = (status?.toLowerCase() as MessageStatus) ?? 'pending';
  const meta = STATUS_META[key] ?? STATUS_META.pending;
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        meta.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────
   Empty state
   ──────────────────────────────────────────────────────────── */

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick?: () => void; href?: string };
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-12 items-center justify-center rounded-xl bg-secondary/50 ring-1 ring-white/5">
          <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        action.href ? (
          <a href={action.href} className="mt-1">
            <Button size="sm">{action.label}</Button>
          </a>
        ) : (
          <Button size="sm" className="mt-1" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Toolbar / filters
   ──────────────────────────────────────────────────────────── */

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'glass mb-4 flex flex-col gap-3 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Section card
   ──────────────────────────────────────────────────────────── */

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn('glass', className)}>
      {title ? (
        <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <CardContent className={cn('p-4 sm:p-5', bodyClassName)}>{children}</CardContent>
    </Card>
  );
}