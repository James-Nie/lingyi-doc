import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const packages = path.resolve(__dirname, '../../packages');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@lingyi-doc/core-whiteboard': path.join(packages, 'lingyi-doc-core-whiteboard/src'),
      '@lingyi-doc/core-types': path.join(packages, 'lingyi-doc-core-types/src'),
      '@lingyi-doc/core-mindmap': path.join(packages, 'lingyi-doc-core-mindmap/src'),
      '@lingyi-doc/core-doc': path.join(packages, 'lingyi-doc-core-doc/src'),
      '@lingyi-doc/editor-whiteboard': path.join(packages, 'lingyi-doc-editor-whiteboard/src'),
      '@lingyi-doc/editor-shared': path.join(packages, 'lingyi-doc-editor-shared/src'),
      '@lingyi-doc/mind-map': path.join(packages, 'lingyi-doc-mind-map/src'),
      '@lingyi-doc/mind-map-react': path.join(packages, 'lingyi-doc-mind-map-react/src'),
    },
  },
  server: {
    port: 5181,
  },
});
