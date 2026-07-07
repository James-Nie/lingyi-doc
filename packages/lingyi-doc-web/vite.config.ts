import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** 生产构建注入 VITE_SITE_URL；未配置时移除依赖绝对 URL 的 meta，避免占位符泄漏 */
function siteUrlHtmlPlugin(): Plugin {
  return {
    name: 'html-site-url',
    transformIndexHtml(html) {
      const siteUrl = process.env.VITE_SITE_URL?.replace(/\/$/, '') || '';
      if (!siteUrl) {
        return html
          .replace(/\n\s*<link rel="canonical"[^>]*>/g, '')
          .replace(/\n\s*<meta property="og:url"[^>]*>/g, '')
          .replace(/\n\s*<meta property="og:image"[^>]*>/g, '')
          .replace(/\n\s*<meta property="og:image:width"[^>]*>/g, '')
          .replace(/\n\s*<meta property="og:image:height"[^>]*>/g, '')
          .replace(/\n\s*<meta property="og:image:alt"[^>]*>/g, '')
          .replace(/\n\s*<meta name="twitter:image"[^>]*>/g, '')
          .replace(/\n\s*<meta name="twitter:image:alt"[^>]*>/g, '');
      }
      return html.replaceAll('%VITE_SITE_URL%', siteUrl);
    },
  };
}

export default defineConfig({
  plugins: [react(), siteUrlHtmlPlugin()],
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
    port: 5173,
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
