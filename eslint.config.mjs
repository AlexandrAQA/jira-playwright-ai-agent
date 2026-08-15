import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'dist/', 'playwright-report/', 'test-results/', '.playwright-mcp/'],
  },

  js.configs.recommended,

  // Type-aware linting: the rules below can follow types across files, which is
  // what catches a floating promise on a Playwright call.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A missing await on a locator action is the single most common way an
      // agent-written test turns flaky, so it is an error, not a warning.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The Jira and report payloads are plain JSON, so a narrow escape hatch
      // is more honest than pretending every field is typed.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Playwright-specific rules, only for the specs.
  {
    files: ['tests/**/*.spec.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/expect-expect': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-skipped-test': 'error',
      'playwright/prefer-web-first-assertions': 'error',
    },
  },

  // This config file is not part of tsconfig, so the type-aware rules have
  // nothing to work with here.
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Node scripts talk to the console on purpose.
  {
    files: ['scripts/**/*.ts', 'src/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Must stay last: switches off every rule that would argue with Prettier.
  prettier,
);
