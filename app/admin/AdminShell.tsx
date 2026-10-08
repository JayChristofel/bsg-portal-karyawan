'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Building2,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  ScrollText,
  Smartphone,
  Sun,
  Moon,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/* ──────────────────────────────────────────────────────────────
   Navigation data
   ────────────────────────────────────────────────────────────── */
type NavItem = {
  label: string;
  short: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  description: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Overview',
        short: 'Overview',
        href: '/admin',
        icon: LayoutDashboard,
        exact: true,
        description: 'Metrics, trends, and recent activity',
      },
      {
        label: 'Employees',
        short: 'Employees',
        href: '/admin/pegawai',
        icon: Users,
        description: 'Manage and export employee records',
      },
    ],
  },
  {
    title: 'Broadcast',
    items: [
      {
        label: 'Mass Messaging',
        short: 'Mass Msg',
        href: '/admin/campaign',
        icon: Megaphone,
        description: 'Send bulk messages to employees',
      },
      {
        label: 'Campaigns',
        short: 'Campaigns',
        href: '/admin/campaigns',
        icon: ClipboardList,
        description: 'Manage scheduled campaigns',
      },
      {
        label: 'Message Templates',
        short: 'Templates',
        href: '/admin/templates',
        icon: FileText,
        description: 'Reusable message template library',
      },
      {
        label: 'Delivery Tracking',
        short: 'Tracking',
        href: '/admin/tracking',
        icon: Activity,
        description: 'Monitor real-time delivery status',
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        label: 'WhatsApp Gateway',
        short: 'Gateway',
        href: '/admin/whatsapp',
        icon: Smartphone,
        description: 'Configure the gateway connection',
      },
      {
        label: 'Admin Accounts',
        short: 'Admins',
        href: '/admin/admins',
        icon: UserCog,
        description: 'Manage administrator accounts',
      },
      {
        label: 'Audit Log',
        short: 'Audit',
        href: '/admin/audit',
        icon: ScrollText,
        description: 'Administrator activity history',
      },
    ],
  },
];

/* ──────────────────────────────────────────────────────────────
   Gateway status
   ────────────────────────────────────────────────────────────── */
type GatewayState = 'connected' | 'disconnected' | 'checking';

const GATEWAY_META: Record<GatewayState, { label: string; dot: string; badge: string }> = {
  connected: {
    label: 'Online',
    dot: 'bg-emerald-400',
    badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  },
  checking: {
    label: 'Checking',
    dot: 'bg-amber-400 animate-pulse',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  },
  disconnected: {
    label: 'Offline',
    dot: 'bg-red-400',
    badge: 'border-red-400/30 bg-red-400/10 text-red-300',
  },
};

