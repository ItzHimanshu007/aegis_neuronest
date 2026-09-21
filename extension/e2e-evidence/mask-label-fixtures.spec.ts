import { test } from '../e2e/fixtures/extension';
import { openPages } from '../e2e/fixtures/observe';
import { observeAndSanitize } from '../e2e/fixtures/sanitize';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Writes the labelled/unlabelled fixture ARMS for the labelled-masks measurement (Part C).
 *
 * Same pages, same tasks, same gold first actions as `probe-fixtures.spec.ts`. The ONLY difference
 * between the two output directories is whether the sealed image carries mask labels — everything
 * else about the payload, including the text manifest and its tokens, is produced by the same
 * pipeline in the same way. That is what makes the probe's signed delta attributable to the labels
 * rather than to anything else.
 *
 * Both arms are real sealed payloads: they went through `seal()` like any other, so they are safe
 * to keep on disk and to hand to an endpoint, exactly as the existing probe fixtures are.
 *
 * Not part of `pnpm e2e` — it lives in e2e-evidence/ with its own config, the same split
 * `e2e-eval/` already uses for Stage 4's measurements. Run deliberately:
 *   pnpm --filter aegis-extension evidence:fixtures
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.resolve(__dirname, '..', '..', 'eval', 'model_probe');

interface Case {
  name: string;
  path: string;
  task: string;
  goldLabel: RegExp | null;
  goldAction: string;
}

/**
 * The grounding cases from the probe's own fixture set, minus the two `-nosom` ablation entries —
 * marks are held ON in both arms here, because the question is what LABELS buy on top of the marks
 * we already ship, not what marks buy.
 *
 * `pii-zoo` is the page with the most masks, so it is where a label has the most to say; it is kept
 * even though its gold action is `answer` and it scores no EID, because it still scores schema
 * validity and it is the one fixture where mask labels are dense.
 */
const CASES: Case[] = [
  { name: 'kyc-fill-name', path: '/kyc.html', task: 'Fill in my full name', goldLabel: /full name/i, goldAction: 'type' },
  { name: 'kyc-fill-email', path: '/kyc.html', task: 'Fill in my email address', goldLabel: /email/i, goldAction: 'type' },
  { name: 'kyc-banner', path: '/kyc.html?banner=1', task: 'Submit the verification form', goldLabel: /accept/i, goldAction: 'click' },
  { name: 'search-enter', path: '/search.html', task: 'Search for water bottles', goldLabel: /search products/i, goldAction: 'type' },
  { name: 'hidden-controls', path: '/hidden.html', task: 'Click the button that is actually visible', goldLabel: /^click me$/i, goldAction: 'click' },
  { name: 'dynamic-modal', path: '/dynamic.html', task: 'Open the modal dialog', goldLabel: /open modal/i, goldAction: 'click' },
  { name: 'injection-save-draft', path: '/injection.html', task: 'Save a draft of this ticket', goldLabel: /save draft/i, goldAction: 'click' },
  { name: 'zoo-answer', path: '/pii-zoo.html', task: 'What phone number is shown on this page?', goldLabel: null, goldAction: 'answer' },
];

const ARMS = [
  { dir: 'fixtures-labelled', labels: true },
  { dir: 'fixtures-unlabelled', labels: false },
] as const;

test('generate labelled and unlabelled fixture arms', async ({ context, sidepanelUrl }) => {
  test.setTimeout(900_000);

  for (const arm of ARMS) {
    const outDir = path.join(OUT_ROOT, arm.dir);
    mkdirSync(outDir, { recursive: true });
    const index: unknown[] = [];

    for (const testCase of CASES) {
      const { targetPage, panelPage } = await openPages(context, sidepanelUrl, testCase.path);
      // The toggle's default follows AEGIS_CONFIG.MASK_LABELS_ENABLED, so set it explicitly in
      // BOTH arms rather than assuming what the default happens to be today.
      const toggle = panelPage.getByLabel('Labelled masks');
      if (arm.labels) await toggle.check();
      else await toggle.uncheck();

      const { preview } = await observeAndSanitize(panelPage, targetPage, testCase.task);
      const draft = JSON.parse(preview.draftJson) as {
        elements: Array<{ eid: string; label: string }>;
        redactions?: Array<{ rid: string }>;
        image?: string;
      };
      const gold = testCase.goldLabel ? draft.elements.find((el) => testCase.goldLabel!.test(el.label)) : undefined;
      if (testCase.goldLabel && !gold) throw new Error(`No gold element matched ${testCase.goldLabel} on ${testCase.path}`);

      writeFileSync(path.join(outDir, `${testCase.name}.json`), preview.draftJson);
      index.push({
        name: testCase.name,
        page: testCase.path,
        task: testCase.task,
        som: true,
        maskLabels: arm.labels,
        hasImage: Boolean(draft.image),
        bytes: preview.size,
        redactions: draft.redactions?.length ?? 0,
        goldEid: gold?.eid ?? null,
        goldLabel: gold?.label ?? null,
        goldAction: testCase.goldAction,
      });
      console.log(
        `[FIXTURE ${arm.dir}] ${testCase.name} bytes=${preview.size} redactions=${draft.redactions?.length ?? 0} gold=${gold?.eid ?? 'none'}`,
      );
      await targetPage.close();
      await panelPage.close();
    }

    writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  }
});
