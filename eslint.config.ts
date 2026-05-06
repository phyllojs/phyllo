import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const valueStatements = ['const', 'let', 'expression'];
const controlStatements = ['if', 'for', 'while', 'do', 'switch', 'try'];

export default defineConfig(
  globalIgnores(['**/dist/', '**/.phyllo/']),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      'curly': 'error',
      'no-void': 'error',
      'padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: ['import', ...valueStatements],
          next: [
            ...valueStatements,
            ...controlStatements,
            'export',
            'function',
          ],
        },
        { blankLine: 'any', prev: 'const', next: 'const' },
        { blankLine: 'any', prev: 'let', next: 'let' },
        { blankLine: 'any', prev: 'expression', next: 'expression' },
        {
          blankLine: 'always',
          prev: 'expression',
          next: 'multiline-expression',
        },
        {
          blankLine: 'always',
          prev: controlStatements,
          next: controlStatements,
        },
        { blankLine: 'always', prev: 'block-like', next: 'export' },
        { blankLine: 'always', prev: '*', next: ['return', 'throw'] },
        {
          blankLine: 'any',
          prev: ['block-like', 'class'],
          next: ['return', 'throw'],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
);
