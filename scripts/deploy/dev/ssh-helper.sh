#!/usr/bin/env bash
# 由 deploy.config.local 初始化 SSH / rsync 命令（source 后使用）
# 依赖变量: DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_PORT, DEPLOY_SSH_KEY?, DEPLOY_SSH_PASSWORD?

setup_deploy_ssh() {
  : "${DEPLOY_HOST:?}"
  : "${DEPLOY_USER:?}"
  DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  SSH_WRAP="$SCRIPT_DIR/ssh-with-password.sh"

  SSH_OPTS=(-p "$DEPLOY_SSH_PORT" -o StrictHostKeyChecking=accept-new)
  if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
    SSH_OPTS=(-p "$DEPLOY_SSH_PORT" -i "$DEPLOY_SSH_KEY" -o StrictHostKeyChecking=accept-new)
  fi

  SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

  export DEPLOY_SSH_PASSWORD="${DEPLOY_SSH_PASSWORD:-}"
  DEPLOY_SSH_CMD=("$SSH_WRAP" "${SSH_OPTS[@]}")
  if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
    DEPLOY_RSYNC_SSH="$SSH_WRAP -p ${DEPLOY_SSH_PORT} -i ${DEPLOY_SSH_KEY} -o StrictHostKeyChecking=accept-new"
  else
    DEPLOY_RSYNC_SSH="$SSH_WRAP -p ${DEPLOY_SSH_PORT} -o StrictHostKeyChecking=accept-new"
  fi
}

deploy_remote() {
  "${DEPLOY_SSH_CMD[@]}" "$SSH_TARGET" "$@"
}
