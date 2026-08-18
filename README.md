# Yunzai 机器人研究仓库

2026 年 Yunzai-Bot（TRSS-Yunzai + NapCat）研究与实战成果存档。

## 架构

```
[QQ 机器人账号] → NapCat(NTQQ内核) → OneBot v11 WS → TRSS-Yunzai → 插件
```

## 目录结构

```
yunzai-research/
├── README.md                 # 本说明
├── plugins/
│   ├── genshin/              # 原神绑定插件（含补丁 01/02/03/05/07 的修改）
│   ├── mys-qr-login/         # 米游社扫码登录插件（第三方，已安全审查）
│   └── miao-plugin-help.js   # miao-plugin 自定义帮助配置（7 组按绑定状态分层）
├── config/
│   ├── napcat_start.sh       # NapCat 启动脚本（密码登录+清代理+xvfb）
│   ├── napcat-onebot11.json  # NapCat OneBot WS 客户端配置模板
│   ├── trss-other.yaml       # TRSS 主人/权限配置模板
│   ├── trss-group.yaml       # TRSS 群聊触发配置模板
│   ├── trss-server.yaml      # TRSS 服务器端口配置模板
│   ├── trss-redis.yaml       # Redis 配置模板
│   └── puppeteer-config.yaml # TRSS 渲染器配置（chromiumPath）
├── patches/
│   ├── 01-genshin-regex-fix.patch           # #检查ck状态 正则修复
│   ├── 02-genshin-getckuid.patch            # 补 MysUser.getCkUid 静态方法
│   ├── 03-genshin-clear-gacha.patch         # 新增 #清除十连 指令
│   ├── 04-miao-profile-allchars.patch       # 面板更新自动获取全部角色
│   ├── 05-genshin-cookie-gacha.patch        # 抽卡记录 Cookie 一键获取
│   ├── 06-miao-fixes.patch                  # miao 修复（gachaStat 抢占/群内最强）
│   ├── 07-genshin-disable-material.patch    # 禁用 #xxx材料 命令
│   ├── 08-miao-gacha-yzrule-removed.patch   # miao gacha 移除 yzRule
│   ├── apply-patches.sh                     # 一键应用补丁脚本（01-08）
│   ├── update-pool.sh                       # 十连卡池更新脚本
│   ├── fix-route-hijack.sh                  # 清除 FlClash fake-IP 路由规则
│   ├── redis-diagnose*.sh                   # Redis 僵尸诊断脚本
│   ├── redis-restore-systemd.sh             # 恢复 systemd Redis 托管
│   ├── test-cookie-gacha.mjs                # Cookie 换 authkey 验证工具
│   └── show-first-five.mjs                  # 抽卡记录最早/首个五星查询
├── start.sh                    # 一键部署/启动脚本（install/start/status/stop）
└── docs/
    └── Yunzai机器人研究总结.md      # 完整研究总结（部署/玩法/踩坑/性能）
```

## 服务器部署（Debian 12/13，x86_64 / aarch64）

> 适用于全新 Debian 服务器（Debian 12 bookworm 或 13 trixie；x86_64 或 ARM aarch64，推荐 2 核 4GB 起步）。已实测于 WSL2 Debian 13 (x86_64) 与 Armbian Debian 12 (aarch64)。
> 安装根目录默认 **`/opt/napyunzai`**（可用 `BASE_DIR` 环境变量覆盖），临时缓存用 `/opt/napyunzai/cache` 并在部署结束后自动清理。

### 方式一：一键脚本（推荐）

```bash
# 1. 拉取本仓库
git clone https://github.com/xsddszrc/yunzai-research.git /opt/yunzai-research
cd /opt/yunzai-research

# 2. 配置机器人账号（环境变量方式，不留存明文于脚本）
export BOT_QQ=<机器人QQ号>
export BOT_PASSWORD=<机器人QQ密码>
export MASTER_QQ=<主人QQ号>
# 可选：export BASE_DIR=/opt/napyunzai   # 默认值

# 3. 首次部署（装依赖 + 部署 TRSS/NapCat/插件 + 打补丁 01-08 + 写配置 + 启动）
bash start.sh install
```

`start.sh` 子命令：

| 命令 | 作用 |
|------|------|
| `bash start.sh install` | 首次部署并启动（幂等，可重复运行） |
| `bash start.sh start` | 启动全部服务（Redis → NapCat → TRSS） |
| `bash start.sh restart` | 重启全部服务 |
| `bash start.sh status` | 查看服务状态与连接确认 |
| `bash start.sh stop` | 停止全部服务 |

脚本会自动完成：系统依赖（Debian 12/13 包名自适应 + ARM 架构自动选 Node tarball）→ Node 24 + pnpm@9 → TRSS-Yunzai → NapCat → 插件（genshin/mys-qr-login/miao-plugin）→ 补丁 01-08 → 主人/权限/渲染/NapCat 连接配置。

