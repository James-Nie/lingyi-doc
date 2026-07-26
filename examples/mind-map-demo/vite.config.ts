import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const packages = path.resolve(__dirname, '../../packages');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@lingyi-doc/core-mindmap': path.join(packages, 'lingyi-doc-core-mindmap/src'),
      '@lingyi-doc/mind-map': path.join(packages, 'lingyi-doc-mind-map/src'),
      '@lingyi-doc/mind-map-react': path.join(packages, 'lingyi-doc-mind-map-react/src'),
    },
  },
  server: {
    port: 5179,
  },
});
