import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({ recipients: {} }));

const { parseSendResult, renderMessage, portalLinkFrom } = await import('@/lib/recipient-queue');

describe('parseSendResult', () => {
  it('accepts SUCCESS/OK codes and any message id', () => {
    expect(parseSendResult({ code: 'SUCCESS' }).isSuccess).toBe(true);
    expect(parseSendResult({ code: 'OK' }).isSuccess).toBe(true);
    expect(parseSendResult({ results: { message_id: 'abc' } })).toEqual({
      messageId: 'abc',
      isSuccess: true,
    });
    expect(parseSendResult({ results: { id: 'x' } }).messageId).toBe('x');
    expect(parseSendResult({ message_id: 'y' }).messageId).toBe('y');
  });

  it('does not treat free-text "success" as success', () => {
    expect(parseSendResult({ code: 'ERROR', message: 'no success today' }).isSuccess).toBe(false);
    expect(parseSendResult({ message: 'success' }).isSuccess).toBe(false);
  });

  it('survives null / non-object results', () => {
    expect(parseSendResult(null)).toEqual({ messageId: null, isSuccess: false });
    expect(parseSendResult('boom').isSuccess).toBe(false);
  });
});

describe('renderMessage', () => {
  it('replaces every placeholder, case-insensitively', () => {
    expect(renderMessage('Hai {nama}, {NAMA}! {link}', { nama: 'Budi', link: 'https://x/' })).toBe(
      'Hai Budi, Budi! https://x/',
    );
  });

  it('inserts replacement text literally ($& and $1 are not patterns)', () => {
    expect(renderMessage('Hi {nama}', { nama: "A$&B$1", link: '' })).toBe('Hi A$&B$1');
  });
});

describe('portalLinkFrom', () => {
  it('prefers the request origin and normalises the trailing slash', () => {
    expect(portalLinkFrom('https://portal.example/')).toBe('https://portal.example/');
  });
});
