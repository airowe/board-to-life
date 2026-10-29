import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.vercel'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { console: 'readonly', performance: 'readonly', process: 'readonly' } } },
);
