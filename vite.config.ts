import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// base depends on the deploy target:
//  - pages    → '/ApexFinance/' (GitHub Pages repo subpath)
//  - electron → './'            (relative, so assets load over file://)
//  - default  → '/'             (local dev server)
const base =
  process.env.DEPLOY_TARGET === 'pages' ? '/ApexFinance/'
  : process.env.DEPLOY_TARGET === 'electron' ? './'
  : '/';

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
