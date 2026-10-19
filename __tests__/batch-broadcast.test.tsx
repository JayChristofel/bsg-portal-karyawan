import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBatchBroadcast } from '@/lib/batch-broadcast';

/**
 * The send loop in the campaign page is one async function that lives across many
 * renders. It holds on to the callbacks from the render it started in, so the hook
 * must not depend on that render's state: every call has to build on the previous
 * one, or the batch counter never reaches the break threshold.
 */

let saved: Record<string, unknown> | null = null;

beforeEach(() => {
  saved = null;
  window.localStorage.setItem(
    'broadcast:batch-config',
    JSON.stringify({ batchSize: 3, batchBreakMinutes: 10, timeWindowStart: 0, timeWindowEnd: 24 }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        saved = JSON.parse(String(init.body));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ session: saved }) } as Response);
      }
      if (init?.method === 'DELETE') {
        saved = null;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ session: saved }) } as Response);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('useBatchBroadcast', () => {
  it('accumulates across calls made through callbacks captured before any re-render', async () => {
    const { result } = renderHook(() => useBatchBroadcast());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // What the page's loop does: grab the functions once, then call them for minutes.
    const { startBroadcast, recordSend, getState } = result.current;

    await act(async () => {
      await startBroadcast(7);
    });
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await recordSend();
      });
    }

    expect(getState()?.totalSent).toBe(2);
    expect(getState()?.batchSent).toBe(2);
    expect(getState()?.isOnBreak).toBe(false);
  });

  it('starts a break when the batch fills and more batches remain', async () => {
    const { result } = renderHook(() => useBatchBroadcast());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const { startBroadcast, recordSend, getState } = result.current;

    await act(async () => {
      await startBroadcast(7); // batchSize 3 -> 3 batches
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await recordSend();
      });
    }

    const state = getState();
    expect(state?.isOnBreak).toBe(true);
    expect(state?.breakEndTime).toBeGreaterThan(Date.now());
  });

  it('does not break after the final batch', async () => {
    const { result } = renderHook(() => useBatchBroadcast());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const { startBroadcast, recordSend, getState } = result.current;

    await act(async () => {
      await startBroadcast(3); // exactly one batch
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await recordSend();
      });
    }
    expect(getState()?.isOnBreak).toBe(false);
  });

  it('moves to the next batch after a break', async () => {
    const { result } = renderHook(() => useBatchBroadcast());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const { startBroadcast, recordSend, advanceAfterBreak, getState } = result.current;

    await act(async () => {
      await startBroadcast(7);
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await recordSend();
      });
    }
    await act(async () => {
      await advanceAfterBreak();
    });

    expect(getState()).toMatchObject({ currentBatch: 2, batchSent: 0, isOnBreak: false });
  });
});
