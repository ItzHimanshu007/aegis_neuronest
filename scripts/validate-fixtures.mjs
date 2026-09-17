#!/usr/bin/env node
// Validates every example fixture in /shared/schema/examples against its JSON Schema.
// This is part of `pnpm check` — schema/fixture drift is a build failure, not a warning.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaDir = path.join(rootDir, 'shared', 'schema');
const examplesDir = path.join(schemaDir, 'examples');

const cases = [
  { schema: 'payload.v2.schema.json', example: 'payload.kyc.json' },
  { schema: 'plan.v2.schema.json', example: 'plan.kyc.json' },
];

// strictRequired is off: plan.v2's action-specific if/then blocks add `required` for a field
// that isn't repeated in that branch's `properties` (they only need to require it, not redefine
// its type — it's already typed in the outer `action` schema). That's valid draft-2020-12; Ajv's
// strictRequired heuristic just doesn't like the pattern.
const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
addFormats(ajv);

let failed = false;

for (const { schema, example } of cases) {
  const schemaJson = JSON.parse(await readFile(path.join(schemaDir, schema), 'utf8'));
  const exampleJson = JSON.parse(await readFile(path.join(examplesDir, example), 'utf8'));
  const validate = ajv.compile(schemaJson);
  const valid = validate(exampleJson);
  if (valid) {
    console.log(`OK   ${example} matches ${schema}`);
  } else {
    failed = true;
    console.error(`FAIL ${example} against ${schema}`);
    for (const err of validate.errors ?? []) {
      console.error(`  ${err.instancePath || '/'} ${err.message}`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
}

const agreementCases = JSON.parse(await readFile(path.join(schemaDir, 'agreement-cases.json'), 'utf8'));
for (const kind of ['payload', 'plan']) {
  const schema = JSON.parse(await readFile(path.join(schemaDir, `${kind}.v2.schema.json`), 'utf8'));
  const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
  for (const fixture of agreementCases.filter(c => c.kind === kind)) {
    if (validate(fixture.value) !== fixture.valid) {
      failed = true;
      console.error(`FAIL agreement: ${fixture.name}`);
    }
  }
}
console.log(`${failed ? 'FAIL' : 'OK'}   ${agreementCases.length} positive/negative schema agreement cases`);
if (failed) process.exitCode = 1;
