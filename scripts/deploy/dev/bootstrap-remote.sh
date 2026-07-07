#!/usr/bin/env bash
# 通过 SSH 在阿里云 ECS 上执行首次 bootstrap
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/deploy.config.local"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "请先创建: cp scripts/deploy/dev/deploy.config.example scripts/deploy/dev/deploy.config.local"
  exit 1
fi

# shellcheck source=/dev/null
source "$CONFIG_FILE"

: "${DEPLOY_HOST:?}"
: "${DEPLOY_USER:?}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/lingyi-doc}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"

# shellcheck source=ssh-helper.sh
source "$SCRIPT_DIR/ssh-helper.sh"
setup_deploy_ssh

echo ">>> 在 ${DEPLOY_USER}@${DEPLOY_HOST} 执行 ECS 初始化..."
deploy_remote "APP_ROOT='${DEPLOY_PATH}' bash -s" < "$SCRIPT_DIR/bootstrap.sh"

echo ""
echo "初始化完成。请配置 deploy/dev/.env 后执行: npm run deploy:dev"
