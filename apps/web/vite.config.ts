// Vite build/dev configuration for the web app, plus the Vitest test config (Vitest reads its
// settings from the `test` key of this same file). Three things live here: the React plugin (JSX,
// fast refresh), the Tailwind plugin (turns `@import "tailwindcss"` in index.css into real CSS),
// and a dev-server proxy so calls to `/api/...` reach the backend at localhost:3000 without the
// browser treating them as cross-origin. Nothing here changes at runtime; it only affects `npm run
// dev`, `npm run build`, and `npm run test`.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
