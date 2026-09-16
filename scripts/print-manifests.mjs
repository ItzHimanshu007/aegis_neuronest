#!/usr/bin/env node
// Builds both browser targets and prints their generated manifest.json — used for the Stage
// report and as a quick sanity check that Firefox stayed on MV3.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extDir = path.join(rootDir, 'extension');

for (const browser of ['chrome', 'firefox']) {
  execFileSync('npx', ['wxt', 'build', '--browser', browser], { cwd: extDir, stdio: 'inherit' });
  const manifestPath = path.join(extDir, '.output', `${browser}-mv3`, 'manifest.json');
  const manifest = await readFile(manifestPath, 'utf8');
  console.log(`\n=== ${browser} manifest (${path.relative(rootDir, manifestPath)}) ===`);
  console.log(manifest);
}
