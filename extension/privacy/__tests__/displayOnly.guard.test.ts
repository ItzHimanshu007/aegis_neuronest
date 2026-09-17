import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { TokenVault, unwrapForPanelRender } from '../vault';

/**
 * Guards AGENTS.md invariant 4's display exception (Stage 3A Part A3).
 *
 * `resolveForDisplay()` hands back a real PII value so the panel can show an answer the user can
 * actually read. The type system stops it reaching a `string` parameter, but only a guard can stop
 * someone unwrapping it first and then sending the result somewhere. So: the unwrap is allowed in
 * the panel UI and nowhere else.
 */

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');

/** Files permitted to turn a DisplayOnlyText back into a string, relative to extension/. */
const ALLOWED_UNWRAP_FILES = ['entrypoints/sidepanel/App.tsx', 'entrypoints/sidepanel/PrivacyPreview.tsx'];

/** Directories that must never contain the unwrap at all — these are the egress paths. */
const FORBIDDEN_DIRS = ['net', 'entrypoints/background.ts', 'entrypoints/content.ts', 'agent', 'scene', 'audit'];

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.output', '.wxt', 'dist', '__tests__', 'e2e'].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...collectSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

describe('display-only token resolution', () => {
  const sources = collectSourceFiles(EXTENSION_ROOT);

  it('finds source files to scan (sanity check on the walk itself)', () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it('is only unwrapped inside the panel UI', () => {
    const offenders = sources
      .filter((file) => path.relative(EXTENSION_ROOT, file) !== path.join('privacy', 'vault.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('unwrapForPanelRender'))
      .map((file) => path.relative(EXTENSION_ROOT, file))
      .filter((rel) => !ALLOWED_UNWRAP_FILES.includes(rel.split(path.sep).join('/')));
    expect(offenders, `unwrapForPanelRender() escaped the panel: ${offenders.join(', ')}`).toEqual([]);
  });

  it('never appears anywhere on an egress path', () => {
    const offenders = sources
      .map((file) => path.relative(EXTENSION_ROOT, file).split(path.sep).join('/'))
      .filter((rel) => FORBIDDEN_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`)))
      .filter((rel) => readFileSync(path.join(EXTENSION_ROOT, rel), 'utf8').includes('resolveForDisplay'));
    expect(offenders, `resolveForDisplay() reached an egress path: ${offenders.join(', ')}`).toEqual([]);
  });

  it('returns a wrapper that is not a string, so it cannot be passed as one', async () => {
    const vault = new TokenVault();
    await vault.init();
    const token = await vault.tokenize('NAME', 'Asha Verma', { origin: 'https://example.test', source: 'page' });

    const displayed = vault.resolveForDisplay(token);
    expect(typeof displayed).toBe('object');
    expect(unwrapForPanelRender(displayed)).toBe('Asha Verma');

    // The compiler is the real guard here; this records the intent for a reader.
    // @ts-expect-error a DisplayOnlyText must never satisfy a string parameter
    const _leak: string = displayed;
    void _leak;
  });

  it('refuses a token it never issued', () => {
    const vault = new TokenVault();
    expect(() => vault.resolveForDisplay('[[PII:NAME:abcdefgh]]')).toThrow(/Unknown token/);
  });
});