/* ──────────────────────────────────────────────────────────────
   Main component
   ────────────────────────────────────────────────────────────── */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [gateway, setGateway] = React.useState<GatewayState>('checking');
  const [lastChecked, setLastChecked] = React.useState<Date | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');

  /* Restore sidebar collapse and theme preferences */
  React.useEffect(() => {
    const stored = window.localStorage.getItem('admin:sidebar-collapsed');
    if (stored === '1') setCollapsed(true);
    else if (!stored && window.innerWidth < 1280) setCollapsed(true);

    const storedTheme = window.localStorage.getItem('admin:theme') as 'dark' | 'light' | null;
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setTheme(storedTheme);
    }
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('admin:theme', next);
      return next;
    });
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem('admin:sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  }, []);

  /* Gateway health check */
  const checkGateway = React.useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('status request failed');
      const data = await res.json();
      const connected = Boolean(data?.results?.is_connected || data?.results?.is_logged_in);
      setGateway(connected ? 'connected' : 'disconnected');
    } catch {
      setGateway('disconnected');
    } finally {
      setLastChecked(new Date());
    }
  }, []);

  React.useEffect(() => {
    void checkGateway();
    const id = window.setInterval(() => void checkGateway(), 15_000);
    return () => window.clearInterval(id);
  }, [checkGateway]);

  /* Mobile: lock scroll + close on route change */
  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  /* Logout */
  const handleLogout = React.useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  }, []);

  /* Active item helpers: exact match or strict subpath match (e.g. /admin/campaign/123, NOT /admin/campaigns) */
  const isActive = (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const activeItem = React.useMemo(
    () => NAV_SECTIONS.flatMap((s) => s.items).find(isActive) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname],
  );

  const meta = GATEWAY_META[gateway];

  /* ── Sidebar body (shared between desktop & mobile drawer) ── */
  const sidebarBody = (
    <div className="flex h-full w-full flex-col">
      {/* Brand header */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-3 border-b border-border px-4',
          collapsed && 'lg:justify-center lg:px-2',
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 shadow-lg ring-1 ring-border">
          <Building2 className="size-[18px] text-emerald-400" aria-hidden="true" />
        </div>

        <div className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
          <p className="truncate text-[13px] font-semibold text-foreground">Portal Pegawai</p>
          <p className="truncate text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
            Admin Console
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-foreground lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Tutup menu navigasi"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-4 last:mb-0">
            <p
              className={cn(
                'mb-1 px-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase',
                collapsed && 'lg:hidden',
              )}
            >
              {section.title}
            </p>

            <ul className="space-y-0.5" role="list">
              {section.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'relative flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2',
                        'text-[13px] font-medium transition-colors duration-150',
                        collapsed && 'lg:justify-center lg:px-0',
                        active
                          ? 'nav-item-active text-emerald-500 font-semibold dark:text-emerald-400'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-4 shrink-0 transition-colors duration-150',
                          active
                            ? 'text-emerald-500 dark:text-emerald-400'
                            : 'text-muted-foreground group-hover:text-foreground',
                        )}
                        aria-hidden="true"
                      />
                      <span className={cn('truncate', collapsed && 'lg:hidden')}>
                        {item.label}
                      </span>
                      {active && !collapsed && (
                        <ChevronRight
                          className="ml-auto size-3.5 shrink-0 text-emerald-500/50"
                          aria-hidden="true"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Quick access */}
        <div>
          <p
            className={cn(
              'mb-1 px-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase',
              collapsed && 'lg:hidden',
            )}
          >
            Quick Access
          </p>
          <ul className="space-y-0.5" role="list">
            <li>
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                title={collapsed ? 'Open Public Form' : undefined}
                className={cn(
                  'flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2',
                  'text-[13px] font-medium text-muted-foreground',
                  'transition-colors duration-150 hover:bg-muted/60 hover:text-foreground',
                  collapsed && 'lg:justify-center lg:px-0',
                )}
              >
                <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className={cn('truncate', collapsed && 'lg:hidden')}>Public Form</span>
              </a>
            </li>
            <li>
              <a
                href="/api/export.csv"
                download
                title={collapsed ? 'Export Employees CSV' : undefined}
                className={cn(
                  'flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2',
                  'text-[13px] font-medium text-muted-foreground',
                  'transition-colors duration-150 hover:bg-muted/60 hover:text-foreground',
                  collapsed && 'lg:justify-center lg:px-0',
                )}
              >
                <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className={cn('truncate', collapsed && 'lg:hidden')}>Export CSV</span>
              </a>
            </li>
          </ul>
        </div>
      </nav>

      {/* Gateway status */}
      <div
        className={cn(
          'shrink-0 border-t border-border px-2 py-2',
        )}
      >
        <div
          className={cn(
            'rounded-xl px-3 py-2.5',
            collapsed
              ? 'lg:flex lg:justify-center lg:rounded-lg lg:bg-transparent lg:px-0 lg:py-1'
              : 'bg-muted/40 ring-1 ring-border',
          )}
          title={`WhatsApp Gateway — ${meta.label}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'text-[11px] font-medium text-muted-foreground',
                collapsed && 'lg:hidden',
              )}
            >
              WhatsApp Gateway
            </span>
            <Badge
              variant="outline"
              className={cn('gap-1.5 border px-2 py-0.5 text-[10px] font-semibold', meta.badge)}
            >
              <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden="true" />
              <span className={cn(collapsed && 'lg:sr-only')}>{meta.label}</span>
            </Badge>
          </div>

          <div
            className={cn(
              'mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground',
              collapsed && 'lg:hidden',
            )}
          >
            <span className="truncate">
              Device:{' '}
              <span className="font-mono text-foreground/80">portal-pegawai</span>
            </span>
            <button
              type="button"
              onClick={() => void checkGateway()}
              className="cursor-pointer rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Periksa ulang status gateway"
            >
              <RefreshCw className="size-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* User footer */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-3 border-t border-border px-3 py-3',
          collapsed && 'lg:justify-center',
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground ring-1 ring-border">
          AD
        </div>

        <div className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
          <p className="truncate text-[13px] font-semibold text-foreground">Administrator</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {lastChecked
              ? `Checked ${lastChecked.toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Checking…'}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleLogout}
          title="Keluar"
          aria-label="Keluar dari sesi admin"
          className={cn(
            'shrink-0 text-muted-foreground transition-colors hover:text-destructive',
            collapsed && 'lg:hidden',
          )}
        >
          <LogOut className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  /* ── Render ── */
  return (
    <div className={cn('admin-root min-h-screen', theme)}>
      {/* Desktop sidebar */}
      <aside className={cn('admin-sidebar relative', collapsed && 'is-collapsed')}>
        {sidebarBody}

        {/* Collapse toggle (desktop, pinned at edge) */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute -right-3 top-[4.25rem] z-50 hidden',
            'size-6 cursor-pointer items-center justify-center rounded-full',
            'border border-border bg-card text-muted-foreground shadow-md',
            'transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground',
            'lg:flex',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-3.5" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </aside>

      {/* Mobile drawer overlay */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        {/* Scrim */}
        <div
          onClick={() => setMobileOpen(false)}
          className={cn(
            'absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        {/* Drawer panel */}
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border',
            'bg-card',
            'transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {sidebarBody}
        </aside>
      </div>

      {/* Main content */}
      <div className="admin-main">
        {/* Topbar */}
        <header
          className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6"
          style={{
            background: 'var(--header-bg)',
            borderColor: 'var(--header-border)',
          }}
        >
          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-foreground lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu navigasi"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>

          {/* Page title */}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-foreground">
              {activeItem?.label ?? 'Admin Dashboard'}
            </h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {activeItem?.description ?? 'Employee Portal — Human Resources'}
            </p>
          </div>

          {/* Gateway badge */}
          <Badge
            variant="outline"
            className={cn(
              'hidden shrink-0 gap-1.5 border px-2.5 py-1 text-[10px] font-semibold sm:inline-flex',
              meta.badge,
            )}
          >
            <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden="true" />
            Gateway {meta.label}
          </Badge>

          {/* Theme toggle */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
            className="shrink-0 cursor-pointer border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          >
            {theme === 'dark' ? (
              <Sun className="size-3.5 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="size-3.5 text-slate-700" aria-hidden="true" />
            )}
          </Button>

          {/* Refresh */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => void checkGateway()}
            aria-label="Periksa ulang status gateway"
            className="shrink-0 cursor-pointer border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>

          {/* Mobile logout */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleLogout}
            aria-label="Keluar dari sesi admin"
            className="shrink-0 text-muted-foreground hover:text-destructive sm:hidden"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}