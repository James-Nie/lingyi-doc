#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== 零一文档 · 智能云文档 — 项目初始化 ==="

echo "1. 安装 Node.js 依赖..."
npm install

echo "2. 启动基础设施（Docker）..."
docker-compose up -d

echo "3. 等待 PostgreSQL 就绪..."
until docker-compose exec -T postgres pg_isready -U lingyi_doc_dev -d lingyi_doc_db 2>/dev/null; do
  echo "   等待中..."
  sleep 2
done
echo "   PostgreSQL 已就绪"

echo "4. 等待 Redis 就绪..."
until docker-compose exec -T redis redis-cli ping 2>/dev/null; do
  sleep 1
done
echo "   Redis 已就绪"

echo ""
echo "=== 依赖安装完成 ==="
echo ""
echo "MySQL 首次初始化:  npm run db:init && npm run db:seed && npm run admin:seed"
echo "MySQL 已有库升级:  npm run db:migrate"
echo "启动前端:          npm run dev"
echo "启动后端:          npm run server"
