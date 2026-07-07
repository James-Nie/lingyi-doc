#!/usr/bin/env bash
# SSH 包装：优先 sshpass，否则 expect
set -euo pipefail

if [[ -n "${DEPLOY_SSH_PASSWORD:-}" ]]; then
  if command -v sshpass >/dev/null 2>&1; then
    export SSHPASS="$DEPLOY_SSH_PASSWORD"
    exec sshpass -e ssh "$@"
  fi
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  export DEPLOY_SSH_PASSWORD
  exec expect "$SCRIPT_DIR/ssh-password.exp" ssh "$@"
fi

exec ssh "$@"
