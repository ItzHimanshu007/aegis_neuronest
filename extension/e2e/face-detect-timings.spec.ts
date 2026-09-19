import { test } from './fixtures/extension';
import { openPages } from './fixtures/observe';
import { observeAndSanitize } from './fixtures/sanitize';

/**
 * Stage 5A timing measurement for eval/reports/stage5-face.md. Not an assertion-bearing test
 * (same convention as timings.spec.ts) — just measures and prints. Cold vs warm is real, not
 * simulated: the FIRST capture in a fresh panel session genuinely has no ONNX Runtime session
 * loaded yet (extension/perception/faceModel.ts's lazy-load), so its "detect" stage time includes
 * fetching + compiling the WASM binary and the model; every capture after that reuses the warm
 * session (idle-unload is 30s, far longer than this test's per-capture gap).
 */

const RUNS = 15; // 1 cold + 14 warm, satisfying the N >= 12 requirement for the warm sample.

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

interface RegionTiming {
  regionIndex: number;
  cssWidth: number;
  cssHeight: number;
  modelWidth: number;
  modelHeight: number;
  ms: number;
}

test('Stage 5A: cold-start vs warm face-detect latency, and per-region-size latency', async ({ context, sidepanelUrl }) => {
  test.setTimeout(180_000);
  const { targetPage, panelPage } = await openPages(context, sidepanelUrl, '/pii-zoo.html');
  await targetPage.evaluate(() => document.getElementById('zoo-face-profile')!.scrollIntoView({ block: 'center' }));

  const detectMsByRun: number[] = [];
  const regionTimingsByRun: RegionTiming[][] = [];

  for (let i = 0; i < RUNS; i++) {
    const result = await observeAndSanitize(panelPage, targetPage);
    detectMsByRun.push(result.preview.timings.detectMs);
    const regionTimings = await panelPage.evaluate(
      () => (window as unknown as { __aegisLastFaceRegionTimings?: () => RegionTiming[] }).__aegisLastFaceRegionTimings?.() ?? [],
    );
    regionTimingsByRun.push(regionTimings);
  }

  const [coldMs, ...warmRuns] = detectMsByRun;
  console.log(`\n=== Stage 5A face-detect timing (pii-zoo.html, n=${RUNS}) ===`);
  console.log(`Cold-start (1st capture, model fetch+compile+first inference, all regions): ${coldMs!.toFixed(1)} ms`);
  console.log(
    `Warm (model already resident, n=${warmRuns.length}): median=${percentile(warmRuns, 50).toFixed(1)} ms, p95=${percentile(warmRuns, 95).toFixed(1)} ms, min=${Math.min(...warmRuns).toFixed(1)} ms, max=${Math.max(...warmRuns).toFixed(1)} ms`,
  );

  // Per-region latency by size: pool every WARM run's per-region timings (region indices/sizes
  // are stable across runs — same 5 media elements every capture), group by region index.
  const warmRegionRuns = regionTimingsByRun.slice(1);
  const byRegion = new Map<number, { cssWidth: number; cssHeight: number; modelWidth: number; modelHeight: number; msSamples: number[] }>();
  for (const runTimings of warmRegionRuns) {
    for (const t of runTimings) {
      const entry = byRegion.get(t.regionIndex) ?? { cssWidth: t.cssWidth, cssHeight: t.cssHeight, modelWidth: t.modelWidth, modelHeight: t.modelHeight, msSamples: [] };
      entry.msSamples.push(t.ms);
      byRegion.set(t.regionIndex, entry);
    }
  }
  const rows = [...byRegion.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([regionIndex, r]) => ({
      regionIndex,
      cssSize: `${Math.round(r.cssWidth)}x${Math.round(r.cssHeight)}`,
      modelSize: `${r.modelWidth}x${r.modelHeight}`,
      medianMs: Number(percentile(r.msSamples, 50).toFixed(2)),
      p95Ms: Number(percentile(r.msSamples, 95).toFixed(2)),
      n: r.msSamples.length,
    }));
  console.log(`\nPer-region latency (warm, n=${warmRegionRuns.length} captures per region):`);
  console.table(rows);
});
