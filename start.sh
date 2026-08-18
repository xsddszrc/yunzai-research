#!/bin/bash
# =============================================================
# Yunzai 机器人快速启动脚本（Debian 12/13，x86_64 / aarch64）
#
# 用法:
#   bash start.sh              # 启动（已部署过：Redis+NapCat+TRSS）
#   bash start.sh install      # 首次部署（安装依赖+部署+启动）
#   bash start.sh status       # 查看服务状态
#   bash start.sh stop         # 停止全部服务
#
# 首次部署前必须配置的环境变量（或编辑下方 CONFIG）:
#   BOT_QQ        机器人 QQ 号
#   BOT_PASSWORD  机器人 QQ 密码（NapCat 自动登录用）
#   MASTER_QQ     主人 QQ 号
#
# 可自定义:
#   BASE_DIR      安装根目录（默认 /opt/napyunzai）
# =============================================================
set -e

# ---------- 配置区（按需修改） ----------
BOT_QQ="${BOT_QQ:-<机器人QQ>}"
BOT_PASSWORD="${BOT_PASSWORD:-<QQ密码>}"
MASTER_QQ="${MASTER_QQ:-<主人QQ>}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"          # 本仓库目录

# 安装根目录（默认 /opt/napyunzai，不硬编码 /root）
BASE_DIR="${BASE_DIR:-/opt/napyunzai}"
TRSS_ROOT="$BASE_DIR/TRSS-Yunzai"                  # TRSS 安装目录
NAPCAT_DIR="$BASE_DIR/Napcat"                      # NapCat 安装目录
CACHE_DIR="$BASE_DIR/cache"                        # 临时/下载缓存（结束自动清理）
TRSS_LOG="$BASE_DIR/trss.log"
NAPCAT_LOG="$BASE_DIR/napcat_run.log"
NAPCAT_START="$BASE_DIR/napcat_start.sh"

# ---------- 工具函数 ----------
log()  { echo -e "\033[32m[$(date '+%H:%M:%S')]\033[0m $*"; }
warn() { echo -e "\033[33m[$(date '+%H:%M:%S')]\033[0m $*"; }
die()  { echo -e "\033[31m[$(date '+%H:%M:%S')]\033[0m $*"; exit 1; }

# 判断 Debian 大版本（12=bookworm / 13=trixie）
detect_debian_ver() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "$VERSION_ID"
  else
    echo "12"
  fi
}
DEBIAN_VER="$(detect_debian_ver)"

check_placeholder() {
  if [ "$BOT_QQ" = "<机器人QQ>" ] || [ "$BOT_PASSWORD" = "<QQ密码>" ] || [ "$MASTER_QQ" = "<主人QQ>" ]; then
    die "请先配置 BOT_QQ / BOT_PASSWORD / MASTER_QQ 环境变量（或编辑 start.sh 顶部 CONFIG 区）"
  fi
}

is_installed() {
  [ -d "$TRSS_ROOT/node_modules" ] && [ -f "$NAPCAT_DIR/opt/QQ/qq" ]
}

# 清理缓存目录（install 结束时调用）
cleanup_cache() {
  if [ -d "$CACHE_DIR" ]; then
    log "清理临时缓存 $CACHE_DIR ..."
    rm -rf "$CACHE_DIR"
  fi
}
# 任何退出路径都清理缓存
trap cleanup_cache EXIT

