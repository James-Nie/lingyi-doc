import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const packages = path.resolve(__dirname, '../../packages');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@lingyi-doc/core-sheet': path.join(packages, 'lingyi-doc-core-sheet/src'),
      '@lingyi-doc/core-types': path.join(packages, 'lingyi-doc-core-types/src'),
      '@lingyi-doc/core-doc': path.join(packages, 'lingyi-doc-core-doc/src'),
      '@lingyi-doc/editor-sheet': path.join(packages, 'lingyi-doc-editor-sheet/src'),
      '@lingyi-doc/editor-shared': path.join(packages, 'lingyi-doc-editor-shared/src'),
    },
  },
  server: {
    port: 5180,
  },
});
