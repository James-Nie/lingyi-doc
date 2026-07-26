import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: {
    alias: {
      '@lingyi-doc/core': path.resolve(__dirname, '../lingyi-doc-core/src'),
      '@lingyi-doc/core-types': path.resolve(__dirname, '../lingyi-doc-core-types/src'),
      '@lingyi-doc/core-sheet': path.resolve(__dirname, '../lingyi-doc-core-sheet/src'),
      '@lingyi-doc/core-doc': path.resolve(__dirname, '../lingyi-doc-core-doc/src'),
      '@lingyi-doc/core-mindmap': path.resolve(__dirname, '../lingyi-doc-core-mindmap/src'),
      '@lingyi-doc/core-whiteboard': path.resolve(__dirname, '../lingyi-doc-core-whiteboard/src'),
      '@lingyi-doc/core-io': path.resolve(__dirname, '../lingyi-doc-core-io/src'),
      '@lingyi-doc/core-collab': path.resolve(__dirname, '../lingyi-doc-core-collab/src'),
      '@lingyi-doc/core-client': path.resolve(__dirname, '../lingyi-doc-core-client/src'),
      '@lingyi-doc/editor-shared': path.resolve(__dirname, '../lingyi-doc-editor-shared/src'),
      '@lingyi-doc/editor-doc': path.resolve(__dirname, '../lingyi-doc-editor-doc/src'),
      '@lingyi-doc/editor-mindmap': path.resolve(__dirname, '../lingyi-doc-editor-mindmap/src'),
      '@lingyi-doc/editor-whiteboard': path.resolve(__dirname, '../lingyi-doc-editor-whiteboard/src'),
      '@lingyi-doc/editor-sheet': path.resolve(__dirname, '../lingyi-doc-editor-sheet/src'),
      '@lingyi-doc/mind-map': path.resolve(__dirname, '../lingyi-doc-mind-map/src'),
      '@lingyi-doc/mind-map-react': path.resolve(__dirname, '../lingyi-doc-mind-map-react/src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['antd', '@ant-design/icons', 'dayjs', 'mammoth'],
  },
  server: {
    port: 5174,
    open: true,
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
