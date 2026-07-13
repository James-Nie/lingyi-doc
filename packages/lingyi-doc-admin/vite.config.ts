import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: {
    alias: {
      '@lingyi-doc/core': path.resolve(__dirname, '../lingyi-doc-core/src'),
      '@lingyi-doc/editor': path.resolve(__dirname, '../lingyi-doc-editor/src'),
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
