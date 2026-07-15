import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const workerImportBoundary = [
  'error',
  {
    patterns: [{
      group: ['worker/**', '**/worker/**'],
      message: 'The Web UI must use API contracts instead of importing Worker implementation modules.',
    }],
  },
];

export default tseslint.config(
  {
    ignores: ['dist/**', '.wrangler/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      'no-useless-catch': 'warn',
      'prefer-const': 'warn',
      'preserve-caught-error': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/no-mutating-props': 'warn',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': workerImportBoundary,
    },
  },
  {
    files: ['worker/**/*.ts'],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    files: ['worker/application/**/*.ts', 'worker/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{
            group: ['**/infrastructure/**', '**/http/**'],
            message: 'Application and domain modules must depend on ports, not infrastructure or HTTP.',
          }],
        },
      ],
    },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.{js,mjs,ts}', 'tests/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
