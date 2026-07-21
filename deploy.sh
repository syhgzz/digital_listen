#!/usr/bin/env bash
# 数字听力训练 (K3) 一键部署脚本
#
# 用法: 登录服务器并克隆代码后,在仓库根目录执行:
#   bash deploy.sh
#
# 可选环境变量:
#   DEPLOY_DIR      静态文件目录(默认 /var/www/digital-listen-k3)
#   NGINX_CONF_DIR  nginx 配置目录(默认 /etc/nginx/conf.d)
#   NGINX_CONF_NAME 配置文件名(默认 k3.conf)
#
# 安全约定: 不会修改服务器上已有的文件——
#   - DEPLOY_DIR 已存在且非本脚本创建(无 .k3-deployed 标记)时中止
#   - nginx 配置已存在且不含本应用标记(# app: digital-listen-k3)时中止
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/digital-listen-k3}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx/conf.d}"
NGINX_CONF_NAME="${NGINX_CONF_NAME:-k3.conf}"
APP_MARKER="# app: digital-listen-k3"

log() { echo -e "\033[1;32m[deploy]\033[0m $*"; }
fail() { echo -e "\033[1;31m[deploy] 错误: $*\033[0m" >&2; exit 1; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || fail "缺少命令 $1,请先安装。"; }

need_cmd node
need_cmd npm
need_cmd nginx

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  need_cmd sudo
  SUDO="sudo"
fi

cd "$REPO_DIR"

log "1/5 安装依赖 (npm ci)"
npm ci

log "2/5 下载语音模型到 public/models (已存在则自动跳过)"
npm run setup:models

log "3/5 生产构建"
npm run build

log "4/5 同步静态文件到 $DEPLOY_DIR"
if [[ -d "$DEPLOY_DIR" ]] && [[ -n "$(ls -A "$DEPLOY_DIR" 2>/dev/null)" ]] && [[ ! -f "$DEPLOY_DIR/.k3-deployed" ]]; then
  fail "$DEPLOY_DIR 已存在且不是本脚本创建的目录。为避免覆盖服务器已有文件,请换一个 DEPLOY_DIR 后重试。"
fi
$SUDO mkdir -p "$DEPLOY_DIR"
if command -v rsync >/dev/null 2>&1; then
  $SUDO rsync -a --delete "$REPO_DIR/dist/" "$DEPLOY_DIR/"
else
  # 无 rsync 时先清空再拷贝(该目录已通过上面的归属检查)
  $SUDO find "$DEPLOY_DIR" -mindepth 1 -delete
  $SUDO cp -r "$REPO_DIR/dist/." "$DEPLOY_DIR/"
fi
$SUDO touch "$DEPLOY_DIR/.k3-deployed"
# 确保 nginx 进程可读
$SUDO chmod -R a+rX "$DEPLOY_DIR"

log "5/5 安装 nginx 配置 ($NGINX_CONF_DIR/$NGINX_CONF_NAME) 并重载"
TARGET_CONF="$NGINX_CONF_DIR/$NGINX_CONF_NAME"
if [[ -f "$TARGET_CONF" ]] && ! grep -qF "$APP_MARKER" "$TARGET_CONF"; then
  fail "$TARGET_CONF 已存在且不属于本应用。为避免覆盖服务器已有配置,请检查冲突或换一个 NGINX_CONF_NAME 后重试。"
fi
TMP_CONF="$(mktemp)"
sed "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" "$REPO_DIR/nginx/k3.conf" > "$TMP_CONF"
$SUDO cp "$TMP_CONF" "$TARGET_CONF"
rm -f "$TMP_CONF"
$SUDO nginx -t
if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl reload nginx
else
  $SUDO nginx -s reload
fi

log "部署完成! 访问地址: http://<服务器IP>:53001/"
log "提示: 云服务器请在安全组/防火墙放行 53001 端口。"
