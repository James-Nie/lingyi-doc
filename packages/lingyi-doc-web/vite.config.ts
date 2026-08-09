import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** 生产构建注入 VITE_SITE_URL；未配置时移除依赖绝对 URL 的 meta，避免占位符泄漏 */
function siteUrlHtmlPlugin(): Plugin {
  return {
    name: 'html-site-url',
    // order:'pre' 关键：必须在 vite 内置 build-html 解析（对属性调 decodeURI）之前
    // 完成占位符替换，否则未定义 VITE_SITE_URL 时 %VITE_SITE_URL% 会触发 URI malformed。
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
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
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), siteUrlHtmlPlugin()],
  define: {
    // react-draggable / react-grid-layout 在浏览器里会读 process.env.*
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.DRAGGABLE_DEBUG': 'undefined',
  },
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
      '@lingyi-doc/editor': path.resolve(__dirname, '../lingyi-doc-editor/src'),
      '@lingyi-doc/editor-pro': path.resolve(__dirname, '../lingyi-doc-editor-pro/src'),
      '@lingyi-doc/editor-shared': path.resolve(__dirname, '../lingyi-doc-editor-shared/src'),
      '@lingyi-doc/editor-doc': path.resolve(__dirname, '../lingyi-doc-editor-doc/src'),
      '@lingyi-doc/editor-mindmap': path.resolve(__dirname, '../lingyi-doc-editor-mindmap/src'),
      '@lingyi-doc/editor-whiteboard': path.resolve(__dirname, '../lingyi-doc-editor-whiteboard/src'),
      '@lingyi-doc/editor-sheet': path.resolve(__dirname, '../lingyi-doc-editor-sheet/src'),
      '@lingyi-doc/ai-ui': path.resolve(__dirname, '../lingyi-doc-ai-ui/src'),
      '@lingyi-doc/mind-map': path.resolve(__dirname, '../lingyi-doc-mind-map/src'),
      '@lingyi-doc/mind-map-react': path.resolve(__dirname, '../lingyi-doc-mind-map-react/src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'antd',
      '@ant-design/icons',
      'dayjs',
      'mammoth',
      'react-grid-layout',
      'react-draggable',
      'react-resizable',
    ],
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
        ws: true,
      },
    },
  },
}));
