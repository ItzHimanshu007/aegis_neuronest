import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const FORBIDDEN_NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket'];

// AGENTS.md invariant 2: net/network.ts is the ONLY file allowed to touch the network.
// AGENTS.md invariant 7: no eval, no new Function, no remote code.
const noRestrictedGlobalsForNetworkBoundary = FORBIDDEN_NETWORK_GLOBALS.map((name) => ({
  name,
  message: `Only extension/net/network.ts may use ${name}. See AGENTS.md invariant 2.`,
}));

const noRestrictedSyntaxForEval = [
  {
    selector: "CallExpression[callee.name='eval']",
    message: 'eval() is forbidden. See AGENTS.md invariant 7.',
  },
  {
    selector: "NewExpression[callee.name='Function']",
    message: 'new Function() is forbidden. See AGENTS.md invariant 7.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/*.d.ts',
      'shared/schema/*.schema.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.webextensions },
    },
    rules: {
      'no-restricted-globals': ['error', ...noRestrictedGlobalsForNetworkBoundary],
      'no-restricted-syntax': ['error', ...noRestrictedSyntaxForEval],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The one sanctioned exception to the network boundary rule, plus test code:
    //  - net/__tests__ must reference the global `fetch` to stub/assert on it (never calling out).
    //  - e2e specs run inside Playwright and evaluate code in a *page* context (e.g. probing
    //    whether the mock server is up before a send test). That is the test harness driving a
    //    browser, not extension runtime code, and none of it ships in the built extension — the
    //    invariant this rule protects is about what the EXTENSION may do.
    files: ['extension/net/network.ts', 'extension/net/__tests__/**', 'extension/e2e/**'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['**/*.config.ts', '**/*.config.mjs', 'scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
