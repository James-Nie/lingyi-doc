#!/usr/bin/env bash
# 将各工程构建产物组装为可部署包：deploy/dev/release/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RELEASE_DIR="$ROOT_DIR/deploy/dev/release"

DESKTOP_DIST="$ROOT_DIR/packages/lingyi-doc-web/dist"
ADMIN_DIST="$ROOT_DIR/packages/lingyi-doc-admin/dist"
SERVER_DIST="$ROOT_DIR/packages/lingyi-doc-server/dist"

for label_path in \
  "C 端@$DESKTOP_DIST" \
  "管理端@$ADMIN_DIST" \
  "API@$SERVER_DIST"; do
  label="${label_path%%@*}"
  dir="${label_path#*@}"
  if [[ ! -d "$dir" ]]; then
    echo "错误: ${label} 构建产物不存在 ($dir)，请先完成构建"
    exit 1
  fi
done

echo ">>> 组装部署包: deploy/dev/release/"

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"/{desktop,admin,server/scripts/migrations,scripts,logs}

rsync -a --delete "$DESKTOP_DIST/" "$RELEASE_DIR/desktop/"
rsync -a --delete "$ADMIN_DIST/" "$RELEASE_DIR/admin/"
rsync -a --delete "$SERVER_DIST/" "$RELEASE_DIR/server/dist/"
cp "$ROOT_DIR/packages/lingyi-doc-server/package.json" "$RELEASE_DIR/server/"
cp "$ROOT_DIR/packages/lingyi-doc-server/scripts/init-db-mysql.sql" "$RELEASE_DIR/server/scripts/"
rsync -a "$ROOT_DIR/packages/lingyi-doc-server/scripts/migrations/" "$RELEASE_DIR/server/scripts/migrations/"

# 打包 workspace 依赖 @lingyi-doc/license，供远端 npm install / Docker from-release 使用
if [[ ! -d "$ROOT_DIR/packages/lingyi-doc-license/dist" ]]; then
  echo "错误: 缺少 @lingyi-doc/license dist，请先 npm -w @lingyi-doc/license run build"
  exit 1
fi
mkdir -p "$RELEASE_DIR/server/vendor/lingyi-doc-license/dist"
cp "$ROOT_DIR/packages/lingyi-doc-license/package.json" "$RELEASE_DIR/server/vendor/lingyi-doc-license/"
rsync -a --delete "$ROOT_DIR/packages/lingyi-doc-license/dist/" "$RELEASE_DIR/server/vendor/lingyi-doc-license/dist/"
node -e "
const fs = require('fs');
const p = process.argv[1];
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.dependencies = j.dependencies || {};
j.dependencies['@lingyi-doc/license'] = 'file:./vendor/lingyi-doc-license';
delete j.devDependencies;
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
" "$RELEASE_DIR/server/package.json"

# 校验数据库相关产物已打入部署包
REQUIRED_DB_JS=(checkConnection createDatabase init migrate seed adminSeed)
for name in "${REQUIRED_DB_JS[@]}"; do
  if [[ ! -f "$RELEASE_DIR/server/dist/db-cli/${name}.js" ]]; then
    echo "错误: 缺少 server/dist/db-cli/${name}.js，请先执行 npm -w @lingyi-doc/server run build"
    exit 1
  fi
done
if [[ ! -f "$RELEASE_DIR/server/dist/main.js" ]]; then
  echo "错误: 缺少 server/dist/main.js，请先执行 npm -w @lingyi-doc/server run build"
  exit 1
fi
for sql_path in \
  "$RELEASE_DIR/server/scripts/init-db-mysql.sql" \
  "$RELEASE_DIR/server/scripts/migrations"; do
  if [[ ! -e "$sql_path" ]]; then
    echo "错误: 缺少 $sql_path"
    exit 1
  fi
done

cp "$ROOT_DIR/deploy/dev/nginx.conf.template" "$RELEASE_DIR/"
cp "$ROOT_DIR/deploy/dev/ecosystem.config.cjs" "$RELEASE_DIR/"
cp "$ROOT_DIR/deploy/dev/.env.example" "$RELEASE_DIR/.env.example"

cp "$SCRIPT_DIR/remote-install.sh" "$RELEASE_DIR/scripts/"
cp "$SCRIPT_DIR/render-nginx.sh" "$RELEASE_DIR/scripts/"
chmod +x "$RELEASE_DIR/scripts/"*.sh

echo "   desktop/  — C 端静态资源"
echo "   admin/    — 管理端静态资源"
echo "   server/   — API 服务 (NestJS dist + package.json + scripts)"
echo "   server/dist/main.js — API 入口"
echo "   server/dist/db-cli/ — createDatabase, migrate, seed, adminSeed"
echo "   server/scripts/     — init-db-mysql.sql + migrations/"
echo "   server/vendor/lingyi-doc-license — 授权库（file: 依赖）"
echo "   scripts/  — 远程安装脚本"
