import js from '@eslint/js';
import globals from 'globals';
import vue from 'eslint-plugin-vue';
import ts from 'typescript-eslint';

/*
 * Mistakes, not style: the recommended rules of ESLint, typescript-eslint and the Vue plugin
 * (formatting is left alone), and the borders between the layers:
 * domain ← application ← infrastructure, ui (which do not know each other; main.ts joins them).
 */

/** Imports a layer must not make, by the folders they would reach into. */
const noImportsFrom = (layer, folders) => ({
  'no-restricted-imports': [
    'error',
    { patterns: [{ regex: `(^|/)(${folders.join('|')})(/|$)`, message: `${layer} must not depend on ${folders.join(', ')}.` }] },
  ],
});

export default ts.config(
  { ignores: ['dist', 'public/piano', 'public/demos', 'samples'] },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: true, extraFileExtensions: ['.vue'] } } },
  // Outside the project the compiler checks (tsconfig.json): no rules that need types.
  { files: ['**/*.js', 'scripts/**', 'vite.config.ts'], ...ts.configs.disableTypeChecked },
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Unused things are the compiler's business (noUnusedLocals); a leading underscore says "on purpose".
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  { files: ['scripts/**', '*.config.*', 'tests/**'], languageOptions: { globals: { ...globals.node } } },
  { files: ['public/sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },

  { files: ['src/domain/**'], rules: noImportsFrom('The domain', ['application', 'infrastructure', 'ui', 'demo']) },
  { files: ['src/application/**'], rules: noImportsFrom('The application', ['infrastructure', 'ui', 'demo']) },
  { files: ['src/infrastructure/**'], rules: noImportsFrom('The infrastructure', ['ui']) },
  { files: ['src/ui/**'], rules: noImportsFrom('The UI', ['infrastructure']) },
);
