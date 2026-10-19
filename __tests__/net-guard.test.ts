import { describe, it, expect } from 'vitest';
import { isPrivateHostname, readHostAllowlist } from '@/lib/net-guard';

describe('isPrivateHostname', () => {
  it.each([
    'localhost', 'localhost.', 'foo.localhost', 'db.internal', 'printer.local',
    '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::1', '::', '[::1]', 'fd00::1', 'fe80::1', '::ffff:7f00:1', '::ffff:127.0.0.1', '::ffff:a00:1',
    '127.0.0.1.nip.io', 'a.b.sslip.io', 'x.localtest.me',
  ])('rejects %s', (host) => {
    expect(isPrivateHostname(host)).toBe(true);
  });

  it.each(['gateway.example.com', '107.23.128.93', '8.8.8.8', '172.32.0.1', '::ffff:808:808', '2001:db8::1'])(
    'allows %s',
    (host) => {
      expect(isPrivateHostname(host)).toBe(false);
    },
  );
});

describe('readHostAllowlist', () => {
  it('lower-cases, trims, and drops empties', () => {
    expect(readHostAllowlist(' A.com, ,b.com ')).toEqual(['a.com', 'b.com']);
    expect(readHostAllowlist(undefined)).toEqual([]);
  });
});
