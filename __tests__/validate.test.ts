import { describe, it, expect } from 'vitest';
import { readJsonObject, str, parseId, boundedInt, parseDateOnly } from '@/lib/validate';

const post = (body: string) => new Request('http://x/', { method: 'POST', body });

describe('readJsonObject', () => {
  it('accepts objects only', async () => {
    expect(await readJsonObject(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonObject(post('null'))).toBeNull();
    expect(await readJsonObject(post('[1]'))).toBeNull();
    expect(await readJsonObject(post('5'))).toBeNull();
    expect(await readJsonObject(post('{bad'))).toBeNull();
  });
});

describe('str', () => {
  it('trims, caps, and neutralises non-strings', () => {
    expect(str('  hi  ', 10)).toBe('hi');
    expect(str('abcdef', 3)).toBe('abc');
    expect(str(5, 10)).toBe('');
    expect(str({}, 10)).toBe('');
    expect(str(null, 10)).toBe('');
  });
});

describe('parseId', () => {
  it('accepts positive integers only', () => {
    expect(parseId('12')).toBe(12);
    for (const bad of ['1.5', '12abc', '-1', '0', '', 'NaN', '9999999999']) {
      expect(parseId(bad)).toBeNull();
    }
    expect(parseId(undefined)).toBeNull();
  });
});

describe('boundedInt', () => {
  it('clamps, rounds, and falls back on junk', () => {
    expect(boundedInt(1e10, 0, 86400)).toBe(86400);
    expect(boundedInt(-5, 0, 10)).toBe(0);
    expect(boundedInt(2.6, 0, 10)).toBe(3);
    expect(boundedInt('7', 0, 10, 4)).toBe(4);
    expect(boundedInt(NaN, 0, 10, 4)).toBe(4);
  });
});

describe('parseDateOnly', () => {
  it('rejects impossible dates', () => {
    expect(parseDateOnly('2026-02-30')).toBeNull();
    expect(parseDateOnly('2026-10-19')).toBe('2026-10-19');
    expect(parseDateOnly('19-10-2026')).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
  });
});
