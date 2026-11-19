'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  { files: ['js/**/*.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser, module: 'readonly' } } },
  { files: ['server.js', 'eslint.config.js', 'tests/**/*.js'], languageOptions: { sourceType: 'commonjs', globals: globals.node } },
];
