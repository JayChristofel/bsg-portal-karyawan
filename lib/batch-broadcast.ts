'use client';

import * as React from 'react';
import { hourInAppTz } from '@/lib/time';

export interface BatchConfig {
  batchSize: number;
  batchBreakMinutes: number;
  timeWindowStart: number;
  timeWindowEnd: number;
}

export interface BatchState {
  id: number;
  channel: string;
  totalTargets: number;
  totalSent: number;
  batchSent: number;
  currentBatch: number;
  totalBatches: number;
  isOnBreak: boolean;
  breakEndTime: number | null;
  isOutsideTimeWindow: boolean;
}

const DEFAULT_CONFIG: BatchConfig = {
  batchSize: 100,
  batchBreakMinutes: 60,
  timeWindowStart: 8,
  timeWindowEnd: 20,
};

const CONFIG_STORAGE_KEY = 'broadcast:batch-config';

function loadConfigFromLocalStorage(): BatchConfig {
  try {
    const stored = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

// WITA hour, not the browser's: the server enforces the same window in WITA, so a
// browser in another zone would otherwise disagree with it about "open hours".
function isWithinTimeWindow(config: BatchConfig): boolean {
  const hour = hourInAppTz();
  return hour >= config.timeWindowStart && hour < config.timeWindowEnd;
}

async function fetchSession(channel: string): Promise<BatchState | null> {
  try {
    const res = await fetch(`/api/broadcast-session?channel=${channel}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return data.session;
    }
  } catch (err) {
    console.error('Failed to fetch session:', err);
  }
  return null;
}

async function saveSession(channel: string, state: Partial<BatchState>): Promise<BatchState | null> {
  try {
    const res = await fetch('/api/broadcast-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, ...state }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.session;
    }
  } catch (err) {
    console.error('Failed to save session:', err);
  }
  return null;
}

async function resetSession(channel: string): Promise<void> {
  try {
    await fetch(`/api/broadcast-session?channel=${channel}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Failed to reset session:', err);
  }
}

export function useBatchBroadcast(channel: string = 'whatsapp') {
  const [config, setConfig] = React.useState<BatchConfig>(DEFAULT_CONFIG);
  const [state, setStateRaw] = React.useState<BatchState | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // The send loop is one long async function that outlives many renders, so it
  // cannot read `state` from a render closure: it would see the value from the
  // moment the loop started, and the batch counter would never advance. The refs
  // always hold the latest value; `state` is kept only to drive the UI.
  const stateRef = React.useRef<BatchState | null>(null);
  const configRef = React.useRef<BatchConfig>(DEFAULT_CONFIG);

  const setState = React.useCallback((next: BatchState | null) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  React.useEffect(() => {
    configRef.current = config;
  }, [config]);

  React.useEffect(() => {
    const saved = loadConfigFromLocalStorage();
    configRef.current = saved;
    setConfig(saved);

    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      // The server GET already advances a batch whose break has elapsed.
      const session = await fetchSession(channel);
      if (!cancelled) {
        if (session) setState(session);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel, setState]);

  const saveConfig = React.useCallback((next: BatchConfig) => {
    configRef.current = next;
    setConfig(next);
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable (private mode): the setting just won't persist */
    }
  }, []);

  const startBroadcast = React.useCallback(async (totalTargets: number) => {
    const cfg = configRef.current;
    const newState: BatchState = {
      id: 0,
      channel,
      totalTargets,
      totalSent: 0,
      batchSent: 0,
      currentBatch: 1,
      totalBatches: Math.max(1, Math.ceil(totalTargets / cfg.batchSize)),
      isOnBreak: false,
      breakEndTime: null,
      isOutsideTimeWindow: !isWithinTimeWindow(cfg),
    };

    const saved = await saveSession(channel, newState);
    const result = saved ?? newState;
    setState(result);
    return result;
  }, [channel, setState]);

  const recordSend = React.useCallback(async (): Promise<BatchState | null> => {
    const current = stateRef.current;
    if (!current) return null;
    const cfg = configRef.current;

    const next: BatchState = {
      ...current,
      totalSent: current.totalSent + 1,
      batchSent: current.batchSent + 1,
      isOutsideTimeWindow: !isWithinTimeWindow(cfg),
    };

    const hasMoreBatches = current.currentBatch < current.totalBatches;
    if (next.batchSent >= cfg.batchSize && hasMoreBatches) {
      next.isOnBreak = true;
      next.breakEndTime = Date.now() + cfg.batchBreakMinutes * 60 * 1000;
    }

    // Update the ref first so the very next call sees this count even while the save is in flight.
    setState(next);
    const saved = await saveSession(channel, next);
    if (saved) setState(saved);
    return saved ?? next;
  }, [channel, setState]);

  const advanceAfterBreak = React.useCallback(async () => {
    const current = stateRef.current;
    if (!current) return null;
    const next: BatchState = {
      ...current,
      batchSent: 0,
      currentBatch: current.currentBatch + 1,
      isOnBreak: false,
      breakEndTime: null,
      isOutsideTimeWindow: !isWithinTimeWindow(configRef.current),
    };
    setState(next);
    const saved = await saveSession(channel, next);
    if (saved) setState(saved);
    return saved ?? next;
  }, [channel, setState]);

  const resetBroadcast = React.useCallback(async () => {
    setState(null);
    await resetSession(channel);
  }, [channel, setState]);

  const checkTimeWindow = React.useCallback(() => isWithinTimeWindow(configRef.current), []);

  const getState = React.useCallback(() => stateRef.current, []);

  return {
    config,
    state,
    isLoading,
    saveConfig,
    startBroadcast,
    recordSend,
    advanceAfterBreak,
    resetBroadcast,
    checkTimeWindow,
    getState,
    isWithinTimeWindow,
  };
}
