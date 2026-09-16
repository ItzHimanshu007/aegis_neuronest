import { test } from './fixtures/extension';
import { observe, openPages } from './fixtures/observe';
import type { ObservationTimings } from '../observe/types';

/**
 * Timing benchmark for the Stage 1 report (Part H: "kyc.html observation timings reported
 * (inject, harvest, capture, total): median of 10 runs"). Not an assertion-bearing test — Stage 8
 * is where latency budgets get enforced (see docs/STAGES.md); this just measures and prints.
 */

const RUNS = 10;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function summarise(label: string, samples: ObservationTimings[]) {
  const keys: Array<keyof ObservationTimings> = ['injectMs', 'harvestMs', 'captureMs', 'totalMs'];
  const rows = keys.map((key) => {
    const values = samples.map((s) => s[key]);
    return {
      metric: key,
      median: Number(percentile(values, 50).toFixed(1)),
      p95: Number(percentile(values, 95).toFixed(1)),
      min: Number(Math.min(...values).toFixed(1)),
      max: Number(Math.max(...values).toFixed(1)),
    };
  });
  console.log(`\n=== TIMINGS: ${label} (n=${samples.length}) ===`);
  console.table(rows);
}

for (const page of ['kyc.html', 'dynamic.html']) {
  test(`timings: ${page} over ${RUNS} observations`, async ({ context, sidepanelUrl }) => {
    test.setTimeout(180_000);
    const { targetPage, panelPage } = await openPages(context, sidepanelUrl, `/${page}`);

    if (page === 'dynamic.html') {
      // Dismiss the auto-opening modal so every run measures the same screen.
      await targetPage.waitForSelector('#modal-close', { timeout: 5_000 });
      await targetPage.click('#modal-close');
      await targetPage.waitForSelector('#modal-backdrop', { state: 'detached' });
    }

    const samples: ObservationTimings[] = [];
    for (let i = 0; i < RUNS; i++) {
      const result = await observe(panelPage, targetPage);
      samples.push(result.observation.timings);
    }
    summarise(page, samples);
  });
}
