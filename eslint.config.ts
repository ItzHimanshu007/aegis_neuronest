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
    // The one sanctioned exception to the network boundary rule, plus its own tests, which must
    // reference the global `fetch` to stub/assert on it (they never call the real network).
    files: ['extension/net/network.ts', 'extension/net/__tests__/**'],
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
