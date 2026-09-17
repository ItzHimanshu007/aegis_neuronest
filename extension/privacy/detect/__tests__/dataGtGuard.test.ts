import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Stage 2 Part C guard: "detectors must never read `data-gt` attributes (ground-truth labels used
 * only by tests)."
 *
 * `data-gt` exists on demo-portal/pii-zoo.html purely so the e2e baseline metrics can compare
 * detections against known ground truth. If any detector ever read it, every precision/recall
 * number this project reports would be meaningless — the detector would be reading the answer
 * key. This test walks the entire detection implementation and fails if the string appears.
 */

const DETECT_DIR = path.resolve(__dirname, '..');

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue; // tests legitimately reference data-gt
      files.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('data-gt guard', () => {
  const sourceFiles = collectSourceFiles(DETECT_DIR);

  it('finds detection source files to scan (sanity check on the walk itself)', () => {
    expect(sourceFiles.length).toBeGreaterThan(5);
  });

  for (const file of sourceFiles) {
    it(`${path.relative(DETECT_DIR, file)} never references data-gt`, () => {
      const source = readFileSync(file, 'utf8');
      expect(source.toLowerCase()).not.toContain('data-gt');
      expect(source).not.toContain('dataGt');
      expect(source).not.toContain('dataset.gt');
    });
  }
});
