'use client';

import * as React from 'react';

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

function isWithinTimeWindow(config: BatchConfig): boolean {
  const hour = new Date().getHours();
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
  const [state, setState] = React.useState<BatchState | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    void loadConfig();
    void loadSession();
  }, [channel]);

  const loadConfig = () => {
    const savedConfig = loadConfigFromLocalStorage();
    setConfig(savedConfig);
  };

  const loadSession = async () => {
    setIsLoading(true);
    const session = await fetchSession(channel);
    if (session) {
      if (session.isOnBreak && session.breakEndTime && Date.now() > session.breakEndTime) {
        const updated = await saveSession(channel, {
          isOnBreak: false,
          breakEndTime: null,
          batchSent: 0,
          currentBatch: session.currentBatch + 1,
        });
        if (updated) {
          setState(updated);
        } else {
          setState(session);
        }
      } else {
        setState(session);
      }
    }
    setIsLoading(false);
  };

  const saveConfig = React.useCallback((next: BatchConfig) => {
    setConfig(next);
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const startBroadcast = React.useCallback(async (totalTargets: number) => {
    const totalBatches = Math.ceil(totalTargets / config.batchSize);
    const newState: BatchState = {
      id: 0,
      channel,
      totalTargets,
      totalSent: 0,
      batchSent: 0,
      currentBatch: 1,
      totalBatches,
      isOnBreak: false,
      breakEndTime: null,
      isOutsideTimeWindow: !isWithinTimeWindow(config),
    };

    const saved = await saveSession(channel, newState);
    if (saved) {
      setState(saved);
      return saved;
    }
    return newState;
  }, [channel, config]);

  const recordSend = React.useCallback(async (): Promise<BatchState | null> => {
    if (!state) return null;

    const next: BatchState = {
      ...state,
      totalSent: state.totalSent + 1,
      batchSent: state.batchSent + 1,
      isOutsideTimeWindow: !isWithinTimeWindow(config),
    };

    const hasMoreBatches = state.currentBatch < state.totalBatches;
    if (next.batchSent >= config.batchSize && hasMoreBatches) {
      next.isOnBreak = true;
      next.breakEndTime = Date.now() + config.batchBreakMinutes * 60 * 1000;
    }

    const saved = await saveSession(channel, next);
    if (saved) {
      setState(saved);
      return saved;
    }
    return next;
  }, [state, config, channel]);

  const advanceAfterBreak = React.useCallback(async () => {
    if (!state) return null;
    const next: BatchState = {
      ...state,
      batchSent: 0,
      currentBatch: state.currentBatch + 1,
      isOnBreak: false,
      breakEndTime: null,
      isOutsideTimeWindow: !isWithinTimeWindow(config),
    };
    const saved = await saveSession(channel, next);
    if (saved) {
      setState(saved);
      return saved;
    }
    return next;
  }, [state, config, channel]);

  const resetBroadcast = React.useCallback(async () => {
    await resetSession(channel);
    setState(null);
  }, [channel]);

  const checkTimeWindow = React.useCallback(() => {
    return isWithinTimeWindow(config);
  }, [config]);

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
    isWithinTimeWindow,
  };
}