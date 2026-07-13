#!/usr/bin/env bash
# 从本机构建并部署到阿里云 ECS 开发环境
# 用法:
#   cp scripts/deploy/dev/deploy.config.example scripts/deploy/dev/deploy.config.local
#   vim scripts/deploy/dev/deploy.config.local
#   npm run deploy:dev
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/deploy.config.local"
RELEASE_DIR="$ROOT_DIR/deploy/dev/release"

cd "$ROOT_DIR"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "请先创建部署配置:"
  echo "  cp scripts/deploy/dev/deploy.config.example scripts/deploy/dev/deploy.config.local"
  exit 1
fi

# shellcheck source=/dev/null
source "$CONFIG_FILE"

: "${DEPLOY_HOST:?请在 deploy.config.local 中设置 DEPLOY_HOST}"
: "${DEPLOY_USER:?请在 deploy.config.local 中设置 DEPLOY_USER}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/lingyi-doc}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
BUILD_LOCALLY="${BUILD_LOCALLY:-true}"
CREATE_DATABASE="${CREATE_DATABASE:-false}"
RUN_INIT="${RUN_INIT:-false}"
RUN_MIGRATE="${RUN_MIGRATE:-false}"
RUN_SEED="${RUN_SEED:-false}"
DESKTOP_DOMAIN="${DESKTOP_DOMAIN:-$DEPLOY_HOST}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-$DEPLOY_HOST}"

# shellcheck source=ssh-helper.sh
source "$SCRIPT_DIR/ssh-helper.sh"
setup_deploy_ssh

remote() {
  deploy_remote "$@"
}

echo "=== 部署到开发环境 ==="
echo "目标: ${SSH_TARGET}:${DEPLOY_PATH}"
echo "C 端域名: ${DESKTOP_DOMAIN}"
echo "管理端路径: /admin"
echo ""

if [[ "$BUILD_LOCALLY" == "true" ]]; then
  echo ">>> 本地构建并组装部署包..."
  bash "$ROOT_DIR/scripts/build.sh"
elif [[ ! -d "$RELEASE_DIR/desktop" || ! -d "$RELEASE_DIR/server/dist" ]]; then
  echo "错误: 部署包不存在 ($RELEASE_DIR)"
  echo "请先执行: npm run build"
  exit 1
else
  echo ">>> 使用已有部署包（BUILD_LOCALLY=false）"
fi

echo ">>> 同步部署包到 ECS..."
remote "mkdir -p '${DEPLOY_PATH}'"

rsync -az --delete \
  -e "$DEPLOY_RSYNC_SSH" \
  --exclude '.env' \
  "$RELEASE_DIR/" "${SSH_TARGET}:${DEPLOY_PATH}/"

if [[ -f "$ROOT_DIR/deploy/dev/.env" ]]; then
  echo ">>> 同步 deploy/dev/.env ..."
  rsync -az -e "$DEPLOY_RSYNC_SSH" \
    "$ROOT_DIR/deploy/dev/.env" "${SSH_TARGET}:${DEPLOY_PATH}/.env"
fi

echo ">>> 远程安装与重启..."
remote "APP_ROOT='${DEPLOY_PATH}' \
  CREATE_DATABASE='${CREATE_DATABASE}' \
  RUN_INIT='${RUN_INIT}' \
  RUN_MIGRATE='${RUN_MIGRATE}' \
  RUN_SEED='${RUN_SEED}' \
  DESKTOP_DOMAIN='${DESKTOP_DOMAIN}' \
  ADMIN_DOMAIN='${ADMIN_DOMAIN}' \
  bash '${DEPLOY_PATH}/scripts/remote-install.sh'"

echo ""
echo "=== 全部完成 ==="
