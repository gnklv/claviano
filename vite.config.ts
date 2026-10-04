import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  // The built site is served from https://gnklv.github.io/claviano/, not from the domain root
  // (and so is its preview, at http://localhost:4173/claviano/).
  // The dev server stays at http://localhost:5173/.
  base: command === 'build' || isPreview ? '/claviano/' : '/',
  plugins: [vue()],
}));
