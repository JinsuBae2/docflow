import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const typescript = (isTSX) => ({
  parser: babelParser,
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: isTSX ? ['typescript', 'jsx'] : ['typescript'] },
    },
  },
});

export default [
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'work/**',
      'outputs/**',
      'test-results/**',
      'playwright-report/**',
      '.superpowers/**',
      '.workspace/**',
      '**/*.db',
      '**/*.enc',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    languageOptions: { globals: globals.node },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: typescript(false),
    // TypeScript 7 checks type names and unused declarations with tsc.
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
  },
  {
    files: ['**/*.tsx'],
    languageOptions: typescript(true),
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
  },
  { files: ['src/renderer/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
];
