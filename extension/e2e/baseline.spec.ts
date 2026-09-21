import { test, expect } from './fixtures/extension';
import { openPages } from './fixtures/observe';
import { observeAndSanitize, readGroundTruth } from './fixtures/sanitize';
import {
  readAnnotations,
  matchDetections,
  addHit,
  metric,
  scoredCategories,
  errorBullets,
  type HitMap,
} from './fixtures/score';
import { decide, SessionPrivacyState } from '../privacy/policy';
import type { Category } from '../privacy/categoryTypes';
import type { Detection } from '../privacy/detect/types';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reportPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../eval/reports/stage2-baseline.md');
// Machine-readable sidecar, added in Stage 4. `heldout.spec.ts` reads it to build the
// authored-vs-held-out comparison, so the two columns come from one measured run rather than from
// numbers transcribed by hand out of the markdown. If it is absent the held-out report says
// NOT MEASURED for the authored column rather than inventing one.
const sidecarPath = reportPath.replace(/\.md$/, '.json');

test('baseline v2: exact annotated instances and linkability ablation', async ({ context, sidepanelUrl }) => {
  test.setTimeout(240_000);
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
  const truth = await readGroundTruth(targetPage);
  const negatives = truth.filter(g => g.category === 'NONE').length;
  expect(negatives).toBeGreaterThanOrEqual(20);
  const hits: HitMap = new Map();
  const protectedWith: HitMap = new Map(), protectedWithout: HitMap = new Map();
  const state = new SessionPrivacyState(), origin = 'http://localhost:5174';
  let captures = 0, changedDecisions = 0;
  const browserVersion = context.browser()?.version() ?? 'unavailable';
  const pageHeight = await targetPage.evaluate(() => document.documentElement.scrollHeight);
  const step = await targetPage.evaluate(() => Math.floor(innerHeight * .6));
  for (let y = 0; y < pageHeight; y += step) {
    await targetPage.evaluate(scrollY => window.scrollTo(0, scrollY), y);
    const result = await observeAndSanitize(panelPage, targetPage);
    captures++;
    const annotations = await readAnnotations(targetPage);
    const matched = await matchDetections(panelPage, annotations);
    const detections: Detection[] = result.preview.detections.map(d => ({ id: d.id, capture_id: 'eval', source: d.sources.includes('vault') ? 'vault' : 'rule', category: d.category, confidence: d.confidence, target: { kind: 'side_channel', ref: 'eval' }, rects: [] }));
    state.observeDetections(origin, detections);
    const base = { necessity: 'not_needed' as const, identitySeenOnOrigin: state.hasIdentitySeen(origin), userOverrides: {} };
    const withActions = detections.map(d => decide(d, { ...base, linkabilityActive: state.hasLinkability(origin) }));
    const withoutActions = detections.map(d => decide(d, { ...base, linkabilityActive: false }));
    changedDecisions += withActions.filter((a, i) => a !== withoutActions[i]).length;
    for (const m of matched) {
      const category = detections[m.detection]!.category;
      addHit(hits, m.index, category);
      if (withActions[m.detection] !== 'ALLOW') addHit(protectedWith, m.index, category);
      if (withoutActions[m.detection] !== 'ALLOW') addHit(protectedWithout, m.index, category);
    }
  }
  const categories = scoredCategories(truth, hits);
  const overall = metric(truth, hits), withRule = metric(truth, protectedWith), withoutRule = metric(truth, protectedWithout);
  const lines = [
    '# Stage 2 baseline v2 — exact annotated instances', '',
    '**Definition:** a value labelled with a sensitive type is positive even when its checksum fails (probable typo). Unlabelled near-misses are negatives.', '',
    `Measured ${new Date().toISOString()} on Chromium ${browserVersion}, balanced mode, DOM-only cascade: ${truth.length} annotations (${truth.length-negatives} positives, ${negatives} negatives), ${captures} overlapping viewport captures of the synthetic pii-zoo.html. No vision, OCR or NER.`, '',
    'Matching uses target EID geometry for fields/media, and block geometry plus exact normalized span/value containment for text. Each (annotation index, category) is counted once across captures. A wrong category is both an FP for that category and an FN for the expected one; detections outside annotated regions are excluded. Side channels are tested separately by leakage tests. There is no category-count TP proxy.', '',
    '| Category | TP | FP | FN | Precision | Recall |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...categories.map(c => { const m=metric(truth,hits,c);return `| ${c} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.precision} | ${m.recall} |`; }),
    `| **Overall** | ${overall.tp} | ${overall.fp} | ${overall.fn} | ${overall.precision} | ${overall.recall} |`, '',
    '## Linkability ablation', '',
    'The identical measured detection stream is replayed through the pure policy with necessity=not_needed, no user overrides, a fresh per-origin session and K=3. The identity-seen rule stays enabled in both arms. Linkability changes protection decisions, not detector labels.', '',
    '| Rule | Detection precision | Protection TP | Protection FP | Protection FN | Protection precision |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| Without linkability | ${overall.precision} | ${withoutRule.tp} | ${withoutRule.fp} | ${withoutRule.fn} | ${withoutRule.precision} |`,
    `| With linkability (K=3) | ${overall.precision} | ${withRule.tp} | ${withRule.fp} | ${withRule.fn} | ${withRule.precision} |`, '',
    `${changedDecisions} per-capture policy decisions changed. This corpus exposes identity data before the quasi categories, so the existing identity rule already protects them. The quasi-only threshold, origin isolation and session reset are covered separately by unit tests; this ablation does not claim an improvement where none was measured.`, '',
    '## Errors and limits', '',
    ...errorBullets(truth, hits), '',
    'Negative-region IFSC/tracking detections arise from earlier vaulted strings or their numeric substrings reappearing in unlabelled catalogue values. The session conservatively protects these known values; the annotation rule still counts them as false positives. Any additional category within an annotated value, including CITY within ADDRESS, also counts as an FP under this single-category ground truth. The Stage 2.5 run carried one false negative, a `<th>Account holder</th><td>Asha Verma</td>` row. Stage 3A traced it to the label dictionary rather than to the viewport: "account holder" matched no phrase at all, so the row header supplied no category and the labelled-value fallback never fired. Adding the account-holder/cardholder/beneficiary phrases to NAME closed it.', '',
    'The mapped iframe container has no UNSCANNED_MEDIA annotation: its contents are observed separately. Canvas and image are annotated as unscanned media. This authored-page result is not a generalization claim and must not be used as a deck benchmark; Stage 4 introduces held-out splits (see `eval/reports/stage4-heldout.md`). Off-annotation false positives and free-prose names/addresses remain outside this measurement.', '',
  ];
  // Sanity: real examples must be matched, not just a successfully emitted report.
  expect(overall.tp).toBeGreaterThan(0);
  expect(categories).toContain('AADHAAR' satisfies Category);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));
  writeFileSync(sidecarPath, JSON.stringify({
    schema: 'aegis-baseline/2',
    measuredAt: new Date().toISOString(),
    browser: browserVersion,
    corpus: 'pii-zoo.html',
    mode: 'balanced',
    cascade: 'dom-only',
    annotations: truth.length,
    positives: truth.length - negatives,
    negatives,
    captures,
    overall,
    perCategory: Object.fromEntries(categories.map(c => [c, metric(truth, hits, c)])),
  }, null, 2) + '\n');
  console.log(`Baseline v2: TP=${overall.tp}, FP=${overall.fp}, FN=${overall.fn}; precision=${overall.precision}, recall=${overall.recall}; linkability changes=${changedDecisions}`);
});
