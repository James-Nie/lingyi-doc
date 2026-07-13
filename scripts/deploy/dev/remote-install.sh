#!/usr/bin/env bash
# 在 ECS 上执行的安装/更新步骤（由 deploy.sh 通过 SSH 调用）
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/lingyi-doc}"
SERVER_DIR="$APP_ROOT/server"
DB_DIST="$SERVER_DIR/dist/db-cli"
CREATE_DATABASE="${CREATE_DATABASE:-false}"
RUN_INIT="${RUN_INIT:-false}"
RUN_MIGRATE="${RUN_MIGRATE:-false}"
RUN_SEED="${RUN_SEED:-false}"
DESKTOP_DOMAIN="${DESKTOP_DOMAIN:-localhost}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-localhost}"

run_db_script() {
  local script_name="$1"
  local script_path="$DB_DIST/${script_name}.js"
  if [[ ! -f "$script_path" ]]; then
    echo "错误: 缺少数据库脚本 $script_path（请重新构建并部署）"
    exit 1
  fi
  node "$script_path"
}

cd "$APP_ROOT"

echo "=== 远程安装/更新 ==="
echo "目录: $APP_ROOT"

ENV_FILE="$APP_ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$APP_ROOT/.env.example" ]]; then
    cp "$APP_ROOT/.env.example" "$ENV_FILE"
    echo "已从 .env.example 创建 $ENV_FILE，请修改后重新部署"
    exit 1
  fi
  echo "错误: 缺少 $ENV_FILE"
  exit 1
fi

ln -sf "$ENV_FILE" "$SERVER_DIR/.env"

echo "1/4 安装 API 生产依赖..."
cd "$SERVER_DIR"
npm install --omit=dev

run_db_check() {
  run_db_script checkConnection
}

echo "2/4 数据库准备..."
if [[ "$CREATE_DATABASE" == "true" || "$RUN_INIT" == "true" || "$RUN_MIGRATE" == "true" || "$RUN_SEED" == "true" ]]; then
  run_db_check
fi

if [[ "$RUN_INIT" == "true" || "$CREATE_DATABASE" == "true" ]]; then
  run_db_script init
else
  echo "   跳过数据库初始化（RUN_INIT=false）"
fi

if [[ "$RUN_MIGRATE" == "true" ]]; then
  run_db_script migrate
else
  echo "   跳过数据库迁移（RUN_MIGRATE=false）"
fi

if [[ "$RUN_SEED" == "true" ]]; then
  echo "3/4 初始化种子数据..."
  run_db_script seed || true
  run_db_script adminSeed || true
else
  echo "3/4 跳过种子数据（RUN_SEED=false）"
fi

echo "4/4 配置 Nginx 并启动 API..."
cd "$APP_ROOT"
bash "$APP_ROOT/scripts/render-nginx.sh" "$APP_ROOT" "$DESKTOP_DOMAIN" "$ADMIN_DOMAIN"

mkdir -p "$APP_ROOT/logs"
mkdir -p "$SERVER_DIR/data/snapshots"

cd "$APP_ROOT"
pm2 delete pm2.ecosystem 2>/dev/null || true

if pm2 describe lingyi-doc-server >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo ""
echo "=== 部署完成 ==="
curl -sf "http://127.0.0.1:3000/api/v1/health" | head -c 200 || echo "健康检查待 API 就绪后访问"
echo ""
echo "C 端 HTTP:  http://${DESKTOP_DOMAIN}"
if [[ "${ENABLE_SSL:-true}" == "true" ]]; then
  echo "C 端 HTTPS: https://${DESKTOP_DOMAIN}  (开发自签名证书，浏览器需信任)"
fi
echo "管理端:   http://${DESKTOP_DOMAIN}/admin/"
if [[ "${ENABLE_SSL:-true}" == "true" ]]; then
  echo "管理端 HTTPS: https://${DESKTOP_DOMAIN}/admin/"
fi
echo "健康检查: http://${DESKTOP_DOMAIN}/api/v1/health"