# ---------- 首次部署 ----------
install() {
  check_placeholder
  log "=== 开始首次部署（BASE_DIR=$BASE_DIR, Debian $DEBIAN_VER, $(uname -m)）==="
  mkdir -p "$BASE_DIR" "$CACHE_DIR"

  # 1. 系统依赖（兼容 Debian 12/13 包名）
  log "[1/7] 安装系统依赖..."
  export DEBIAN_FRONTEND=noninteractive
  apt update
  if [ "$DEBIAN_VER" = "12" ]; then
    # bookworm: libglib2.0-0（无 -0t64 后缀）
    apt install -y redis-server unzip zip jq curl git xvfb screen xauth \
      libnss3 libgbm1 libglib2.0-0 libatk1.0-0 libatspi2.0-0 libgtk-3-0 libasound2 \
      libgcrypt20 libnspr4 libcups2 libatk-bridge2.0-0 libxss1 libxkbcommon0 \
      fonts-noto-cjk chromium
  else
    # trixie: -0t64 后缀
    apt install -y redis-server unzip zip jq curl git xvfb screen xauth \
      libnss3 libgbm1 libglib2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libgtk-3-0t64 libasound2t64 \
      libgcrypt20 libnspr4 libcups2 libatk-bridge2.0-0t64 libxss1 libxkbcommon0 \
      fonts-noto-cjk chromium
  fi

  # 2. Node.js ≥ 23.11（按架构选 tarball）
  if ! node -v 2>/dev/null | grep -qE '^v(2[3-9]|[3-9][0-9])'; then
    log "[2/7] 安装 Node.js 24 LTS ($(uname -m))..."
    ARCH="$(uname -m)"
    case "$ARCH" in
      aarch64|arm64) NODE_ARCH="linux-arm64" ;;
      x86_64|amd64)  NODE_ARCH="linux-x64" ;;
      *) die "不支持的架构: $ARCH" ;;
    esac
    NODE_TARBALL="$CACHE_DIR/node24.tar.xz"
    curl -L "https://nodejs.org/dist/v24.4.1/node-v24.4.1-$NODE_ARCH.tar.xz" -o "$NODE_TARBALL"
    cd "$CACHE_DIR" && tar -xf node24.tar.xz
    cp -r "node-v24.4.1-$NODE_ARCH"/{bin,include,lib,share} /usr/local/
    hash -r
  fi
  node -v
  npm i -g pnpm@9    # ⚠️ 不要 pnpm 11（要求 Node ≥ 22.13，报 node:sqlite 缺失）

  # 3. 部署 TRSS-Yunzai
  log "[3/7] 部署 TRSS-Yunzai..."
  mkdir -p "$BASE_DIR"
  if [ ! -d "$TRSS_ROOT/.git" ]; then
    git clone --depth 1 https://github.com/TimeRainStarSky/Yunzai "$TRSS_ROOT"
  fi
  cd "$TRSS_ROOT"
  pnpm install -P || warn "pnpm install 有报错（puppeteer postinstall 失败可忽略）"

  # 4. 安装 NapCat（NTQQ 协议端）
  log "[4/7] 安装 NapCat..."
  if [ ! -f "$NAPCAT_DIR/opt/QQ/qq" ]; then
    NAPCAT_INSTALLER="$CACHE_DIR/napcat.sh"
    curl -o "$NAPCAT_INSTALLER" https://raw.githubusercontent.com/NapNeko/NapCat-Installer/main/script/install.sh
    # NapCat 安装器默认装 /opt/QQ 或用户目录，设置目标到 BASE_DIR
    bash "$NAPCAT_INSTALLER" --docker n --cli n --proxy 0 --force
    # 若安装到默认位置（/root/QQ 或 /opt/QQ），迁移到 BASE_DIR/Napcat
    if [ ! -f "$NAPCAT_DIR/opt/QQ/qq" ]; then
      for cand in /opt/QQ /root/QQ /root/Napcat /opt/Napcat; do
        if [ -f "$cand/opt/QQ/qq" ]; then
          log "  迁移 NapCat: $cand → $NAPCAT_DIR"
          mkdir -p "$BASE_DIR"
          mv "$cand" "$NAPCAT_DIR"
          break
        fi
      done
    fi
  fi

  # 5. 安装插件（本仓库自带 genshin + mys-qr-login；miao-plugin 单独下载）
  log "[5/7] 安装插件..."
  cd "$TRSS_ROOT/plugins"
  if [ ! -d miao-plugin ]; then
    MIAO_ZIP="$CACHE_DIR/miao.zip"
    curl -L https://codeload.github.com/yoimiya-kokomi/miao-plugin/zip/refs/heads/master -o "$MIAO_ZIP"
    unzip -q "$MIAO_ZIP" -d "$CACHE_DIR/me" && mv "$CACHE_DIR/me/miao-plugin-master" miao-plugin
  fi
  if [ ! -d genshin ]; then
    cp -r "$REPO_DIR/plugins/genshin" ./genshin
  fi
  if [ ! -d mys-qr-login ]; then
    cp -r "$REPO_DIR/plugins/mys-qr-login" ./mys-qr-login
  fi
  # miao-plugin 帮助配置（7 组按绑定状态分层）
  mkdir -p miao-plugin/config
  cp "$REPO_DIR/plugins/miao-plugin-help.js" miao-plugin/config/help.js

  cd "$TRSS_ROOT" && pnpm install -P --config.confirmModulesPurge=false || true

  # 6. 应用补丁 01-08（genshin 修复 + cookie 抽卡 + miao 修复）
  log "[6/7] 应用补丁..."
  bash "$REPO_DIR/patches/apply-patches.sh" "$TRSS_ROOT"

  # 7. 配置：主人/权限、渲染、NapCat 连接
  log "[7/7] 写入配置..."
  configure_trss
  configure_napcat

  log "=== 部署完成 ==="
}

