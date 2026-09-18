// @ts-check
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'vendor/**', '**/*.tsbuildinfo'],
  },
  ...tseslint.configs.recommended,
  prettierConfig,
);
