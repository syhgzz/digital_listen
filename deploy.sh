#!/usr/bin/env bash
#
# 数字听力训练（digital_listen）— 一键部署脚本
#
# 在服务器上的项目目录中执行（默认部署到 /var/www/digital_listen_dsh41f，端口 53002）：
#   sudo ./deploy.sh
#
# 常用选项：
#   ./deploy.sh --skip-install      跳过 npm ci
#   ./deploy.sh --skip-build        跳过构建，直接发布已有 dist/
#   ./deploy.sh --no-nginx          只发布文件，不改 nginx
#   ./deploy.sh --pull              部署前先 git pull --ff-only
#   ./deploy.sh --web-root /srv/www/site --port 8080
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------- 默认配置 ---
WEB_ROOT="${WEB_ROOT:-/var/www/digital_listen_dsh41f}"
CONF_DIR="${CONF_DIR:-/etc/nginx/conf.d}"
PORT="${PORT:-53002}"
SERVICE_NAME="${SERVICE_NAME:-nginx}"
CONF_NAME="digital-listen.conf"

SKIP_INSTALL=0
SKIP_TTS=0
SKIP_BUILD=0
NO_NGINX=0
FORCE_TTS=0
DO_PULL=0

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die() {
  printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  cat <<'EOF'
可用选项：
  --web-root <路径>   部署目录（默认 /var/www/digital_listen_dsh41f）
  --port <端口>       nginx 监听端口（默认 53002）
  --conf-dir <路径>   nginx 配置目录（默认 /etc/nginx/conf.d）
  --skip-install      跳过 npm ci / npm install
  --skip-tts          跳过语音资源准备
  --force-tts         强制重新下载语音模型
  --skip-build        跳过构建，直接发布现有 dist/
  --no-nginx          不安装/重载 nginx 配置
  --pull              部署前执行 git pull --ff-only
  -h, --help          显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web-root)
      WEB_ROOT="${2:?--web-root 需要路径}"
      shift 2
      ;;
    --port)
      PORT="${2:?--port 需要端口号}"
      shift 2
      ;;
    --conf-dir)
      CONF_DIR="${2:?--conf-dir 需要路径}"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --skip-tts)
      SKIP_TTS=1
      shift
      ;;
    --force-tts)
      FORCE_TTS=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --no-nginx)
      NO_NGINX=1
      shift
      ;;
    --pull)
      DO_PULL=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "未知选项：$1（用 --help 查看用法）"
      ;;
  esac
done

# ------------------------------------------------------------------ 前置检查 ---
if [[ -z "$WEB_ROOT" || "$WEB_ROOT" == "/" ]]; then
  die "WEB_ROOT 不合法：'$WEB_ROOT'（拒绝在根目录执行 --delete 同步）"
fi

