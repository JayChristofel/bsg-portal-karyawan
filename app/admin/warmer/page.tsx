'use client';

import { useConfirm } from '@/components/confirm-dialog';
import * as React from 'react';
import { MessageCircle, Plus, QrCode, RefreshCw, Thermometer, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState, PageHeader, SectionCard, StatStrip } from '../components/ui';
import { cn } from '@/lib/utils';

interface GatewaySession {
  name: string;
  status: string;
  phone: string | null;
}

interface WarmerPair {
  id: number;
  sessionA: string;
  sessionB: string;
  intervalMinMinutes: number;
  intervalMaxMinutes: number;
  activeHourStart: number;
  activeHourEnd: number;
  enabled: boolean;
  nextTurn: 'a' | 'b';
  lastMessageAt: string | null;
  nextDueAt: string;
  messagesSent: number;
  lastError: string | null;
}

type Notice = { tone: 'ok' | 'err' | 'info'; text: string };

export default function WarmerPage() {
  const [confirm, confirmDialog] = useConfirm();
  const [pairs, setPairs] = React.useState<WarmerPair[]>([]);
  const [sessions, setSessions] = React.useState<GatewaySession[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const [sessionA, setSessionA] = React.useState('');
  const [sessionB, setSessionB] = React.useState('');
  const [intervalMin, setIntervalMin] = React.useState('30');
  const [intervalMax, setIntervalMax] = React.useState('180');
  const [hourStart, setHourStart] = React.useState('8');
  const [hourEnd, setHourEnd] = React.useState('21');
  const [isCreating, setIsCreating] = React.useState(false);

  const [newSessionName, setNewSessionName] = React.useState('');
  const [isRequestingQr, setIsRequestingQr] = React.useState(false);
  const [sessionQr, setSessionQr] = React.useState<{ name: string; qrLink: string; countdown: number } | null>(null);
  const qrCountdownRef = React.useRef<number | null>(null);

  const fetchAll = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [pairsRes, sessionsRes] = await Promise.all([
        fetch('/api/warmer/pairs', { cache: 'no-store' }),
        fetch('/api/warmer/sessions', { cache: 'no-store' }),
      ]);
      if (pairsRes.ok) setPairs((await pairsRes.json()).pairs ?? []);
      if (sessionsRes.ok) setSessions((await sessionsRes.json()).sessions ?? []);
    } catch (err) {
      console.error('Warmer fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const requestSessionQr = React.useCallback(async (name: string) => {
    setIsRequestingQr(true);
    setNotice(null);
    try {
      const res = await fetch('/api/warmer/sessions/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && data.qrLink) {
        setSessionQr({ name, qrLink: data.qrLink, countdown: data.qrDuration || 30 });
        return;
      }
      if (data?.alreadyConnected) {
        setSessionQr(null);
        setNotice({ tone: 'ok', text: data.message });
        void fetchAll();
        return;
      }
      setSessionQr(null);
      setNotice({ tone: 'err', text: data?.error || 'Gagal memuat QR code.' });
    } catch (err) {
      setSessionQr(null);
      setNotice({ tone: 'err', text: (err as Error).message });
    } finally {
      setIsRequestingQr(false);
    }
  }, [fetchAll]);

  const handleCreateSession = async () => {
    const name = newSessionName.trim();
    if (!name) {
      setNotice({ tone: 'err', text: 'Masukkan nama session.' });
      return;
    }
    await requestSessionQr(name);
  };

  // QR auto-refresh countdown, mirrors the WhatsApp Gateway page.
  React.useEffect(() => {
    if (!sessionQr) return;
    qrCountdownRef.current = window.setInterval(() => {
      setSessionQr((prev) => {
        if (!prev) return prev;
        if (prev.countdown <= 1) {
          void requestSessionQr(prev.name);
          return prev;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
    return () => {
      if (qrCountdownRef.current) window.clearInterval(qrCountdownRef.current);
    };
  }, [sessionQr, requestSessionQr]);

  const handleCreate = async () => {
    if (!sessionA || !sessionB) {
      setNotice({ tone: 'err', text: 'Pilih dua session untuk dipasangkan.' });
      return;
    }
    if (sessionA === sessionB) {
      setNotice({ tone: 'err', text: 'Session A dan B harus berbeda.' });
      return;
    }
    setIsCreating(true);
    setNotice(null);
    try {
      const res = await fetch('/api/warmer/pairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionA,
          sessionB,
          intervalMinMinutes: Number(intervalMin),
          intervalMaxMinutes: Number(intervalMax),
          activeHourStart: Number(hourStart),
          activeHourEnd: Number(hourEnd),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ tone: 'err', text: data?.error || 'Gagal membuat pair.' });
        return;
      }
      setNotice({ tone: 'ok', text: `Pair ${sessionA} <-> ${sessionB} dibuat.` });
      setSessionA('');
      setSessionB('');
      void fetchAll();
    } catch (err) {
      setNotice({ tone: 'err', text: (err as Error).message });
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (pair: WarmerPair) => {
    const res = await fetch(`/api/warmer/pairs/${pair.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !pair.enabled }),
    });
    if (res.ok) void fetchAll();
  };

  const handleDelete = async (pair: WarmerPair) => {
    if (!(await confirm({ title: `Hapus pair ${pair.sessionA} <-> ${pair.sessionB}?` }))) return;
    const res = await fetch(`/api/warmer/pairs/${pair.id}`, { method: 'DELETE' });
    if (res.ok) void fetchAll();
  };

  const activeCount = pairs.filter((p) => p.enabled).length;
  const totalSent = pairs.reduce((s, p) => s + p.messagesSent, 0);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Number Warmer"
        description="Pairs of gateway sessions chat with each other on a random schedule to build organic-looking activity before a number is used for bulk sending."
        actions={
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={isLoading}>
            <RefreshCw className={cn(isLoading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {notice ? (
        <div
          role="status"
          className={cn(
            'mb-4 rounded-lg border px-4 py-3 text-sm',
            notice.tone === 'ok' && 'border-accent/30 bg-accent/10 text-accent',
            notice.tone === 'err' && 'border-destructive/30 bg-destructive/10 text-destructive',
            notice.tone === 'info' && 'border-chart-2/30 bg-chart-2/10 text-chart-2',
          )}
        >
          {notice.text}
        </div>
      ) : null}

      <StatStrip
        className="mb-4"
        loading={isLoading}
        items={[
          { label: 'Pairs', value: pairs.length, icon: Thermometer },
          { label: 'Active', value: activeCount, icon: MessageCircle },
          { label: 'Messages sent', value: totalSent, icon: MessageCircle },
        ]}
      />

      <SectionCard
        title="New Session"
        description="Create and pair a new WhatsApp number directly here — no need to open the OpenWA dashboard separately."
        className="mb-4"
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
          <div className="w-full max-w-xs space-y-1.5">
            <Label htmlFor="new-session-name">Session Name</Label>
            <Input
              id="new-session-name"
              placeholder="mis. warmer-01"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
            />
          </div>
          <Button onClick={() => void handleCreateSession()} disabled={isRequestingQr}>
            <QrCode aria-hidden="true" />
            {isRequestingQr ? 'Memuat QR…' : 'Buat & Tampilkan QR'}
          </Button>
        </div>

        {sessionQr ? (
          <div className="mt-4 flex flex-col items-center rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="rounded-xl bg-white p-3 shadow-xl shadow-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sessionQr.qrLink} alt={`WhatsApp QR code for session ${sessionQr.name}`} className="size-48" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Session <span className="tabular font-medium text-foreground">{sessionQr.name}</span> — kadaluarsa dalam{' '}
              <span className="tabular font-semibold text-chart-3">{sessionQr.countdown}s</span> (auto-refresh)
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Scan dari WhatsApp di HP: Menu/Setelan → Perangkat Tertaut → Tautkan Perangkat. Setelah tersambung, refresh
              halaman ini untuk memilihnya di pair di bawah.
            </p>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="New Pair"
        description="Both sessions must already be connected in the WhatsApp Gateway page. Each send still counts against that session's daily warm-up quota."
        className="mb-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="session-a">Session A</Label>
            <Select value={sessionA} onValueChange={setSessionA}>
              <SelectTrigger id="session-a" className="w-full">
                <SelectValue placeholder="Pilih session" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} {s.status !== 'ready' ? `(${s.status})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="session-b">Session B</Label>
            <Select value={sessionB} onValueChange={setSessionB}>
              <SelectTrigger id="session-b" className="w-full">
                <SelectValue placeholder="Pilih session" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} {s.status !== 'ready' ? `(${s.status})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="interval-range">Interval (menit)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="interval-range"
                type="number"
                min={5}
                value={intervalMin}
                onChange={(e) => setIntervalMin(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input type="number" min={5} value={intervalMax} onChange={(e) => setIntervalMax(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hour-range">Active Hours (WITA)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="hour-range"
                type="number"
                min={0}
                max={23}
                value={hourStart}
                onChange={(e) => setHourStart(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input type="number" min={1} max={24} value={hourEnd} onChange={(e) => setHourEnd(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Button onClick={() => void handleCreate()} disabled={isCreating}>
            <Plus aria-hidden="true" />
            {isCreating ? 'Membuat…' : 'Buat Pair'}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={`Active Pairs (${pairs.length})`}>
        {pairs.length === 0 ? (
          <EmptyState
            icon={Thermometer}
            title="Belum ada pair"
            description="Buat pair di atas untuk memulai warm-up aktif antara dua session."
          />
        ) : (
          <ul className="space-y-2">
            {pairs.map((pair) => (
              <li key={pair.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'gap-1.5 border px-2 py-0 text-[10px] font-semibold',
                        pair.enabled
                          ? 'border-accent/30 bg-accent/10 text-accent'
                          : 'border-muted-foreground/30 bg-muted/20 text-muted-foreground',
                      )}
                    >
                      <span className={cn('size-1.5 rounded-full', pair.enabled ? 'bg-accent' : 'bg-muted-foreground')} />
                      {pair.enabled ? 'Active' : 'Paused'}
                    </Badge>
                    <span className="tabular text-sm font-medium text-foreground">
                      {pair.sessionA} <span className="text-muted-foreground">↔</span> {pair.sessionB}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="xs" variant="outline" onClick={() => void handleToggle(pair)}>
                      {pair.enabled ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDelete(pair)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
                  <span>Interval: {pair.intervalMinMinutes}–{pair.intervalMaxMinutes} menit</span>
                  <span>Jam aktif: {pair.activeHourStart}:00–{pair.activeHourEnd}:00</span>
                  <span>Terkirim: {pair.messagesSent}</span>
                  <span>
                    Giliran berikut:{' '}
                    {new Date(pair.nextDueAt).toLocaleString('id-ID')}
                  </span>
                </div>
                {pair.lastError ? (
                  <p className="mt-2 text-[11px] text-destructive">⚠ {pair.lastError}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      {confirmDialog}
    </div>
  );
}