**首次登录注意**（脚本会提示）：NapCat 首次需在 WebUI（`http://服务器IP:6099/webui`）扫码完成设备验证，之后密码自动登录。若脚本启动后 QQ 未上线，按提示手动跑一次 `xvfb-run -a ./qq --no-sandbox -q <QQ>` 完成验证。

### 方式二：手动步骤（对照研究总结）

完整手动步骤见 `docs/Yunzai机器人研究总结.md` 第四节（9 步）。与本仓库的差异：

1. **genshin / mys-qr-login 用本仓库** `plugins/` 下的（已含全部修复），不要从 Miao-Yunzai 复制
2. **miao-plugin 帮助配置**：复制本仓库 `plugins/miao-plugin-help.js` → `miao-plugin/config/help.js`
3. **补丁**：`bash patches/apply-patches.sh /opt/napyunzai/TRSS-Yunzai`（应用 01-08）
4. **配置模板**：`config/` 目录下的 napcat_start.sh、trss-other.yaml、trss-group.yaml、puppeteer-config.yaml 为脱敏模板，替换占位符后使用

### 部署后验证

```bash
bash start.sh status          # 三个服务均 ✅
tail -f /opt/napyunzai/trss.log   # 出现 "OneBotv11(QQ) NapCat.Onebot 已连接"
```

然后 QQ 私聊机器人发 `#状态`（应回复统计）、`#帮助`（应渲染 7 组面板）、`#绑定UID` 绑定账号。

### 生产建议

- 用 `pm2` 托管：`cd /opt/napyunzai/TRSS-Yunzai && npm i -g pm2 && pm2 start config/pm2.yaml`，或 systemd
- 配置 `restart_time` 定时重启防内存泄漏（研究总结第六节）
- 保持 FlClash 等代理软件关闭（fake-IP DNS 会劫持 QQ 长连接）；生产服务器无此问题，但勿设系统级代理


## 快速部署

完整可复现步骤见 `docs/Yunzai机器人研究总结.md` 第四节。核心链路：

1. **环境**：Node ≥ 23.11 + pnpm@9 + Redis + Chromium
2. **TRSS-Yunzai**：`git clone https://github.com/TimeRainStarSky/Yunzai` + `pnpm install -P`
3. **NapCat**：官方安装器 + `NAPCAT_QUICK_PASSWORD` 密码登录（首次需 WebUI 扫码验证设备）
4. **连接**：NapCat `onebot11_<QQ>.json` 配置 `websocketClients` → `ws://127.0.0.1:2536/OneBotv11`
5. **插件**：复制本仓库 `plugins/` 下 genshin、mys-qr-login；miao-plugin 单独安装
6. **渲染**：`renderers/puppeteer/config.yaml` 设 `chromiumPath`
7. **补丁**：`bash patches/apply-patches.sh <TRSS根目录>`（genshin 与 miao-plugin 升级后重打 01-08）

## 已应用的自定义

| 变更 | 补丁 |
|------|------|
| `#检查ck状态` 正则修复（`\\s`→`\s`） | 01 |
| `MysUser.getCkUid` 静态方法 | 02 |
| `#清除十连` 指令 | 03 |
| 已绑定 Cookie 用户更新面板自动获取全部角色 | 04 |
| `#抽卡记录` Cookie 一键获取（stoken→authkey） | 05 |
| miao `gachaStat` 移除抢占 + `#群内最强` 正则 | 06 |
| 禁用 `#xxx材料`（米游社投稿合集停更） | 07 |
| miao gacha 移除 yzRule（`#抽卡记录` 归 genshin） | 08 |

## 安全说明

- 配置模板已脱敏（QQ 密码不入库，QQ 号为占位符）
- mys-qr-login 已做安全审查：仅访问官方 `passport-api.mihoyo.com`，28/28 测试通过
- genshin 插件无运行时数据（cookie/UID 存于服务器 data 目录，不入库）
- `test-cookie-gacha.mjs` 等工具会读取本地 Cookie 调用米游社接口，仅限本机使用

## 许可

本项目仓库整体采用 **GPL-3.0**（见 LICENSE 文件），以兼容仓库内各组件的上游许可：

| 组件 | 上游许可 |
|------|---------|
| TRSS-Yunzai（部署框架，未入库） | GPL-3.0 |
| mys-qr-login（扫码登录插件） | GPL-3.0（TwiceDrop/mhy-qdcode-to-cookie） |
| miao-plugin（喵喵插件，仅 help.js 配置入库） | MIT（Copyright 2023 Yoimiya） |
| genshin（绑定插件） | 上游未声明，社区惯例自由使用 |

> 本仓库仅用于学习研究；部署与使用请遵循各上游项目许可及 QQ/米游社平台规范。
