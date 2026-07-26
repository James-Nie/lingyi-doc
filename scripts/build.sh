#!/usr/bin/env bash
# 生产/预发构建：编译各工程并组装 deploy/dev/release 部署包
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== 零一文档 构建 ==="
echo "项目目录: $ROOT_DIR"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "错误: 未找到 Node.js，请安装 Node >= 18"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "错误: 需要 Node >= 18，当前 $(node -v)"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "1/10 安装依赖..."
  npm install
else
  echo "1/10 依赖已存在，跳过 npm install"
fi

echo "2/4 按依赖拓扑顺序构建全部 @lingyi-doc/* 包..."
node "$ROOT_DIR/scripts/build-packages.mjs"

echo "3/4 校验 OSS 依赖边界..."
bash "$ROOT_DIR/scripts/check-oss-boundary.sh"

echo "4/4 组装部署包..."
bash "$ROOT_DIR/scripts/deploy/dev/assemble-release.sh"

echo ""
echo "=== 构建完成 ==="
echo "  部署包: deploy/dev/release/"
echo "    web/      — C 端静态资源"
echo "    admin/    — 管理端静态资源"
echo "    server/   — API 服务"
