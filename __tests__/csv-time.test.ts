import { describe, it, expect } from 'vitest';
import { escapeCsvCell, csvLine } from '@/lib/csv';
import { startOfDayAppTz, endOfDayAppTz, hourInAppTz, formatAppDateTime } from '@/lib/time';

describe('escapeCsvCell', () => {
  it('neutralises formula triggers', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(escapeCsvCell('+1+1')).toBe(`"'+1+1"`);
    expect(escapeCsvCell('@cmd')).toBe(`"'@cmd"`);
    expect(escapeCsvCell('-2+3')).toBe(`"'-2+3"`);
  });

  it('leaves the lone "-" placeholder and normal text alone', () => {
    expect(escapeCsvCell('-')).toBe('"-"');
    expect(escapeCsvCell('Manado')).toBe('"Manado"');
    expect(escapeCsvCell(null)).toBe('""');
    expect(escapeCsvCell(0)).toBe('"0"');
  });

  it('doubles quotes and flattens newlines', () => {
    expect(escapeCsvCell('a "b"\nc')).toBe('"a ""b"" c"');
  });

  it('joins cells into a line', () => {
    expect(csvLine(['a', 1, null])).toBe('"a","1",""');
  });
});

describe('WITA helpers', () => {
  it('maps a WITA calendar day to the right UTC instants', () => {
    expect(startOfDayAppTz('2026-10-19').toISOString()).toBe('2026-10-18T16:00:00.000Z');
    expect(endOfDayAppTz('2026-10-19').toISOString()).toBe('2026-10-19T15:59:59.999Z');
  });

  it('reads the hour in WITA regardless of the server zone', () => {
    expect(hourInAppTz(new Date('2026-10-19T16:30:00Z'))).toBe(0); // 00:30 WITA next day
    expect(hourInAppTz(new Date('2026-10-19T00:00:00Z'))).toBe(8);
    expect(hourInAppTz(new Date('2026-10-19T15:59:00Z'))).toBe(23);
  });

  it('formats in WITA', () => {
    expect(formatAppDateTime('2026-10-19T00:00:00Z')).toContain('08.00.00');
  });
});
