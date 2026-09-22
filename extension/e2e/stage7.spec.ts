import { test, expect } from './fixtures/extension';
import { openPages } from './fixtures/observe';
import { observeAndSanitize, readGroundTruth } from './fixtures/sanitize';
import { addHit, errorBullets, matchDetections, metric, readAnnotations, scoredCategories, type GroundTruthItem, type HitMap } from './fixtures/score';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Stage 7 — label-independent detection, measured as BASELINE vs STAGE 7.
 *
 * THIS SPEC WRITES EVIDENCE. It is excluded from `playwright.config.ts` and reachable only through
 * `playwright.stage7.config.ts` (`pnpm eval:stage7`), for the reason commit 17eda7a records: an
 * ordinary regression run must never be able to overwrite a submitted measurement.
 *
 * IT DOES NOT TOUCH STAGE 4. It reads its own corpus (`demo-portal/stage7/`), writes its own
 * report (`eval/reports/stage7-label-independence.md`), and never regenerates
 * `stage4-heldout.md`, `stage2-baseline.*` or the held-out replay bundles.
 *
 * BOTH ARMS RUN IN ONE BUILD, toggled through the panel's `__aegisSetEvidenceLayer` hook. Running
 * them from two builds would make the delta partly a build difference.
 *
 * THE CORPUS USES ITS OWN LABELLING RULE, and the report says so. Stage 4's rule defines an
 * unlabelled near-miss as negative, which is exactly what Stage 7 exists to detect; scoring this
 * stage by that rule would count every success as a false positive. See
 * `demo-portal/stage7/README.md`.
 */

const REPORT = path.join(__dirname, '../../eval/reports/stage7-label-independence.md');

const PAGES = [
  'labelled', 'misleading', 'unlabelled', 'random-name', 'table', 'nested',
  'iframe', 'shadow', 'lookalike', 'harmless-context', 'multi', 'mixed',
] as const;

/** Per-annotation facets, read from the Stage 7 sidecar attributes. */
interface Facets { label: string; construct: string }

type Arm = 'baseline' | 'stage7';

interface ArmResult {
  truth: GroundTruthItem[];
  facets: Facets[];
  hits: HitMap;
  captures: number;
  candidates: number;
  uncertain: number;
  evidenceMs: number[];
  detectMs: number[];
}

function emptyArm(): ArmResult {
  return { truth: [], facets: [], hits: new Map(), captures: 0, candidates: 0, uncertain: 0, evidenceMs: [], detectMs: [] };
}

async function readFacets(page: import('@playwright/test').Page): Promise<Facets[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-gt]')).map((el) => ({
      label: el.dataset.gtLabel ?? 'none',
      construct: el.dataset.gtConstruct ?? 'unknown',
    })),
  );
}

/** metric() over the subset of annotations whose facet matches. */
function facetMetric(arm: ArmResult, predicate: (f: Facets) => boolean) {
  const truth: GroundTruthItem[] = [];
  const hits: HitMap = new Map();
  arm.truth.forEach((g, i) => {
    if (!predicate(arm.facets[i]!)) return;
    const index = truth.length;
    truth.push(g);
    const set = arm.hits.get(i);
    if (set) for (const category of set) addHit(hits, index, category);
  });
  return metric(truth, hits);
}

function median(values: number[]): string {
  if (values.length === 0) return '—';
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!.toFixed(1);
}

function p95(values: number[]): string {
  if (values.length === 0) return '—';
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!.toFixed(1);
}

function deltaInt(baseline: number, stage7: number): string {
  const d = stage7 - baseline;
  return `${d >= 0 ? '+' : ''}${d}`;
}

function deltaRate(baseline: string, stage7: string): string {
  if (baseline === '—' || stage7 === '—') return '—';
  const d = (Number(stage7) - Number(baseline)) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
}

