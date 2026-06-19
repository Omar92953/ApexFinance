import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// base must match the GitHub Pages repo subpath for production.
// Use '/' for local dev / Electron, '/ApexFinance/' for GitHub Pages.
const base = process.env.DEPLOY_TARGET === 'pages' ? '/ApexFinance/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
