import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression guard for the admin dark mode.
 *
 * Tailwind's `@theme` only declares the semantic aliases once, on `:root`:
 *
 *     @theme { --color-background: var(--background); }
 *
 * A `var()` reference is substituted on the element where it is DECLARED, not
 * where it is used. That declaration sits on `:root`, so `--color-background`
 * resolved against the *light* palette there and was inherited downward as a
 * fixed value — every `bg-background` / `text-foreground` in the admin stayed
 * light no matter what `.dark` did. Each palette block therefore has to declare
 * the aliases again, next to the values they point at.
 */

const ROOT = process.cwd();
const adminCss = readFileSync(join(ROOT, 'app/admin/admin.css'), 'utf-8');
const adminLayout = readFileSync(join(ROOT, 'app/admin/layout.tsx'), 'utf-8');

/** Grab the body of a top-level CSS rule starting at `selector`. */
function ruleBody(selector: string): string {
  const start = adminCss.indexOf(selector);
  if (start === -1) throw new Error(`selector not found in admin.css: ${selector}`);
  const open = adminCss.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < adminCss.length; i++) {
    if (adminCss[i] === '{') depth++;
    else if (adminCss[i] === '}' && --depth === 0) return adminCss.slice(open + 1, i);
  }
  throw new Error(`unterminated rule: ${selector}`);
}

const ALIASES = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'secondary',
  'accent',
  'destructive',
  'muted',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
];

describe('admin theme tokens', () => {
  it('re-declares every semantic alias inside the light palette block', () => {
    const body = ruleBody(':root,\n.admin-root {');
    for (const name of ALIASES) {
      expect(body, `light palette missing --color-${name}`).toContain(
        `--color-${name}: var(--${name});`,
      );
    }
  });

  it('re-declares every semantic alias inside the dark palette block', () => {
    const body = ruleBody('.dark,\n.admin-root.dark,');
    for (const name of ALIASES) {
      expect(body, `dark palette missing --color-${name}`).toContain(
        `--color-${name}: var(--${name});`,
      );
    }
  });

  it('gives both palettes an explicit color-scheme for native widgets', () => {
    expect(ruleBody(':root,\n.admin-root {')).toContain('color-scheme: light;');
    expect(ruleBody('.dark,\n.admin-root.dark,')).toContain('color-scheme: dark;');
  });

  it('applies the theme before first paint to avoid a flash', () => {
    expect(adminLayout).toContain('admin:theme');
    expect(adminLayout).toContain("classList.toggle('dark'");
  });
});

describe('admin palette contrast', () => {
  function hex(block: string, name: string): string {
    const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`));
    if (!m) throw new Error(`--${name} not found`);
    return m[1];
  }

  const luminance = (color: string) => {
    const channel = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const n = parseInt(color.slice(1), 16);
    return (
      0.2126 * channel((n >> 16) & 255) +
      0.7152 * channel((n >> 8) & 255) +
      0.0722 * channel(n & 255)
    );
  };

  const contrast = (a: string, b: string) => {
    const [l1, l2] = [luminance(a), luminance(b)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  it('keeps accent and destructive text readable on the light surface', () => {
    const light = ruleBody(':root,\n.admin-root {');
    // These are used as small text (badges, metric values), so WCAG AA at 4.5:1
    // is the bar — the original bright green/red only reached ~3.2 / ~3.6.
    expect(contrast(hex(light, 'accent'), hex(light, 'background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(light, 'destructive'), hex(light, 'background'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('keeps accent and destructive text readable on the dark surface', () => {
    const dark = ruleBody('.dark,\n.admin-root.dark,');
    expect(contrast(hex(dark, 'accent'), hex(dark, 'background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(dark, 'destructive'), hex(dark, 'background'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});