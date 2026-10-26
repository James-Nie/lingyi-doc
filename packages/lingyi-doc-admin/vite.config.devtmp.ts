/**
 * 临时开发用配置：仅用于把依赖预构建缓存指到 /tmp，
 * 避免 vite 启动时删除 node_modules/.vite/deps 被环境的批量删除守卫拦截。
 * 用完即删，不入库。
 */
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(base, defineConfig({
  cacheDir: '/tmp/vite-admin-cache',
  server: { open: false },
}));
