import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@lingyi-doc/core': path.resolve(__dirname, '../lingyi-doc-core/src'),
      '@lingyi-doc/editor': path.resolve(__dirname, '../lingyi-doc-editor/src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['antd', '@ant-design/icons', 'dayjs', 'simple-mind-map', 'mammoth'],
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
