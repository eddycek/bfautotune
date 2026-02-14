import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'release/**', 'node_modules/**', 'coverage/**', '*.config.*'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Classic React hooks rules only (not React Compiler rules from v7)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Relax rules for pragmatic development
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      'prefer-const': 'warn',
      '@typescript-eslint/only-throw-error': 'off',
      'preserve-caught-error': 'off',
    },
  },
  eslintConfigPrettier,
);
