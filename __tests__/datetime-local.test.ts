import { describe, expect, it } from 'vitest';
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/time';

describe('datetime-local helpers', () => {
  it('round-trips an instant through the input format', () => {
    const iso = '2026-10-20T01:30:00.000Z';
    expect(fromDatetimeLocal(toDatetimeLocal(iso))).toBe(iso);
  });

  it('treats empty/invalid input as no value', () => {
    expect(fromDatetimeLocal('')).toBeNull();
    expect(fromDatetimeLocal('nope')).toBeNull();
    expect(toDatetimeLocal(null)).toBe('');
    expect(toDatetimeLocal('nope')).toBe('');
  });
});
