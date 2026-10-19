import { describe, expect, it } from 'vitest';
import { parseCsv, processSpintax } from '@/app/admin/campaign/helpers';

describe('parseCsv', () => {
  it('handles quotes, embedded commas/newlines and CRLF', () => {
    expect(parseCsv('a,"b,c","d\ne"\r\n1,2,3')).toEqual([
      ['a', 'b,c', 'd\ne'],
      ['1', '2', '3'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', 'x']]);
  });
});

describe('processSpintax', () => {
  it('picks one option and leaves {nama}/{link} for later substitution', () => {
    for (let i = 0; i < 20; i++) {
      const out = processSpintax('{Yth.|Dear} {nama}, {link}');
      expect(['Yth. {nama}, {link}', 'Dear {nama}, {link}']).toContain(out);
    }
  });
});
