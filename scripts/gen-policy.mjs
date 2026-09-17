#!/usr/bin/env node
// Converts docs/policy.yaml (the single source of truth) into extension/privacy/policyData.ts.
// Run via `pnpm gen:policy`. Do not hand-edit the generated file — edit the YAML and regenerate.
// extension/privacy/__tests__/policyData.test.ts proves the generated file matches the YAML.
import { load as loadYaml } from 'js-yaml';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const yamlPath = path.join(rootDir, 'docs', 'policy.yaml');
const outPath = path.join(rootDir, 'extension', 'privacy', 'policyData.ts');

const raw = await readFile(yamlPath, 'utf8');
const doc = loadYaml(raw);
const actions = new Set(['ALLOW', 'TOKEN', 'TOKEN_WITH_APPROVAL', 'FILL', 'FILL_REGION', 'BLUR', 'USER_ENTERS', 'USER_PROVIDED_ORIGIN_BOUND']);
for (const cls of Object.values(doc.classes)) {
  for (const key of ['needed', 'not_needed']) {
    if (!actions.has(cls[key]) && cls[key] !== 'TOKEN_IF_IDENTITY_PRESENT') throw new Error('Invalid policy action');
  }
  if (cls.conditional && (!actions.has(cls.conditional.then) || !actions.has(cls.conditional.else))) throw new Error('Invalid conditional action');
}

const authority = doc.authority;
if (!authority || authority.ambiguous_form_button_level !== 'L5' ||
    authority.commit_requires_user !== true || authority.password_requires_user !== true ||
    authority.cross_origin_requires_user !== true || !Array.isArray(authority.commit_words) ||
    !authority.commit_words.length || authority.commit_words.some(word => typeof word !== 'string' || !word.trim())) {
  throw new Error('Authority defaults may not weaken required consent or L5 classification');
}

function jsLiteral(value) {
  return JSON.stringify(value, null, 2).replace(/\n/g, '\n  ');
}

const classEntries = Object.entries(doc.classes).map(([name, cls]) => {
  const conditional = cls.conditional
    ? `{ when: ${JSON.stringify(cls.conditional.when)}, then: ${JSON.stringify(cls.conditional.then)}, else: ${JSON.stringify(cls.conditional.else)} }`
    : 'undefined';
  return `  ${name}: {
    description: ${JSON.stringify(cls.description.trim())},
    categories: ${jsLiteral(cls.categories)} as Category[],
    needed: ${JSON.stringify(cls.needed)} as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    not_needed: ${JSON.stringify(cls.not_needed)} as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    conditional: ${conditional},
  },`;
});

const categoryToClass = {};
for (const [className, cls] of Object.entries(doc.classes)) {
  for (const category of cls.categories) {
    categoryToClass[category] = className;
  }
}

const output = `/**
 * GENERATED from docs/policy.yaml by \`pnpm gen:policy\`. Do not hand-edit — edit the YAML and
 * regenerate. extension/privacy/__tests__/policyData.test.ts proves this file matches the YAML.
 */

import type { Action, Category, PolicyClass } from './categoryTypes';

export const POLICY_VERSION = ${JSON.stringify(doc.version)};
export const AUTHORITY_DEFAULTS = ${jsLiteral(doc.authority)} as const;

export const LOCKED_CLASSES: PolicyClass[] = ${jsLiteral(doc.locked)} as PolicyClass[];

export const IDENTITY_CATEGORIES: Category[] = ${jsLiteral(doc.identity_categories)} as Category[];

export interface PolicyClassData {
  description: string;
  categories: Category[];
  needed: Action | 'TOKEN_IF_IDENTITY_PRESENT';
  not_needed: Action | 'TOKEN_IF_IDENTITY_PRESENT';
  conditional?: { when: string; then: Action; else: Action };
}

export const POLICY_CLASSES: Record<PolicyClass, PolicyClassData> = {
${classEntries.join('\n')}
};

/** category -> its policy class, derived from POLICY_CLASSES at module load. A category with no
 * class (e.g. anything not listed in the YAML) is 'non_pii'. */
export const CATEGORY_TO_CLASS: Partial<Record<Category, PolicyClass>> = ${jsLiteral(categoryToClass)} as Partial<Record<Category, PolicyClass>>;
`;

await writeFile(outPath, output, 'utf8');
console.log(`wrote ${path.relative(rootDir, outPath)}`);
