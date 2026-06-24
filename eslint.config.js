// Flat config for ESLint 9.x (the version Expo SDK 56 ships with).
// Keep this file aligned with eslint-config-expo; loosen rules only with intent.
const expoConfig = require('eslint-config-expo/flat');

// Extract the @typescript-eslint plugin already registered by expo flat config
// so we can override rules without redefining the plugin (ESLint 9 forbids that).
const tsPluginConfig = expoConfig.find(
  (c) => c.plugins && c.plugins['@typescript-eslint'],
);
const tsPlugin = tsPluginConfig.plugins['@typescript-eslint'];

module.exports = [
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'coverage/**',
      'assets/**',
      'scripts/ci-*.sh',
    ],
  },
  ...expoConfig,
  {
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Stricter than the default Expo config.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      // The error-presentation module is the only place we allow
      // `console.warn` for raw error logging (see Design §10).
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "CallExpression[callee.object.name='console'][callee.property.name='log']",
          message:
            "Use console.warn / console.error with a correlationId. console.log is reserved for build-time diagnostics.",
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
