'use strict';
const js = require('@eslint/js');
const globals = require('globals');

const qualityRules = {
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-shadow': 'error',
  'no-unused-vars': ['error', { args: 'after-used', ignoreRestSiblings: true }],
  'no-implicit-coercion': ['error', { allow: ['!!'] }],
  'no-throw-literal': 'error',
  'no-return-await': 'error',
  curly: ['error', 'multi-line'],
  complexity: ['error', 12],
  'max-depth': ['error', 3],
  'max-params': ['error', 5],
};

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  { rules: qualityRules },
  {
    // Browser scripts are classic scripts wrapped in a small UMD factory so Node tests can require() them too.
    files: ['js/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, module: 'readonly', require: 'readonly' } },
  },
  {
    files: ['server.js', 'lib/**/*.js', 'eslint.config.js', 'tests/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
];