# ---------- TRSS 配置（主人/权限/渲染） ----------
configure_trss() {
  cd "$TRSS_ROOT"

  # 主人配置
  local other="$TRSS_ROOT/config/config/other.yaml"
  mkdir -p "$(dirname "$other")"
  cat > "$other" <<EOF
masterQQ:
  - $BOT_QQ
  - $MASTER_QQ
master:
  - "$BOT_QQ:$BOT_QQ"
  - "$BOT_QQ:$MASTER_QQ"
EOF

  # 群聊触发（默认全量回复）
  local group="$TRSS_ROOT/config/config/group.yaml"
  cat > "$group" <<EOF
default:
  onlyReplyAt: 0
EOF

  # 渲染器 chromiumPath
  local pupt="$TRSS_ROOT/renderers/puppeteer/config.yaml"
  if [ -f "$TRSS_ROOT/renderers/puppeteer/config_default.yaml" ] && [ ! -f "$pupt" ]; then
    cp "$TRSS_ROOT/renderers/puppeteer/config_default.yaml" "$pupt"
  fi
  if [ -f "$pupt" ]; then
    sed -i 's|^chromiumPath:.*|chromiumPath: /usr/bin/chromium|' "$pupt" \
      || echo "chromiumPath: /usr/bin/chromium" >> "$pupt"
  fi
}

# ---------- NapCat 配置（OneBot WS 客户端 → TRSS） ----------
configure_napcat() {
  local napcat_cfg="$NAPCAT_DIR/opt/QQ/resources/app/app_launcher/napcat/config"
  mkdir -p "$napcat_cfg" 2>/dev/null || true

  # OneBot v11 WS 客户端配置
  local onebot="$napcat_cfg/onebot11_$BOT_QQ.json"
  cat > "$onebot" <<'EOF'
{
  "network": {
    "websocketClients": [{
      "name": "ws-trss-yunzai",
      "enable": true,
      "url": "ws://127.0.0.1:2536/OneBotv11",
      "messagePostFormat": "array",
      "reportSelfMessage": false,
      "token": "",
      "reconnectInterval": 5000,
      "heartInterval": 30000,
      "debug": false
    }],
    "websocketServers": []
  },
  "musicSignUrl": "",
  "enableLocalFile2Url": false,
  "parseMultMsg": false,
  "imageDownloadProxy": "",
  "timeout": { "baseTimeout": 10000, "uploadSpeedKBps": 256, "downloadSpeedKBps": 256, "maxTimeout": 1800000 }
}
EOF

  # NapCat 启动脚本（密码登录 + 清代理 + xvfb）
  cat > "$NAPCAT_START" <<EOF
#!/bin/bash
export DISPLAY=:99
export NAPCAT_QUICK_PASSWORD=$BOT_PASSWORD
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY no_proxy NO_PROXY
pkill -f "qq --no-sandbox" 2>/dev/null; pkill -f "Xvfb" 2>/dev/null; sleep 2
cd $NAPCAT_DIR/opt/QQ
exec xvfb-run -a ./qq --no-sandbox -q $BOT_QQ 2>&1 | tee $NAPCAT_LOG
EOF
  chmod +x "$NAPCAT_START"

  warn "NapCat 配置写入 $onebot"
  warn "首次登录需完成设备验证（二选一）："
  warn "  A. 服务器本地/内网: 浏览器打开 http://<服务器IP>:6099/webui"
  warn "  B. 本机通过 SSH 隧道: ssh -L 6099:127.0.0.1:6099 root@<服务器IP> 后访问 http://127.0.0.1:6099/webui"
  warn "  步骤: ① 先不带密码跑一次: cd $NAPCAT_DIR/opt/QQ && xvfb-run -a ./qq --no-sandbox -q $BOT_QQ"
  warn "       ② WebUI 中扫码完成设备验证后 Ctrl+C 退出"
  warn "       ③ 之后用 start.sh 正常启动（密码自动登录）"
}

