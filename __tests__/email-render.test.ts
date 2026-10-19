import { describe, it, expect } from 'vitest';
import { renderEmailTemplate, escapeHtml } from '@/lib/email';

const vars = { name: 'Budi <b>&</b>', cabang: 'KC "Utama"', email: 'b@x.id' };

describe('renderEmailTemplate', () => {
  it('replaces every occurrence, any case, tolerating inner spaces', () => {
    const out = renderEmailTemplate('{{name}} / {{ NAME }} / {{cabang}} / {{email}}', { name: 'A', cabang: 'B', email: 'c' }, { html: false });
    expect(out).toBe('A / A / B / c');
  });

  it('escapes values in html mode so a name cannot inject markup', () => {
    const out = renderEmailTemplate('<p>{{name}}</p>', vars, { html: true });
    expect(out).toBe('<p>Budi &lt;b&gt;&amp;&lt;/b&gt;</p>');
    expect(out).not.toContain('<b>');
  });

  it('leaves values raw in text mode and keeps $& literal', () => {
    expect(renderEmailTemplate('{{name}}', { name: 'a$&b', email: 'x' }, { html: false })).toBe('a$&b');
  });

  it('treats missing optional values as empty', () => {
    expect(renderEmailTemplate('[{{cabang}}]', { email: 'x' }, { html: true })).toBe('[]');
  });
});

describe('escapeHtml', () => {
  it('escapes the five html-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
