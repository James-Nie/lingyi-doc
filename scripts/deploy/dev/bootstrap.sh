#!/usr/bin/env bash
# 阿里云 ECS 首次初始化（Ubuntu 22.04 / Debian 系）
# 用法: 在 ECS 上执行
#   curl -fsSL <repo>/scripts/deploy/dev/bootstrap.sh | bash
# 或 SSH 后:
#   bash /opt/lingyi-doc/scripts/deploy/dev/bootstrap.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/lingyi-doc}"
NODE_MAJOR="${NODE_MAJOR:-20}"

echo "=== 零一文档 开发环境 — ECS 初始化 ==="
echo "应用目录: $APP_ROOT"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 或 sudo 运行"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "1/7 更新系统包..."
apt-get update -qq
apt-get install -y -qq curl git rsync nginx openssl ca-certificates gnupg lsb-release

echo "2/7 安装 Node.js ${NODE_MAJOR}.x..."
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p "process.versions.node.split('.')[0]")" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
echo "   Node $(node -v), npm $(npm -v)"

echo "3/7 安装 PM2..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

echo "4/7 安装 Docker（可选，dev 部署使用 RDS 时可跳过）..."
if [[ "${INSTALL_DOCKER:-false}" == "true" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "${VERSION_CODENAME:-jammy}") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    systemctl start docker
  fi
else
  echo "   已跳过（dev 推荐阿里云 RDS；本机 MySQL 容器需 INSTALL_DOCKER=true）"
fi

echo "5/7 创建目录..."
mkdir -p "$APP_ROOT"/{logs,data,deploy/dev}
mkdir -p /var/log/lingyi-doc

echo "6/7 配置 Nginx / PM2 开机自启..."
systemctl enable nginx
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "7/7 防火墙提示（如启用 ufw）..."
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  echo "   已放行 22/80/443"
else
  echo "   未检测到 active ufw，请在阿里云安全组放行: 22, 80, (443)"
fi

echo ""
echo "=== ECS 初始化完成 ==="
echo ""
echo "下一步:"
echo "  1. 在本地配置 scripts/deploy/dev/deploy.config.local"
echo "  2. 配置 deploy/dev/.env（DB_HOST 填阿里云 RDS 地址，部署时同步到 $APP_ROOT/.env）"
echo "  3. 在本地执行: npm run deploy:dev"
echo ""
echo "阿里云安全组建议:"
echo "  - 入方向: TCP 22 (SSH), 80 (HTTP), 443 (HTTPS)"
echo "  - MySQL 3306 勿对 0.0.0.0/0 开放"
