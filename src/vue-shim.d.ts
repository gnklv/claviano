/* For tools that read TypeScript without knowing Vue files (the linter); vue-tsc reads the files themselves. */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
