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
  deltaPp,
  type HitMap,
  type GroundTruthItem,
  type Metric,
} from './fixtures/score';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stage 4 Part B — held-out detection accuracy.
 *
 * Scores the real DOM-only cascade against `demo-portal/generated/heldout/`: 24 synthetic pages
 * produced by `eval/page_factory`, never committed, never inspected, with ground truth derived
 * from the generator's own records rather than hand-annotated.
 *
 * Scoring goes through `fixtures/score.ts`, the same module `baseline.spec.ts` uses, so the
 * authored-vs-held-out delta measures generalization and not two different scorers.
 *
 * THIS NUMBER IS ALLOWED TO BE WORSE THAN THE AUTHORED BASELINE. Do not tune any rule, threshold
 * or label phrase in response to it — see AGENTS.md invariant 17 and eval/page_factory/README.md.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const heldoutDir = path.resolve(here, '../../demo-portal/generated/heldout');
const reportPath = path.resolve(here, '../../eval/reports/stage4-heldout.md');
const baselineSidecar = path.resolve(here, '../../eval/reports/stage2-baseline.json');
const replayDir = path.resolve(here, '../../eval/replay/heldout');

interface PageEntry {
  page: string;
  template: string;
  seed: number;
  url: string;
  annotations: number;
  positives: number;
  negatives: number;
  faces: number;
}

// How each category is actually detected. The report breaks the numbers out this way rather than
// averaging them, because a single figure would hide that checksum-validated identifiers and
// label-dependent categories generalize very differently.
const DETECTION_MODE: Record<string, string> = {
  AADHAAR: 'checksum', CARD_NUMBER: 'checksum',
  PAN: 'shape', IFSC: 'shape', UPI_ID: 'shape', EMAIL: 'shape', PHONE: 'shape',
  VEHICLE_REG: 'shape', SECRET: 'shape',
  NAME: 'label', ADDRESS: 'label', EMPLOYER: 'label', CITY: 'label', HEALTH: 'label',
  DOB: 'label', DATE: 'label', FINANCIAL_VALUE: 'label', BANK_ACCOUNT: 'label',
  PIN_CODE: 'label', VOTER_ID: 'label', PASSPORT: 'label', DRIVING_LICENCE: 'label',
  ABHA: 'label', UAN: 'label', TRACKING_ID: 'label', ORDER_ID: 'label',
  CVV: 'label', OTP: 'label', PASSWORD: 'label', UPI_PIN: 'label',
  PRIVATE_GENERIC: 'tag', UNSCANNED_MEDIA: 'media', FACE: 'vision',
};

function modeOf(category: string): string {
  return DETECTION_MODE[category] ?? 'other';
}

