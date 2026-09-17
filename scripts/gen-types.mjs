#!/usr/bin/env node
// Generates TypeScript types from /shared/schema/*.schema.json into
// extension/shared/schema/*.d.ts. The JSON Schema is the single source of truth (AGENTS.md).
import { compileFromFile } from 'json-schema-to-typescript';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaDir = path.join(rootDir, 'shared', 'schema');
const outDir = path.join(rootDir, 'extension', 'shared', 'schema');

const targets = [
  { schema: 'payload.v2.schema.json', out: 'payload.v2.d.ts', name: 'PayloadV2' },
  { schema: 'plan.v2.schema.json', out: 'plan.v2.d.ts', name: 'PlanV2' },
];

await mkdir(outDir, { recursive: true });

for (const target of targets) {
  const schemaPath = path.join(schemaDir, target.schema);
  const ts = await compileFromFile(schemaPath, {
    cwd: schemaDir,
    bannerComment:
      '/* eslint-disable */\n/**\n * Generated from ' +
      target.schema +
      ' by `pnpm gen:types`. Do not hand-edit.\n */',
    style: { singleQuote: true },
  });
  const outPath = path.join(outDir, target.out);
  await writeFile(outPath, ts, 'utf8');
  console.log(`wrote ${path.relative(rootDir, outPath)}`);
}
