import { test, expect } from './fixtures/extension';
import { openPages } from './fixtures/observe';
import { observeAndSanitize, readGroundTruth } from './fixtures/sanitize';
import type { ObserveResult } from '../shared/messages';
import type { ProcessResult } from '../agentHost';
import { decide, SessionPrivacyState } from '../privacy/policy';
import type { Category } from '../privacy/categoryTypes';
import type { Detection } from '../privacy/detect/types';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reportPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../eval/reports/stage2-baseline.md');

test('baseline v2: exact annotated instances and linkability ablation', async ({ context, sidepanelUrl }) => {
  test.setTimeout(240_000);
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
  const truth = await readGroundTruth(targetPage);
  const negatives = truth.filter(g => g.category === 'NONE').length;
  expect(negatives).toBeGreaterThanOrEqual(20);
  const hits = new Map<number, Set<string>>();
  const protectedWith = new Map<number, Set<string>>(), protectedWithout = new Map<number, Set<string>>();
  const state = new SessionPrivacyState(), origin = 'http://localhost:5174';
  let captures = 0, changedDecisions = 0;
  const browserVersion = context.browser()?.version() ?? 'unavailable';
  const pageHeight = await targetPage.evaluate(() => document.documentElement.scrollHeight);
  const step = await targetPage.evaluate(() => Math.floor(innerHeight * .6));
  for (let y = 0; y < pageHeight; y += step) {
    await targetPage.evaluate(scrollY => window.scrollTo(0, scrollY), y);
    const result = await observeAndSanitize(panelPage, targetPage);
    captures++;
    const annotations = await targetPage.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-gt]')).map((el, index) => {
      const r = el.getBoundingClientRect();
      return { index, value: el instanceof HTMLInputElement ? el.value : (el.textContent ?? '').trim(),
        bbox: { x: r.x, y: r.y, width: r.width, height: r.height } };
    }));
    // Join only inside the panel document. The result contains annotation indices/categories,
    // never raw text, screenshots or guessed TP counts. Geometry separates repeated values.
    const matched = await panelPage.evaluate((gt) => {
      const w = window as unknown as { __aegisLastObserveResult: ObserveResult; __aegisLastProcessResult: ProcessResult };
      const o = w.__aegisLastObserveResult.observation, r = w.__aegisLastProcessResult;
      const payload = JSON.parse(r.preview.draftJson) as { elements: Array<{ eid: string; fp: string; bbox: number[] }> };
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
        Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x) && Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);
      return r.preview.detections.flatMap((d, di) => {
        let box, text: string | undefined;
        if (d.targetKind === 'element') {
          const e = payload.elements.find(e => e.eid === d.targetRef);
          if (e) box = { x: e.bbox[0]!, y: e.bbox[1]!, width: e.bbox[2]!, height: e.bbox[3]! };
        } else if (d.targetKind === 'text_span') {
          const b = o.textBlocks.find(b => b.blockRef === d.targetRef);
          box = b?.bbox;
          text = b && (d.span ? b.text.slice(d.span.start, d.span.end) : b.text);
        } else if (d.targetKind === 'media') box = o.media[Number(d.targetRef.replace('media-', ''))]?.bbox;
        if (!box) return [];
        return gt.filter(g => g.bbox.y + g.bbox.height > 0 && g.bbox.y < o.viewport.cssH && overlaps(box!, g.bbox) &&
          (text === undefined || (norm(g.value).length > 0 && (norm(text).includes(norm(g.value)) || norm(g.value).includes(norm(text))))))
          .map(g => ({ index: g.index, detection: di }));
      });
    }, annotations);
    const detections: Detection[] = result.preview.detections.map(d => ({ id: d.id, capture_id: 'eval', source: d.sources.includes('vault') ? 'vault' : 'rule', category: d.category, confidence: d.confidence, target: { kind: 'side_channel', ref: 'eval' }, rects: [] }));
    state.observeDetections(origin, detections);
    const base = { necessity: 'not_needed' as const, identitySeenOnOrigin: state.hasIdentitySeen(origin), userOverrides: {} };
    const withActions = detections.map(d => decide(d, { ...base, linkabilityActive: state.hasLinkability(origin) }));
    const withoutActions = detections.map(d => decide(d, { ...base, linkabilityActive: false }));
    changedDecisions += withActions.filter((a, i) => a !== withoutActions[i]).length;
    const add = (map: Map<number, Set<string>>, i: number, category: string) => { const set = map.get(i) ?? new Set(); set.add(category); map.set(i, set); };
    for (const m of matched) {
      const category = detections[m.detection]!.category;
      add(hits, m.index, category);
      if (withActions[m.detection] !== 'ALLOW') add(protectedWith, m.index, category);
      if (withoutActions[m.detection] !== 'ALLOW') add(protectedWithout, m.index, category);
    }
  }
  const categories = [...new Set([...truth.filter(g => g.category !== 'NONE').map(g => g.category), ...[...hits.values()].flatMap(s => [...s])])].sort();
  const metric = (map: Map<number, Set<string>>, category?: string) => {
    let tp=0, fp=0, fn=0;
    truth.forEach((g, i) => {
      if (g.category !== 'NONE' && (!category || g.category === category) && !map.get(i)?.has(g.category)) fn++;
      for (const detected of map.get(i) ?? []) {
        if (category && detected !== category) continue;
        if (detected === g.category) tp++; else fp++;
      }
    });
    return { tp, fp, fn, precision: tp+fp ? (tp/(tp+fp)).toFixed(3) : '—', recall: tp+fn ? (tp/(tp+fn)).toFixed(3) : '—' };
  };
  const overall = metric(hits), withRule = metric(protectedWith), withoutRule = metric(protectedWithout);
  const lines = [
    '# Stage 2 baseline v2 — exact annotated instances', '',
    '**Definition:** a value labelled with a sensitive type is positive even when its checksum fails (probable typo). Unlabelled near-misses are negatives.', '',
    `Measured ${new Date().toISOString()} on Chromium ${browserVersion}, balanced mode, DOM-only cascade: ${truth.length} annotations (${truth.length-negatives} positives, ${negatives} negatives), ${captures} overlapping viewport captures of the synthetic pii-zoo.html. No vision, OCR or NER.`, '',
    'Matching uses target EID geometry for fields/media, and block geometry plus exact normalized span/value containment for text. Each (annotation index, category) is counted once across captures. A wrong category is both an FP for that category and an FN for the expected one; detections outside annotated regions are excluded. Side channels are tested separately by leakage tests. There is no category-count TP proxy.', '',
    '| Category | TP | FP | FN | Precision | Recall |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...categories.map(c => { const m=metric(hits,c);return `| ${c} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.precision} | ${m.recall} |`; }),
    `| **Overall** | ${overall.tp} | ${overall.fp} | ${overall.fn} | ${overall.precision} | ${overall.recall} |`, '',
    '## Linkability ablation', '',
    'The identical measured detection stream is replayed through the pure policy with necessity=not_needed, no user overrides, a fresh per-origin session and K=3. The identity-seen rule stays enabled in both arms. Linkability changes protection decisions, not detector labels.', '',
    '| Rule | Detection precision | Protection TP | Protection FP | Protection FN | Protection precision |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| Without linkability | ${overall.precision} | ${withoutRule.tp} | ${withoutRule.fp} | ${withoutRule.fn} | ${withoutRule.precision} |`,
    `| With linkability (K=3) | ${overall.precision} | ${withRule.tp} | ${withRule.fp} | ${withRule.fn} | ${withRule.precision} |`, '',
    `${changedDecisions} per-capture policy decisions changed. This corpus exposes identity data before the quasi categories, so the existing identity rule already protects them. The quasi-only threshold, origin isolation and session reset are covered separately by unit tests; this ablation does not claim an improvement where none was measured.`, '',
    '## Errors and limits', '',
    ...truth.flatMap((g,i) => {
      const actual=[...(hits.get(i) ?? [])];
      if ((g.category==='NONE' && !actual.length) || (actual.length===1 && actual[0]===g.category)) return [];
      return [`- Annotation ${i}: expected ${g.category}; detected ${actual.join(', ') || 'none'}.`];
    }), '',
    'Negative-region IFSC/tracking detections arise from earlier vaulted strings or their numeric substrings reappearing in unlabelled catalogue values. The session conservatively protects these known values; the annotation rule still counts them as false positives. Any additional category within an annotated value, including CITY within ADDRESS, also counts as an FP under this single-category ground truth. The Stage 2.5 run carried one false negative, a `<th>Account holder</th><td>Asha Verma</td>` row. Stage 3A traced it to the label dictionary rather than to the viewport: "account holder" matched no phrase at all, so the row header supplied no category and the labelled-value fallback never fired. Adding the account-holder/cardholder/beneficiary phrases to NAME closed it.', '',
    'The mapped iframe container has no UNSCANNED_MEDIA annotation: its contents are observed separately. Canvas and image are annotated as unscanned media. This authored-page result is not a generalization claim and must not be used as a deck benchmark; Stage 4 introduces held-out splits. Off-annotation false positives and free-prose names/addresses remain outside this measurement.', '',
  ];
  // Sanity: real examples must be matched, not just a successfully emitted report.
  expect(overall.tp).toBeGreaterThan(0);
  expect(categories).toContain('AADHAAR' satisfies Category);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));
  console.log(`Baseline v2: TP=${overall.tp}, FP=${overall.fp}, FN=${overall.fn}; precision=${overall.precision}, recall=${overall.recall}; linkability changes=${changedDecisions}`);
});
