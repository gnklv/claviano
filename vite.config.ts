import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // The built site is served from https://gnklv.github.io/claviano/, not from the domain root.
  // The dev server stays at http://localhost:5173/.
  base: command === 'build' ? '/claviano/' : '/',
  plugins: [vue()],
}));
