import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';

// as iap.meshmass.com's SPA (its spa/eslint.config.js), without Vue
export default defineConfig([
  { ignores: ['node_modules'] },
  {
    files: ['**/*.js'],
    plugins: { js, '@stylistic': stylistic },
    extends: ['js/recommended'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/comma-spacing': ['error', { 'before': false, 'after': true }],
      '@stylistic/key-spacing': ['error', { 'beforeColon': false }],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 2 }],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/semi': ['error', 'always'],
    },
  },
]);
