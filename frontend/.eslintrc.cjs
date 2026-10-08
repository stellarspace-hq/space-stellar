/*
 * ESLint configuration for the game frontend.
 *
 * The repository root lints the Scaffold Stellar app in src/ with a flat
 * config; the game and its 13 page components live in this separate package,
 * which ships its own eslint 8 toolchain and therefore uses an eslintrc-style
 * config that those installed plugins understand.
 *
 * react-hooks/recommended is enabled so the missing-dependency bugs in the game
 * loop (SpaceShooterGame.tsx) are caught. The frontend predates this config, so
 * the rules below are the pre-existing violations they surfaced. They are
 * recorded as `warn` in this single documented block rather than failing CI;
 * new code should not add fresh violations of them.
 */
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: 'detect' } },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  rules: {
    // --- Pre-existing violations, recorded as warnings (see header). ---
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'prefer-const': 'warn',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
};