# ---------- 启动 ----------
start() {
  check_placeholder
  if ! is_installed; then
    die "尚未部署。请先运行: bash start.sh install"
  fi

  # Redis
  if ! redis-cli ping >/dev/null 2>&1; then
    log "启动 Redis..."
    redis-server --daemonize yes
    sleep 1
  else
    log "Redis 已在运行"
  fi

  # NapCat（screen 会话）
  if ! pgrep -f "qq --no-sandbox" >/dev/null; then
    log "启动 NapCat（screen 会话 napcat）..."
    screen -dmS napcat "$NAPCAT_START"
    sleep 3
  else
    log "NapCat 已在运行"
  fi

  # TRSS
  if ! ss -tlnp 2>/dev/null | grep -q ':2536'; then
    log "启动 TRSS-Yunzai..."
    cd "$TRSS_ROOT"
    setsid nohup node . > "$TRSS_LOG" 2>&1 < /dev/null &
    sleep 8
  else
    log "TRSS 已在运行"
  fi

  log "=== 启动完成 ==="
  status
}

# ---------- 状态 ----------
status() {
  echo ""
  echo "================ 服务状态 ================"
  redis-cli ping >/dev/null 2>&1 && echo "✅ Redis:     运行中" || echo "❌ Redis:     未运行"
  pgrep -f "qq --no-sandbox" >/dev/null && echo "✅ NapCat:    运行中 (port 6099 WebUI / 3001)" || echo "❌ NapCat:    未运行"
  ss -tlnp 2>/dev/null | grep -q ':2536' && echo "✅ TRSS:      运行中 (port 2536)" || echo "❌ TRSS:      未运行"
  echo "=========================================="
  echo "TRSS 日志: tail -f $TRSS_LOG"
  echo "NapCat 日志: tail -f $NAPCAT_LOG"
  echo ""
  if ss -tlnp 2>/dev/null | grep -q ':2536'; then
    echo "连接确认（应出现）: OneBotv11(QQ) NapCat.Onebot 已连接"
    grep -E "已连接|OneBotv11" "$TRSS_LOG" 2>/dev/null | tail -3 || true
  fi
}

# ---------- 停止 ----------
stop() {
  log "停止 TRSS..."
  PID=$(ss -tlnp 2>/dev/null | grep 2536 | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2)
  [ -n "$PID" ] && kill -9 "$PID" || true
  log "停止 NapCat..."
  pkill -9 -f "qq --no-sandbox" 2>/dev/null || true
  pkill -9 -f "Xvfb" 2>/dev/null || true
  log "停止 Redis..."
  redis-cli shutdown nosave 2>/dev/null || true
  log "已全部停止"
}

# ---------- 入口 ----------
case "${1:-start}" in
  install) install; start ;;
  start)   start ;;
  restart) stop; start ;;
  status)  status ;;
  stop)    stop ;;
  *) die "用法: bash start.sh [install|start|restart|status|stop]" ;;
esac
