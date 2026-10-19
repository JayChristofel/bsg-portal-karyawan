import { describe, it, expect, vi, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'x'.repeat(40);
});

describe('safeDecrypt', () => {
  it('round-trips a value encrypted with the current key', async () => {
    const { encrypt, safeDecrypt } = await import('@/lib/crypto');
    expect(safeDecrypt(encrypt('198001012005011001'))).toBe('198001012005011001');
  });

  it('returns the placeholder instead of throwing on a tampered payload', async () => {
    const { encrypt, safeDecrypt, DECRYPT_FAILED } = await import('@/lib/crypto');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = encrypt('rahasia');
    const parts = good.split(':');
    parts[3] = parts[3].replace(/.$/, (c) => (c === '0' ? '1' : '0')); // flip ciphertext
    expect(safeDecrypt(parts.join(':'))).toBe(DECRYPT_FAILED);
    spy.mockRestore();
  });

  it('returns the placeholder when the key no longer matches', async () => {
    const { encrypt, safeDecrypt, DECRYPT_FAILED } = await import('@/lib/crypto');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cipher = encrypt('rahasia');
    process.env.ENCRYPTION_KEY = 'y'.repeat(40);
    expect(safeDecrypt(cipher)).toBe(DECRYPT_FAILED);
    process.env.ENCRYPTION_KEY = 'x'.repeat(40);
    spy.mockRestore();
  });

  it('passes genuine plaintext and empty values through', async () => {
    const { safeDecrypt } = await import('@/lib/crypto');
    expect(safeDecrypt('Manado')).toBe('Manado');
    expect(safeDecrypt('')).toBe('');
  });
});

describe('describeChanges with sensitive fields', () => {
  it('reports sensitive fields by name only and never their values', async () => {
    const { describeChanges } = await import('@/lib/audit');
    const out = describeChanges(
      { name: 'Andi', nip: '111', cabang: 'Manado' },
      { name: 'Budi', nip: '222', cabang: 'Manado' },
      ['name', 'nip', 'cabang'],
      ['nip'],
    );
    expect(out).toContain('name: "Andi" → "Budi"');
    expect(out).toContain('nip: (diubah)');
    expect(out).not.toContain('111');
    expect(out).not.toContain('222');
  });
});