test('stage 4: held-out detection accuracy on generated pages', async ({ context, sidepanelUrl }) => {
  test.setTimeout(3_600_000);

  const indexPath = path.join(heldoutDir, 'index.json');
  // The held-out corpus is deliberately NOT committed, so a fresh checkout legitimately does not
  // have it. Skip rather than fail: `pnpm e2e` must pass on a machine that has never generated it,
  // and a measurement that silently did not run is worse than one that says so out loud.
  test.skip(
    !existsSync(indexPath),
    `No held-out corpus at ${heldoutDir}. Generate it with: ` +
      'python3 eval/page_factory/generate.py --split heldout --verify-seal',
  );
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
    seeds: number[];
    templates: string[];
    pages: PageEntry[];
    totals: Record<string, number>;
  };
  expect(index.pages.length).toBeGreaterThan(0);

  const browserVersion = context.browser()?.version() ?? 'unavailable';
  mkdirSync(replayDir, { recursive: true });
  const truth: GroundTruthItem[] = [];
  const hits: HitMap = new Map();
  const perPage: Array<{ page: string; template: string; annotations: number; captures: number }> = [];
  const refusals: Array<{ page: string; template: string; error: string }> = [];
  let captures = 0;

  for (const entry of index.pages) {
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, entry.url);
    // Offset every page's annotation indices into one shared corpus, so `metric()` scores the
    // whole held-out set exactly as it scores the single authored page.
    //
    // A page is only committed to `truth` once at least one of its captures actually sealed. A
    // page the pipeline REFUSED must not be folded in as a wall of false negatives: that would
    // silently report a pipeline refusal as a detector miss, which is the opposite of what
    // happened. Refusals are counted and reported separately, as their own finding.
    const pageTruth = await readGroundTruth(targetPage);
    const pageHits: HitMap = new Map();

    const pageHeight = await targetPage.evaluate(() => document.documentElement.scrollHeight);
    const step = await targetPage.evaluate(() => Math.floor(innerHeight * 0.6));
    let pageCaptures = 0;
    for (let y = 0; y < pageHeight; y += step) {
      await targetPage.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      let result;
      try {
        result = await observeAndSanitize(panelPage, targetPage);
      } catch (error) {
        refusals.push({ page: entry.page, template: entry.template, error: String(error).slice(0, 300) });
        break;
      }
      captures++;
      pageCaptures++;
      const annotations = await readAnnotations(targetPage);
      const matched = await matchDetections(panelPage, annotations);
      for (const m of matched) {
        addHit(pageHits, m.index, result.preview.detections[m.detection]!.category);
      }
      // Part D: one replay bundle per page, from its first capture. The raw screenshot is
      // stripped — `ProcessResult.preview.rawImageDataUrl` and `observation.screenshot.dataUrl`
      // are UNREDACTED pixels and must never reach disk (AGENTS.md invariant 8). Stripping it
      // also means the replay cannot re-run the face detector, which the report states.
      if (pageCaptures === 1) {
        const bundle = await panelPage.evaluate(() => {
          const w = window as unknown as { __aegisLastObserveResult: { observation: unknown } };
          const observation = structuredClone(w.__aegisLastObserveResult.observation) as {
            screenshot: { dataUrl: string };
          };
          observation.screenshot.dataUrl = '';
          return observation;
        });
        writeFileSync(
          path.join(replayDir, `${entry.page.replace(/\.html$/, '')}.observation.json`),
          JSON.stringify(
            {
              schema: 'aegis-eval-replay-observation/1',
              synthetic: true,
              page: entry.page,
              template: entry.template,
              note: 'Screenshot pixels stripped. Synthetic factory page only; never a real page.',
              observation: bundle,
              detections: result.preview.detections.map((d) => ({
                category: d.category,
                targetKind: d.targetKind,
                targetRef: d.targetRef,
              })),
            },
            null,
            2,
          ) + '\n',
        );
      }
    }
    // Commit the page only if it actually produced a scored capture.
    if (pageCaptures > 0) {
      const offset = truth.length;
      truth.push(...pageTruth);
      for (const [annotationIndex, set] of pageHits) {
        for (const category of set) addHit(hits, offset + annotationIndex, category);
      }
      perPage.push({
        page: entry.page,
        template: entry.template,
        annotations: pageTruth.length,
        captures: pageCaptures,
      });
    }
    await targetPage.close();
    await panelPage.close();
  }

  const negatives = truth.filter((g) => g.category === 'NONE').length;
  const categories = scoredCategories(truth, hits);
  const overall = metric(truth, hits);

  // Authored column, from the sidecar baseline.spec.ts writes in the same run.
  let authored: { overall: Metric; perCategory: Record<string, Metric>; annotations: number } | null = null;
  if (existsSync(baselineSidecar)) {
    authored = JSON.parse(readFileSync(baselineSidecar, 'utf8'));
  }
  const authoredCell = (c: string | null): Metric | null => {
    if (!authored) return null;
    return c === null ? authored.overall : (authored.perCategory[c] ?? null);
  };
  const row = (label: string, held: Metric, auth: Metric | null): string => {
    const a = auth
      ? `${auth.tp}/${auth.fp}/${auth.fn} | ${auth.precision} | ${auth.recall}`
      : 'NOT MEASURED | NOT MEASURED | NOT MEASURED';
    const dp = auth ? deltaPp(auth.precision, held.precision) : '—';
    const dr = auth ? deltaPp(auth.recall, held.recall) : '—';
    return `| ${label} | ${a} | ${held.tp}/${held.fp}/${held.fn} | ${held.precision} | ${held.recall} | ${dp} | ${dr} |`;
  };

  // Group the same measured hits by how each category is detected. Nothing is re-measured here;
  // this is the identical detection stream partitioned three ways.
  const groupMetric = (mode: string): Metric => {
    const inMode = new Set(categories.filter((c) => modeOf(c) === mode));
    let tp = 0, fp = 0, fn = 0;
    truth.forEach((g, i) => {
      if (g.category !== 'NONE' && inMode.has(g.category) && !hits.get(i)?.has(g.category)) fn++;
      for (const detected of hits.get(i) ?? []) {
        if (!inMode.has(detected)) continue;
        if (detected === g.category) tp++;
        else fp++;
      }
    });
    return {
      tp, fp, fn,
      precision: tp + fp ? (tp / (tp + fp)).toFixed(3) : '—',
      recall: tp + fn ? (tp / (tp + fn)).toFixed(3) : '—',
    };
  };

  const modes = ['checksum', 'shape', 'label', 'tag', 'media'];
  const lines = [
    '# Stage 4 — held-out detection accuracy',
    '',
    '**This is the number that is allowed to be worse.** Every accuracy figure in this repository',
    'before Stage 4 was measured on `pii-zoo.html`, a page this project wrote and annotated by hand.',
    'This report measures the same cascade on pages it has never seen, with ground truth derived',
    'from the generator rather than annotated by a person. A lower, honest held-out number is worth',
    'more than a higher authored one.',
    '',
    '**Definition:** a value labelled with a sensitive type is positive even when its checksum fails',
    '(probable typo). Unlabelled near-misses are negatives. Identical to the Stage 2 baseline.',
    '',
    '## Conditions',
    '',
    `- Measured: ${new Date().toISOString()}`,
    `- Machine: ${os.cpus()[0]?.model ?? 'unknown CPU'}, ${os.type()} ${os.release()} (${os.arch()}), ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM.`,
    `- Node ${process.version}. Extension build: \`wxt build --browser chrome\` (production).`,
    `- Browser: Chromium ${browserVersion} via Playwright, \`extension/e2e/heldout.spec.ts\` (\`workers: 1\`, \`fullyParallel: false\`)`,
    '- Mode: `balanced` (the panel default). DOM-only cascade. No vision, OCR or NER.',
    '- Server: not involved. Detection is scored from the local `ProcessResult`, before `send()`.',
    `- Corpus: \`demo-portal/generated/heldout/\` — ${index.pages.length} pages generated from ${index.templates.length} templates, seeds ${index.seeds.join(', ')}.`,
    `- **Scored: ${perPage.length} of ${index.pages.length} pages.** ${refusals.length} page(s) were refused by the pipeline before any capture could be scored — see "Pipeline refusals" below. Refused pages are excluded from the corpus entirely rather than counted as false negatives, because a refusal is not a detector miss.`,
    `- ${truth.length} annotations (${truth.length - negatives} positives, ${negatives} negatives), ${captures} overlapping viewport captures.`,
    '- Corpus provenance: generated by `eval/page_factory`, sealed by `eval/page_factory/heldout-seal.json`, never committed to git.',
    '',
    'Matching uses target EID geometry for fields/media, and block geometry plus exact normalized',
    'span/value containment for text. Each (annotation index, category) is counted once across',
    'captures. A wrong category is both an FP for that category and an FN for the expected one;',
    'detections outside annotated regions are excluded. This is the same rule and the same code',
    '(`extension/e2e/fixtures/score.ts`) the authored baseline uses.',
    '',
    '## Authored vs held-out, per category',
    '',
    '| Category | Authored TP/FP/FN | Authored P | Authored R | Held-out TP/FP/FN | Held-out P | Held-out R | ΔP (pp) | ΔR (pp) |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...categories.map((c) => row(c, metric(truth, hits, c), authoredCell(c))),
    row('**Overall**', overall, authoredCell(null)),
    '',
    '## By detection mode',
    '',
    'The same measured detection stream, partitioned by how each category is actually detected.',
    'Averaging these into one figure would hide the only thing this table is for.',
    '',
    '| Mode | Categories | TP | FP | FN | Precision | Recall |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...modes.map((mode) => {
      const cats = categories.filter((c) => modeOf(c) === mode);
      if (!cats.length) return `| ${mode} | (none) | — | — | — | — | — |`;
      const m = groupMetric(mode);
      return `| ${mode} | ${cats.join(', ')} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.precision} | ${m.recall} |`;
    }),
    '',
    '## Per page',
    '',
    '| Page | Template | Annotations | Captures |',
    '| --- | --- | ---: | ---: |',
    ...perPage.map((p) => `| ${p.page} | ${p.template} | ${p.annotations} | ${p.captures} |`),
    '',
    '## Pipeline refusals',
    '',
    refusals.length === 0
      ? 'None. Every generated page sealed successfully.'
      : `**${refusals.length} of ${index.pages.length} pages could not be sealed at all.** This is a ` +
        'pipeline finding, not a detection result, and it is reported here rather than folded into ' +
        'the precision/recall table. A refused page produces no payload, so the agent cannot act on ' +
        'it at all — a strictly worse outcome than a missed detection.',
    '',
    ...(refusals.length
      ? [
          '| Page | Template | Refusal |',
          '| --- | --- | --- |',
          ...refusals.map((r) => `| ${r.page} | ${r.template} | \`${r.error.replace(/\|/g, '\\|')}\` |`),
          '',
        ]
      : []),
    '## Errors',
    '',
    ...errorBullets(truth, hits),
    '',
    '## Limits',
    '',
    '- Held-out pages are **unseen, not independent**: the generator was written by this project.',
    '  That removes annotator bias and instance memorisation, but not the shared-authorship prior.',
    '  This is not a claim about real-world sites, and no real-world site has been tested.',
    '- `PHOTO`, `ID_DOCUMENT`, `CARD_IMAGE`, `SIGNATURE` and `QR` are not planted: nothing in the',
    '  current cascade emits them, so including them would report a known coverage gap as a',
    '  generalization failure. They remain unmeasured, not passing.',
    '- Face assets are the four synthetic Stage 5A images recomposited at new sizes and positions,',
    '  so face results vary geometry but **not identity**.',
    '- Off-annotation false positives remain outside this measurement, as in the Stage 2 baseline.',
    '',
  ];

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));

  // Replay bundle (Part D): synthetic pages only, ground truth + measured hits, no raw screenshot.
  mkdirSync(replayDir, { recursive: true });
  writeFileSync(
    path.join(replayDir, 'heldout-score.json'),
    JSON.stringify(
      {
        schema: 'aegis-eval-replay/1',
        synthetic: true,
        measuredAt: new Date().toISOString(),
        browser: browserVersion,
        corpus: {
          pagesGenerated: index.pages.length,
          pagesScored: perPage.length,
          pagesRefused: refusals.length,
          annotations: truth.length,
          captures,
        },
        refusals,
        truth,
        hits: [...hits.entries()].map(([index, set]) => ({ index, categories: [...set] })),
        overall,
        perCategory: Object.fromEntries(categories.map((c) => [c, metric(truth, hits, c)])),
      },
      null,
      2,
    ) + '\n',
  );

  // Sanity floors so an empty or collapsed corpus cannot pass as a measurement. The RATE is never
  // asserted — a worse held-out number is the expected outcome of this stage, not a failure.
  expect(perPage.length).toBeGreaterThan(0);
  expect(truth.length).toBeGreaterThan(100);
  expect(negatives).toBeGreaterThanOrEqual(30);
  expect(overall.tp).toBeGreaterThan(0);
  console.log(
    `Held-out: TP=${overall.tp}, FP=${overall.fp}, FN=${overall.fn}; ` +
      `precision=${overall.precision}, recall=${overall.recall} over ${perPage.length}/${index.pages.length} pages ` +
      `(${refusals.length} refused) / ${captures} captures`,
  );
});
