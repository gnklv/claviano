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

/**
 * Characters of a font that stand for an icon. An icon comes from the set (ui/icons): a character is
 * drawn by whichever font a system has, and an iPhone draws some as emoji (docs/rules.md).
 */
const ICON_CHARACTERS = '/[←→‹›✕×⚙▶■❚⏸⋯↻＋−♪♩☀☾◐●○]/u';
const ICONS_FROM_THE_SET = 'An icon comes from the set (AppIcon), not from the characters of a font.';

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
  {
    files: ['src/ui/**'],
    rules: {
      ...noImportsFrom('The UI', ['infrastructure']),
      // Drawing is infrastructure's, behind a port (docs/rules.md): a component owns the element, not the pixels.
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name='getContext']", message: 'Canvas is drawn in infrastructure/render, behind a port.' },
        { selector: `Literal[value=${ICON_CHARACTERS}]`, message: ICONS_FROM_THE_SET },
        { selector: `TemplateElement[value.raw=${ICON_CHARACTERS}]`, message: ICONS_FROM_THE_SET },
      ],
      'vue/no-restricted-syntax': ['error', { selector: `VElement[name='template'] VText[value=${ICON_CHARACTERS}]`, message: ICONS_FROM_THE_SET }, { selector: `Literal[value=${ICON_CHARACTERS}]`, message: ICONS_FROM_THE_SET }],
    },
  },
  // (The words drawn over the falling notes say which way a pedal moves with an arrow: words, not icons.)
  { files: ['src/ui/i18n/**'], rules: { 'no-restricted-syntax': 'off' } },
);