test('stage 7: label-independent detection, baseline vs stage 7', async ({ context, sidepanelUrl }) => {
  test.setTimeout(3_600_000);

  const results: Record<Arm, ArmResult> = { baseline: emptyArm(), stage7: emptyArm() };
  const browserVersion = context.browser()?.version() ?? 'unavailable';

  for (const arm of ['baseline', 'stage7'] as const) {
    const state = results[arm];
    for (const name of PAGES) {
      const { targetPage, panelPage } = await openPages(context, sidepanelUrl, `/stage7/${name}.html`);
      // Set the arm BEFORE any capture on this page.
      await panelPage.evaluate((enabled) => {
        (window as unknown as { __aegisSetEvidenceLayer: (v: boolean) => void }).__aegisSetEvidenceLayer(enabled);
      }, arm === 'stage7');

      const pageTruth = await readGroundTruth(targetPage);
      const pageFacets = await readFacets(targetPage);
      const pageHits: HitMap = new Map();

      const pageHeight = await targetPage.evaluate(() => document.documentElement.scrollHeight);
      const step = await targetPage.evaluate(() => Math.floor(innerHeight * 0.6));
      let pageCaptures = 0;
      for (let y = 0; y < pageHeight; y += step) {
        await targetPage.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
        const result = await observeAndSanitize(panelPage, targetPage);
        state.captures++;
        pageCaptures++;

        const annotations = await readAnnotations(targetPage);
        for (const m of await matchDetections(panelPage, annotations)) {
          const detection = result.preview.detections[m.detection]!;
          addHit(pageHits, m.index, detection.category);
        }
        state.uncertain += result.preview.detections.filter((d) => d.certainty === 'uncertain').length;
        state.detectMs.push(result.preview.timings?.detectMs ?? 0);
        const stats = result.preview.evidenceStats;
        if (stats) {
          state.candidates += stats.candidates;
          state.evidenceMs.push(stats.ms);
        }
      }

      if (pageCaptures > 0) {
        const offset = state.truth.length;
        state.truth.push(...pageTruth);
        state.facets.push(...pageFacets);
        for (const [index, set] of pageHits) for (const category of set) addHit(state.hits, offset + index, category);
      }
      await targetPage.close();
      await panelPage.close();
    }
  }

  const base = results.baseline;
  const s7 = results.stage7;
  expect(base.truth.length, 'no annotations were scored').toBeGreaterThan(0);
  expect(s7.truth.length, 'the two arms scored different corpora').toBe(base.truth.length);

  const overall = { baseline: metric(base.truth, base.hits), stage7: metric(s7.truth, s7.hits) };
  const categories = [...new Set([...scoredCategories(base.truth, base.hits), ...scoredCategories(s7.truth, s7.hits)])].sort();
  const constructs = [...new Set(s7.facets.map((f) => f.construct))].sort();
  const positives = base.truth.filter((g) => g.category !== 'NONE').length;

  const labelIndependent = (f: Facets) => f.label !== 'labelled';

  const lines: string[] = [];
  lines.push('# Stage 7 — label-independent detection');
  lines.push('');
  lines.push('> **This is not a Stage 4 number and does not replace one.** The authoritative Stage 4');
  lines.push('> held-out result stands unchanged: 24/24 pages, 390 annotations, **207 TP, 11 FP, 63 FN,**');
  lines.push('> **precision 0.950, recall 0.767**, with 61 of 63 false negatives label-dependent');
  lines.push('> (`eval/reports/stage4-heldout.md`). This report measures a different corpus, with a');
  lines.push('> different labelling rule, for a different question.');
  lines.push('');
  lines.push('## What is measured, and why the labelling rule differs');
  lines.push('');
  lines.push("Stage 4's rule (`eval/README.md`) makes a truly **unlabelled** near-miss a **negative**.");
  lines.push('Detecting unlabelled sensitive values is precisely what Stage 7 is for, so scoring this');
  lines.push('stage by that rule would count every success as a false positive. This corpus instead');
  lines.push('calls a value positive when it **is** a synthetic instance of a sensitive category —');
  lines.push('whatever label it carries, including none and including a misleading one — and negative');
  lines.push('only when it is a genuine non-identifier (SKU, quantity, version, public company name).');
  lines.push('See `demo-portal/stage7/README.md`.');
  lines.push('');
  lines.push('## Conditions');
  lines.push('');
  lines.push(`- Measured: ${new Date().toISOString()}`);
  lines.push(`- Browser: ${browserVersion} via Playwright, \`extension/e2e/stage7.spec.ts\` (\`workers: 1\`, \`retries: 0\`)`);
  lines.push('- Mode: `balanced` (the panel default). DOM-only cascade. No vision, OCR or NER.');
  lines.push('- Server: not involved. Detection is scored from the local `ProcessResult`, before `send()`.');
  lines.push(`- Corpus: \`demo-portal/stage7/\` — ${PAGES.length} hand-authored pages, ${base.truth.length} annotations (${positives} positive, ${base.truth.length - positives} negative).`);
  lines.push(`- Captures: ${base.captures} (baseline), ${s7.captures} (Stage 7).`);
  lines.push('- **Both arms ran in the same build**, toggled via the panel\'s `__aegisSetEvidenceLayer`');
  lines.push('  hook, so the delta is attributable to the evidence layer and not to a different binary.');
  lines.push('- Matching, and the TP/FP/FN arithmetic, reuse `extension/e2e/fixtures/score.ts` unchanged —');
  lines.push('  the same scorer the Stage 2 baseline and the Stage 4 held-out run use.');
  lines.push('');
  lines.push('## Overall');
  lines.push('');
  lines.push('| Arm | TP | FP | FN | Precision | Recall |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  lines.push(`| BASELINE (evidence layer off) | ${overall.baseline.tp} | ${overall.baseline.fp} | ${overall.baseline.fn} | ${overall.baseline.precision} | ${overall.baseline.recall} |`);
  lines.push(`| **STAGE 7** | ${overall.stage7.tp} | ${overall.stage7.fp} | ${overall.stage7.fn} | ${overall.stage7.precision} | ${overall.stage7.recall} |`);
  lines.push(`| Delta | ${deltaInt(overall.baseline.tp, overall.stage7.tp)} | ${deltaInt(overall.baseline.fp, overall.stage7.fp)} | ${deltaInt(overall.baseline.fn, overall.stage7.fn)} | ${deltaRate(overall.baseline.precision, overall.stage7.precision)} pp | ${deltaRate(overall.baseline.recall, overall.stage7.recall)} pp |`);
  lines.push('');
  lines.push('## Label-dependent vs label-independent — the Stage 7 headline');
  lines.push('');
  lines.push('`label-dependent` = the value carries a label naming its own category, which is what the');
  lines.push('pre-Stage-7 cascade needed. `label-independent` = no label, a misleading label, or a random');
  lines.push('field name. **The second row is what this stage exists to move.**');
  lines.push('');
  lines.push('| Subset | Arm | TP | FP | FN | Precision | Recall |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const [label, predicate] of [['label-dependent', (f: Facets) => !labelIndependent(f)], ['label-independent', labelIndependent]] as const) {
    const b = facetMetric(base, predicate);
    const s = facetMetric(s7, predicate);
    lines.push(`| ${label} | BASELINE | ${b.tp} | ${b.fp} | ${b.fn} | ${b.precision} | ${b.recall} |`);
    lines.push(`| ${label} | **STAGE 7** | ${s.tp} | ${s.fp} | ${s.fn} | ${s.precision} | ${s.recall} |`);
    lines.push(`| ${label} | Delta | ${deltaInt(b.tp, s.tp)} | ${deltaInt(b.fp, s.fp)} | ${deltaInt(b.fn, s.fn)} | ${deltaRate(b.precision, s.precision)} pp | ${deltaRate(b.recall, s.recall)} pp |`);
  }
  lines.push('');
  lines.push('## Per category');
  lines.push('');
  lines.push('| Category | BASELINE TP/FP/FN | BASELINE P | BASELINE R | STAGE 7 TP/FP/FN | STAGE 7 P | STAGE 7 R | ΔR (pp) |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const category of categories) {
    const b = metric(base.truth, base.hits, category);
    const s = metric(s7.truth, s7.hits, category);
    lines.push(`| ${category} | ${b.tp}/${b.fp}/${b.fn} | ${b.precision} | ${b.recall} | ${s.tp}/${s.fp}/${s.fn} | ${s.precision} | ${s.recall} | ${deltaRate(b.recall, s.recall)} |`);
  }
  lines.push('');
  lines.push('## Per page construct');
  lines.push('');
  lines.push('Stage 4 found its false negatives concentrated in running prose (31 of 63).');
  lines.push('');
  lines.push('| Construct | BASELINE R | STAGE 7 R | ΔR (pp) |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const construct of constructs) {
    const b = facetMetric(base, (f) => f.construct === construct);
    const s = facetMetric(s7, (f) => f.construct === construct);
    lines.push(`| ${construct} | ${b.recall} | ${s.recall} | ${deltaRate(b.recall, s.recall)} |`);
  }
  lines.push('');
  lines.push('## Uncertainty and over-redaction');
  lines.push('');
  lines.push('An UNCERTAIN detection is masked but never tokenized (Stage 7J). It protects a value');
  lines.push('without claiming to know what it is, so it is reported separately rather than folded into');
  lines.push('recall.');
  lines.push('');
  lines.push('| Measure | BASELINE | STAGE 7 |');
  lines.push('| --- | ---: | ---: |');
  lines.push(`| Candidates scored by the evidence layer | ${base.candidates} | ${s7.candidates} |`);
  lines.push(`| Detections marked UNCERTAIN | ${base.uncertain} | ${s7.uncertain} |`);
  lines.push('');
  lines.push('## Latency');
  lines.push('');
  lines.push('| Measure | BASELINE median | BASELINE p95 | STAGE 7 median | STAGE 7 p95 |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  lines.push(`| Evidence layer (ms) | ${median(base.evidenceMs)} | ${p95(base.evidenceMs)} | ${median(s7.evidenceMs)} | ${p95(s7.evidenceMs)} |`);
  lines.push(`| Whole detect phase (ms) | ${median(base.detectMs)} | ${p95(base.detectMs)} | ${median(s7.detectMs)} | ${p95(s7.detectMs)} |`);
  lines.push('');
  lines.push('## Errors — STAGE 7 arm');
  lines.push('');
  lines.push(...errorBullets(s7.truth, s7.hits));
  lines.push('');
  lines.push('## Errors — BASELINE arm');
  lines.push('');
  lines.push(...errorBullets(base.truth, base.hits));
  lines.push('');
  lines.push('## Limits');
  lines.push('');
  lines.push('- These pages are **authored by this project**, like `pii-zoo.html` and unlike the Stage 4');
  lines.push('  held-out split. They are a targeted probe of one weakness, not a generalization benchmark,');
  lines.push('  and they carry the same authored-corpus bias every authored corpus carries.');
  lines.push('- No held-out Stage 7 split exists. Stage 7 numbers are therefore **not** comparable to');
  lines.push("  Stage 4's held-out numbers, and nothing here should be quoted as a generalization claim.");
  lines.push('- Thresholds were calibrated on the committed TRAIN split and on these fixtures only. The');
  lines.push('  Stage 4 held-out corpus was not used as a development set and was not rerun.');
  lines.push('- No real-world site has been tested.');
  lines.push('');

  mkdirSync(path.dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, lines.join('\n'));

  // Sanity floors only. The RATES are never asserted: this spec measures them, and a test that
  // demands a number is a test that will be made to pass rather than a measurement.
  expect(base.truth.length).toBeGreaterThan(40);
  expect(base.truth.filter((g) => g.category === 'NONE').length).toBeGreaterThanOrEqual(10);
  expect(overall.stage7.tp).toBeGreaterThan(0);
});
