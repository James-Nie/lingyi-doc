#!/usr/bin/env bash
# 渲染 Nginx 配置（兼容 Debian sites-available 与 RHEL/Aliyun conf.d）
set -euo pipefail

APP_ROOT="${1:?APP_ROOT required}"
DESKTOP_DOMAIN="${2:?DESKTOP_DOMAIN required}"
ADMIN_DOMAIN="${3:?ADMIN_DOMAIN required}"

TEMPLATE="$APP_ROOT/nginx.conf.template"
SSL_CERT="${SSL_CERT:-/ssl/cert.pem}"
SSL_KEY="${SSL_KEY:-/ssl/cert.key}"
SSL_CHAIN="${SSL_CHAIN:-/ssl/cert.cer}"
ENABLE_SSL="${ENABLE_SSL:-true}"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "找不到模板: $TEMPLATE"
  exit 1
fi

assert_ssl_files() {
  local cert="$1"
  local key="$2"
  local chain="$3"
  local missing=0

  if [[ ! -f "$cert" ]]; then
    echo "错误: 缺少 SSL 证书 $cert"
    missing=1
  fi
  if [[ ! -f "$key" ]]; then
    echo "错误: 缺少 SSL 私钥 $key"
    missing=1
  fi
  if [[ ! -f "$chain" ]]; then
    echo "提示: 未找到链证书 $chain（可选，用于 ssl_trusted_certificate）"
  fi

  if [[ "$missing" -ne 0 ]]; then
    echo "请将证书放到 dev 服务器:"
    echo "  /ssl/cert.pem"
    echo "  /ssl/cert.key"
    echo "  /ssl/cert.cer  (可选)"
    exit 1
  fi

  echo "使用 SSL 证书: $cert"
  echo "使用 SSL 私钥: $key"
  if [[ -f "$chain" ]]; then
    echo "使用链证书: $chain"
  fi
}

SSL_CHAIN_LINE=""
if [[ "$ENABLE_SSL" == "true" ]]; then
  assert_ssl_files "$SSL_CERT" "$SSL_KEY" "$SSL_CHAIN"
  if [[ -f "$SSL_CHAIN" ]]; then
    SSL_CHAIN_LINE="    ssl_trusted_certificate ${SSL_CHAIN};"
  fi
else
  echo "ENABLE_SSL=false，跳过 443 配置"
fi

# Debian/Ubuntu: sites-available + sites-enabled
# RHEL / Alibaba Cloud Linux: conf.d/*.conf
if [[ -d /etc/nginx/sites-available ]]; then
  OUTPUT="/etc/nginx/sites-available/sheet-dev"
  ENABLE_LINK="/etc/nginx/sites-enabled/sheet-dev"
else
  OUTPUT="/etc/nginx/conf.d/sheet-dev.conf"
  ENABLE_LINK=""
fi

mkdir -p "$(dirname "$OUTPUT")"

sed \
  -e "s|__APP_ROOT__|${APP_ROOT}|g" \
  -e "s|__DESKTOP_DOMAIN__|${DESKTOP_DOMAIN}|g" \
  -e "s|__SSL_CERT__|${SSL_CERT}|g" \
  -e "s|__SSL_KEY__|${SSL_KEY}|g" \
  -e "s|__SSL_CHAIN_LINE__|${SSL_CHAIN_LINE}|g" \
  "$TEMPLATE" > "$OUTPUT"

if [[ "$ENABLE_SSL" != "true" ]]; then
  sed -i.bak '/# __SSL_SERVER_BEGIN__/,/# __SSL_SERVER_END__/d' "$OUTPUT"
  rm -f "${OUTPUT}.bak"
fi

if [[ -n "$ENABLE_LINK" ]]; then
  mkdir -p /etc/nginx/sites-enabled
  ln -sf "$OUTPUT" "$ENABLE_LINK"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
fi

# RHEL 默认配置可能占用 80 端口，禁用 conf.d 下的 default.conf
if [[ -f /etc/nginx/conf.d/default.conf ]]; then
  mv -f /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true
fi

reload_or_start_nginx() {
  if ! nginx -t; then
    echo "错误: Nginx 配置校验失败，请根据上方 nginx -t 输出修复"
    exit 1
  fi

  local pid_file=""
  for f in /run/nginx.pid /var/run/nginx.pid; do
    if [[ -f "$f" ]]; then
      pid_file="$f"
      break
    fi
  done

  if systemctl is-active --quiet nginx 2>/dev/null && [[ -n "$pid_file" ]]; then
    if systemctl reload nginx 2>/dev/null; then
      echo "Nginx 已 reload"
      return 0
    fi
    echo "reload 失败，尝试 restart..."
    systemctl restart nginx
    echo "Nginx 已 restart"
    return 0
  fi

  echo "Nginx 未运行或 pid 丢失，正在启动..."
  systemctl reset-failed nginx 2>/dev/null || true
  systemctl enable nginx 2>/dev/null || true

  if systemctl start nginx; then
    echo "Nginx 已启动"
    return 0
  fi

  echo "systemctl start 失败，尝试 nginx 直接启动..."
  if nginx; then
    echo "Nginx 已启动 (nginx)"
    return 0
  fi

  echo ""
  echo "错误: Nginx 启动失败。常见原因:"
  echo "  1. SSL 证书路径不正确: /ssl/cert.pem /ssl/cert.key"
  echo "  2. 80/443 端口被占用"
  echo "  3. 配置语法错误"
  echo ""
  systemctl status nginx --no-pager 2>/dev/null || true
  journalctl -u nginx -n 30 --no-pager 2>/dev/null || true
  exit 1
}

reload_or_start_nginx

echo "Nginx 已更新: $OUTPUT"
echo "  C 端 HTTP:  http://${DESKTOP_DOMAIN}"
if [[ "$ENABLE_SSL" == "true" ]]; then
  echo "  C 端 HTTPS: https://${DESKTOP_DOMAIN}"
  echo "  SSL 证书:   ${SSL_CERT}"
  echo "  SSL 私钥:   ${SSL_KEY}"
  if [[ -f "$SSL_CHAIN" ]]; then
    echo "  SSL 链证书: ${SSL_CHAIN}"
  fi
fi
echo "  管理端:   http://${DESKTOP_DOMAIN}/admin/"
if [[ "$ENABLE_SSL" == "true" ]]; then
  echo "  管理端 HTTPS: https://${DESKTOP_DOMAIN}/admin/"
fi
