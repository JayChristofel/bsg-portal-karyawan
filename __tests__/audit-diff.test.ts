import { describe, expect, it } from 'vitest';

import { describeChanges } from '@/lib/audit';

/**
 * Every audited update has to state what actually changed. A diff that lists
 * unchanged fields is noise; a diff that silently drops a changed field hides
 * exactly the thing an auditor is looking for.
 */

const EMPLOYEE_FIELDS = ['name', 'nip', 'jabatanSk', 'jabatanSekarang', 'cabang'];

describe('describeChanges', () => {
  it('reports every changed field with before and after values', () => {
    const before = {
      name: 'Andi',
      nip: '123',
      jabatanSk: 'Analis',
      jabatanSekarang: 'Analis Senior',
      cabang: 'Manado',
    };
    const after = {
      name: 'Andi',
      nip: '123',
      jabatanSk: 'Auditor',
      jabatanSekarang: 'Auditor Senior',
      cabang: 'Gorontalo',
    };

    const result = describeChanges(before, after, EMPLOYEE_FIELDS);

    expect(result).toContain('jabatanSk: "Analis" → "Auditor"');
    expect(result).toContain('jabatanSekarang: "Analis Senior" → "Auditor Senior"');
    expect(result).toContain('cabang: "Manado" → "Gorontalo"');
  });

  it('omits fields that did not change', () => {
    const before = { name: 'Andi', nip: '123', cabang: 'Manado' };
    const after = { name: 'Andi', nip: '123', cabang: 'Manado' };

    expect(describeChanges(before, after, ['name', 'nip', 'cabang'])).toBe('no field changes');
  });

  it('ignores fields that were not requested', () => {
    const before = { name: 'Andi', passwordHash: 'secret-hash' };
    const after = { name: 'Andi', passwordHash: 'another-hash' };

    const result = describeChanges(before, after, ['name']);

    expect(result).toBe('no field changes');
    expect(result).not.toContain('passwordHash');
  });

  it('renders missing values as empty rather than "null"', () => {
    const result = describeChanges(
      { message: null },
      { message: 'Halo' },
      ['message'],
    );

    expect(result).toBe('message: "" → "Halo"');
  });
});