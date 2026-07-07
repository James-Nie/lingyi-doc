/**
 * tsc + moduleResolution:bundler 不会为相对路径添加 .js 后缀，
 * Node ESM 运行时需要显式扩展名。构建后批量修补 dist 中的 import/export。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../dist');

const RELATIVE_SPEC = /^(?:\.\.?\/)/;

function patchSpec(spec) {
  if (!RELATIVE_SPEC.test(spec) || spec.endsWith('.js')) return spec;
  return `${spec}.js`;
}

function patchSource(code) {
  return code.replace(
    /(\bfrom\s+['"])([^'"]+)(['"])/g,
    (_, prefix, spec, suffix) => `${prefix}${patchSpec(spec)}${suffix}`,
  ).replace(
    /(\bexport\s+\*\s+from\s+['"])([^'"]+)(['"])/g,
    (_, prefix, spec, suffix) => `${prefix}${patchSpec(spec)}${suffix}`,
  );
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    const original = fs.readFileSync(fullPath, 'utf8');
    const patched = patchSource(original);
    if (patched !== original) {
      fs.writeFileSync(fullPath, patched);
    }
  }
}

if (!fs.existsSync(distDir)) {
  console.error('dist 目录不存在，请先运行 tsc');
  process.exit(1);
}

walk(distDir);
console.log('已修补 dist 中的 ESM 相对路径导入');
