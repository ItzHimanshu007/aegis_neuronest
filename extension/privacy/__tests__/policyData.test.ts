import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { CATEGORY_TO_CLASS, IDENTITY_CATEGORIES, LOCKED_CLASSES, POLICY_CLASSES, POLICY_VERSION } from '../policyData';
import { ALL_CATEGORIES } from '../categoryTypes';

interface YamlPolicyClass {
  description: string;
  categories: string[];
  needed: string;
  not_needed: string;
  conditional?: { when: string; then: string; else: string };
}

interface YamlPolicy {
  version: number;
  locked: string[];
  identity_categories: string[];
  classes: Record<string, YamlPolicyClass>;
}

const yamlPath = path.resolve(__dirname, '../../../docs/policy.yaml');
const yamlDoc = loadYaml(readFileSync(yamlPath, 'utf8')) as YamlPolicy;

describe('policyData.ts matches docs/policy.yaml (the single source of truth)', () => {
  it('has the same version', () => {
    expect(POLICY_VERSION).toBe(yamlDoc.version);
  });

  it('has the same locked classes, in the same order', () => {
    expect(LOCKED_CLASSES).toEqual(yamlDoc.locked);
  });

  it('has the same identity categories', () => {
    expect(IDENTITY_CATEGORIES).toEqual(yamlDoc.identity_categories);
  });

  it('has exactly the same set of classes', () => {
    expect(Object.keys(POLICY_CLASSES).sort()).toEqual(Object.keys(yamlDoc.classes).sort());
  });

  for (const [className, yamlClass] of Object.entries(yamlDoc.classes)) {
    describe(`class "${className}"`, () => {
      it('has the same categories', () => {
        expect(POLICY_CLASSES[className as keyof typeof POLICY_CLASSES].categories).toEqual(yamlClass.categories);
      });

      it('has the same needed/not_needed actions', () => {
        expect(POLICY_CLASSES[className as keyof typeof POLICY_CLASSES].needed).toBe(yamlClass.needed);
        expect(POLICY_CLASSES[className as keyof typeof POLICY_CLASSES].not_needed).toBe(yamlClass.not_needed);
      });

      it('has the same conditional (if any)', () => {
        const generated = POLICY_CLASSES[className as keyof typeof POLICY_CLASSES].conditional;
        if (yamlClass.conditional) {
          expect(generated).toEqual(yamlClass.conditional);
        } else {
          expect(generated).toBeUndefined();
        }
      });
    });
  }

  it('derives CATEGORY_TO_CLASS consistently with the classes', () => {
    for (const [className, yamlClass] of Object.entries(yamlDoc.classes)) {
      for (const category of yamlClass.categories) {
        expect(CATEGORY_TO_CLASS[category as keyof typeof CATEGORY_TO_CLASS]).toBe(className);
      }
    }
  });

  it('every Category in categoryTypes.ts appears in some policy class (or is legitimately non_pii)', () => {
    const categoriesInYaml = new Set(Object.values(yamlDoc.classes).flatMap((c) => c.categories));
    for (const category of ALL_CATEGORIES) {
      expect(categoriesInYaml.has(category), `Category "${category}" is declared in categoryTypes.ts but missing from docs/policy.yaml`).toBe(true);
    }
  });

  it('every category the YAML declares is a known Category', () => {
    const known = new Set(ALL_CATEGORIES);
    for (const yamlClass of Object.values(yamlDoc.classes)) {
      for (const category of yamlClass.categories) {
        expect(known.has(category as (typeof ALL_CATEGORIES)[number]), `docs/policy.yaml declares category "${category}" not present in categoryTypes.ts`).toBe(true);
      }
    }
  });
});
