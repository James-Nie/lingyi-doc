#!/usr/bin/env bash
# 渲染 Nginx 配置（兼容 Debian sites-available 与 RHEL/Aliyun conf.d）
set -euo pipefail

APP_ROOT="${1:?APP_ROOT required}"
DESKTOP_DOMAIN="${2:?DESKTOP_DOMAIN required}"
ADMIN_DOMAIN="${3:?ADMIN_DOMAIN required}"

ADMIN_PORT=80
if [[ "$DESKTOP_DOMAIN" == "$ADMIN_DOMAIN" ]]; then
  ADMIN_PORT=8080
fi

TEMPLATE="$APP_ROOT/nginx.conf.template"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "找不到模板: $TEMPLATE"
  exit 1
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
  -e "s|__ADMIN_DOMAIN__|${ADMIN_DOMAIN}|g" \
  -e "s|__ADMIN_PORT__|${ADMIN_PORT}|g" \
  "$TEMPLATE" > "$OUTPUT"

if [[ -n "$ENABLE_LINK" ]]; then
  mkdir -p /etc/nginx/sites-enabled
  ln -sf "$OUTPUT" "$ENABLE_LINK"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
fi

# RHEL 默认配置可能占用 80 端口，禁用 conf.d 下的 default.conf
if [[ -f /etc/nginx/conf.d/default.conf ]]; then
  mv -f /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true
fi

nginx -t
systemctl reload nginx

echo "Nginx 已更新: $OUTPUT"
echo "  C 端: http://${DESKTOP_DOMAIN}"
if [[ "$ADMIN_PORT" == "8080" ]]; then
  echo "  管理端: http://${ADMIN_DOMAIN}:8080"
else
  echo "  管理端: http://${ADMIN_DOMAIN}"
fi