if [[ "$EUID" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
  command -v sudo >/dev/null 2>&1 || die "缺少命令：sudo（请用 root 运行或安装 sudo）"
fi

for cmd in node npm rsync; do
  command -v "$cmd" >/dev/null 2>&1 || die "缺少命令：$cmd"
done

if [[ "$NO_NGINX" -eq 0 ]]; then
  command -v nginx >/dev/null 2>&1 || die "缺少命令：nginx（或用 --no-nginx 跳过）"
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  warn "检测到 Node ${NODE_MAJOR}，Vite 8 需要 Node 20.19+ / 22.12+，构建可能失败"
fi

log "项目目录：$SCRIPT_DIR"
log "部署目录：$WEB_ROOT"
log "nginx 端口：$PORT"

# ---------------------------------------------------------------- 1. 拉取代码 ---
if [[ "$DO_PULL" -eq 1 ]]; then
  if [[ -d .git ]]; then
    log "拉取最新代码"
    git pull --ff-only
  else
    warn "当前目录不是 git 仓库，跳过 --pull"
  fi
fi

# ---------------------------------------------------------------- 2. 安装依赖 ---
if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  if [[ -f package-lock.json ]]; then
    log "安装依赖（npm ci）"
    npm ci
  else
    log "安装依赖（npm install）"
    npm install
  fi
else
  log "跳过依赖安装"
fi

# ------------------------------------------------------------ 3. 语音资源准备 ---
if [[ "$SKIP_TTS" -eq 0 ]]; then
  if [[ "$FORCE_TTS" -eq 1 ]] || ! compgen -G "public/tts/voices/*.onnx" >/dev/null; then
    log "准备本地语音资源（约 60MB，只需一次）"
    npm run tts:setup
  else
    log "语音资源已存在，跳过（--force-tts 可强制重新下载）"
  fi
else
  log "跳过语音资源准备"
fi

# ------------------------------------------------------------------ 4. 构建 ---
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "构建生产包"
  npm run build
fi

if [[ ! -d dist || ! -f dist/index.html ]]; then
  die "未找到可发布的 dist/（请先执行 npm run build）"
fi

# ------------------------------------------------------------------ 5. 发布 ---
log "同步到 $WEB_ROOT"
$SUDO mkdir -p "$WEB_ROOT"
$SUDO rsync -a --delete --chmod=D755,F644 dist/ "$WEB_ROOT/"
log "发布完成：$(du -sh "$WEB_ROOT" | cut -f1) 已就位"

# -------------------------------------------------------------- 6. nginx 配置 ---
if [[ "$NO_NGINX" -eq 0 ]]; then
  CONF_SRC="$SCRIPT_DIR/nginx/$CONF_NAME"
  CONF_DST="$CONF_DIR/$CONF_NAME"
  [[ -f "$CONF_SRC" ]] || die "缺少配置文件：$CONF_SRC"

  log "安装 nginx 配置到 $CONF_DST"
  $SUDO mkdir -p "$CONF_DIR"

  # 让配置里的 root / listen 与实际参数保持一致（仅替换生效的指令行，不动注释）
  TMP_CONF="$(mktemp)"
  trap 'rm -f "$TMP_CONF"' EXIT
  sed -E \
    -e "s#^([[:space:]]*root[[:space:]]+)[^;]+;#\1$WEB_ROOT;#" \
    -e "s#^([[:space:]]*listen[[:space:]]+)[0-9]+;#\1$PORT;#" \
    "$CONF_SRC" >"$TMP_CONF"

  BACKUP=""
  if [[ -f "$CONF_DST" ]]; then
    BACKUP="$CONF_DST.bak.$(date +%Y%m%d%H%M%S)"
    $SUDO cp -a "$CONF_DST" "$BACKUP"
    log "已备份原配置：$BACKUP"
  fi

  $SUDO install -m 644 "$TMP_CONF" "$CONF_DST"

  if ! $SUDO nginx -t; then
    if [[ -n "$BACKUP" ]]; then
      $SUDO cp -a "$BACKUP" "$CONF_DST"
      warn "nginx 配置校验失败，已回滚到 $BACKUP"
    else
      $SUDO rm -f "$CONF_DST"
      warn "nginx 配置校验失败，已删除新配置"
    fi
    die "nginx 配置校验失败，未重载服务"
  fi

  if $SUDO systemctl reload "$SERVICE_NAME" >/dev/null 2>&1; then
    log "nginx 已重载（systemctl reload $SERVICE_NAME）"
  elif $SUDO nginx -s reload; then
    log "nginx 已重载（nginx -s reload）"
  else
    die "nginx 重载失败，请手动检查"
  fi
else
  log "跳过 nginx 配置"
fi

# ------------------------------------------------------------------ 7. 自检提示 ---
cat <<EOF

部署完成
  静态目录：$WEB_ROOT
  访问地址：http://<服务器地址>:$PORT/
  日志：/var/log/nginx/digital_listen.access.log / .error.log

建议自检：
  curl -I http://127.0.0.1:$PORT/                           # 期望 200 text/html
  curl -I http://127.0.0.1:$PORT/tts/voices/manifest.json   # 期望 200 application/json
  curl -I http://127.0.0.1:$PORT/tts/voices/none.onnx       # 期望 404（不能是 200）
EOF
