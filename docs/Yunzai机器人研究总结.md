# Yunzai 机器人（QQ Bot）研究总结

> **研究周期**：2026-08-16 ~ 08-17（两阶段）
> **研究环境**：Windows 11 + WSL2 Debian 13 (trixie)，4 核 15GB
> **机器人 QQ**：<机器人QQ>（反杀闰土的猹）｜**主人 QQ**：<主人QQ>
> **最终状态**：✅ 全链路打通并实测验证（收消息 → 插件处理 → 图片渲染 → 回复）

---

## 一、结论先行（TL;DR）

**2026 年玩 Yunzai 的正确姿势**：

```
TRSS-Yunzai（框架）+ miao-plugin（游戏插件）+ genshin（绑定插件）+ NapCat（NTQQ 协议端）+ Redis
```

- ❌ **老路已死**：Miao-Yunzai 原生 icqq/oicq 登录被腾讯拒绝（错误码 45），qsign 签名服务救不了
- ✅ **正解**：NapCat 基于腾讯官方 NTQQ 内核，协议永远最新；TRSS-Yunzai 原生支持 OneBot v11
- ⚠️ **本机最大坑**：FlClash（Clash TUN + fake-IP DNS）劫持 QQ 长连接域名导致反复掉线，关闭即恢复

---

## 二、Yunzai 生态全景（2026 版）

| 版本/分支 | 定位 | 登录方式 | 2026 可用性 |
|-----------|------|---------|------------|
| **TRSS-Yunzai**（TimeRainStarSky） | 活跃维护的继任分支 | **原生 OneBotv11 + 7 种协议端** | ✅ **推荐** |
| Miao-Yunzai v3（喵版） | 社区最活跃 | icqq（老协议） | ⚠️ icqq 登录已死 |
| Yunzai v3 原版/乐神版 | 历史版本 | oicq/icqq | ❌ 停更/登录失败 |
| Karin（Yunzai v4） | 新一代框架 | 多协议 | ✅ 可选 |

**核心组件**：

| 组件 | 作用 | 版本要求 |
|------|------|---------|
| TRSS-Yunzai | 机器人框架（本体） | Node.js ≥ v23.11 |
| NapCat | QQ 协议端（OneBot v11 标准） | 官方安装器 |
| miao-plugin | 喵喵插件（面板/抽卡/深渊/帮助） | 必装 |
| genshin | 原神绑定插件（UID/Cookie 绑定） | 必装（绑定命令来源） |
| Redis/Valkey | 缓存/数据库 | > 5.0 |
| Chromium | 图片渲染（帮助菜单/面板卡片） | 系统安装 |

---

## 三、为什么老协议死了（关键认知）

### icqq/oicq 直连的死亡原因
1. icqq 最新版 **0.6.10**（2024-02 后停更），内置协议最高 **Android 9.0.17**
2. 腾讯 2026 年拒绝该版本，登录报错：
   ```
   [禁止登录]你当前使用的QQ版本过低，请前往QQ官网im.qq.com下载最新版QQ后重试。(错误码：45)
   ```
3. qsign 签名服务（unidbg-fetch-qsign）救不了：icqq 侧协议无法升级，且 qsign 项目已停更（有封号风险）
4. 官方文档（yunzai-bot.com，2026-01 更新）确认：**错误码 45 = 签名 API 异常或版本过低**

### ws-plugin 为什么也不行（重要架构认知）
- Miao-Yunzai 社区常用的 ws-plugin 架构是「**把 Yunzai 自带 icqq 机器人的消息转发给外部框架**」+「执行外部框架的 API 调用」
- 它**无法把 NapCat 的事件灌进 Yunzai**（入向消息无处理路径，产生海量 `未适配的api: undefined` 刷屏）
- 因此 Miao-Yunzai + NapCat 组合无效 → **用 TRSS-Yunzai（原生 OneBotv11 适配器）**

### 2026 标准架构
```
[QQ <机器人QQ>]
     │  NTQQ 内核（协议永远最新）
     ▼
[NapCat] ──OneBot v11 WS（反向WS）──► [TRSS-Yunzai] ──► [miao-plugin / genshin 插件]
                                          │
                                          ▼
                                     [Redis] [Chromium 渲染]
```
连接方向：**TRSS 跑 WS 服务端（端口 2536，路径 `/OneBotv11`），NapCat 配「WebSocket 客户端」连入**。

---

## 四、完整可复现部署步骤

> 以下步骤在 WSL2 Debian 13 上逐条实测通过。

### 第 1 步：基础环境

```bash
# 系统依赖（含 QQ/NapCat 需要的图形库）
apt update && apt install -y redis-server unzip zip jq curl git xvfb screen xauth \
  libnss3 libgbm1 libglib2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libgtk-3-0t64 libasound2t64 \
  libgcrypt20 libnspr4 libcups2 libatk-bridge2.0-0t64 libxss1 libxkbcommon0 \
  fonts-noto-cjk chromium
```

### 第 2 步：Node.js ≥ v23.11 + pnpm@9

```bash
# Node 24 LTS（官方 tarball 安装）
curl -L https://nodejs.org/dist/v24.4.1/node-v24.4.1-linux-x64.tar.xz -o /tmp/node24.tar.xz
cd /tmp && tar -xf node24.tar.xz
cp -r node-v24.4.1-linux-x64/{bin,include,lib,share} /usr/local/
node -v   # v24.4.1

npm i -g pnpm@9    # ⚠️ 不要装 pnpm 11（要求 Node ≥ 22.13，会报 node:sqlite 缺失）
```

### 第 3 步：部署 TRSS-Yunzai

```bash
# GitHub 源（国内 git 协议不通时用 codeload zip，见踩坑 #5）
git clone --depth 1 https://github.com/TimeRainStarSky/Yunzai /root/yunzai/TRSS-Yunzai
cd /root/yunzai/TRSS-Yunzai
pnpm install -P    # puppeteer postinstall 失败可忽略（见踩坑 #7）
```

### 第 4 步：安装 NapCat（NTQQ 协议端）

```bash
curl -o /tmp/napcat.sh https://raw.githubusercontent.com/NapNeko/NapCat-Installer/main/script/install.sh
bash /tmp/napcat.sh --docker n --cli n --proxy 0 --force
```
- 安装到 `/root/Napcat`（含 Linux 版 QQ + NapCat 本体）
- **WebUI**：`http://127.0.0.1:6099/webui`（token 在 `napcat/config/webui.json`）

**启动脚本**（`/root/napcat_start.sh`，密码自动登录 + 清代理）：

```bash
#!/bin/bash
export DISPLAY=:99
export NAPCAT_QUICK_PASSWORD=<QQ密码>   # 密码登录，免每次扫码
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY no_proxy NO_PROXY
pkill -f "qq --no-sandbox" 2>/dev/null; pkill -f "Xvfb" 2>/dev/null; sleep 2
cd /root/Napcat/opt/QQ
exec xvfb-run -a ./qq --no-sandbox -q <机器人QQ> 2>&1 | tee /root/napcat_run.log
```

**首次登录**：先跑 `xvfb-run -a ./qq --no-sandbox -q <QQ>`（无密码 env），在 WebUI 扫码完成**设备验证**（新设备需验证一次），之后密码登录即可免扫码。若密码登录提示「新设备需要扫码验证」，须在 WebUI 中完成验证（见踩坑 #10）。

### 第 5 步：配置 TRSS ↔ NapCat 连接（关键）

**TRSS 侧**（原生监听，端口 2536 可改 `config/config/server.yaml`）：
- WS 端点：`ws://127.0.0.1:2536/OneBotv11`

**NapCat 侧**：编辑 `napcat/config/onebot11_<QQ>.json`：

```json
{
  "network": {
    "websocketClients": [{
      "name": "ws-trss-yunzai",
      "enable": true,
      "url": "ws://127.0.0.1:2536/OneBotv11",
      "messagePostFormat": "array",
      "reportSelfMessage": false,
      "token": ""
    }],
    "websocketServers": []
  }
}
```

连接成功后 TRSS 日志出现：
```
[<机器人QQ>] OneBotv11(QQ) NapCat.Onebot v4.18.19 已连接
```

### 第 6 步：安装插件（miao-plugin + genshin）

```bash
cd /root/yunzai/TRSS-Yunzai/plugins
# miao-plugin（游戏功能）
curl -L https://codeload.github.com/yoimiya-kokomi/miao-plugin/zip/refs/heads/master -o /tmp/miao.zip
unzip -q /tmp/miao.zip -d /tmp/me && mv /tmp/me/miao-plugin-master miao-plugin
# genshin（UID/Cookie 绑定，绑定命令来源！）
cp -r /root/yunzai/Miao-Yunzai/plugins/genshin ./genshin   # 从 Miao-Yunzai 复制
cd /root/yunzai/TRSS-Yunzai && pnpm install -P --config.confirmModulesPurge=false
```

### 第 7 步：渲染配置（Chromium）

```bash
cd /root/yunzai/TRSS-Yunzai/renderers/puppeteer
cp config_default.yaml config.yaml
# 编辑 config.yaml，设置：
#   chromiumPath: /usr/bin/chromium
```

### 第 8 步：主人/权限配置

`config/config/other.yaml`：
```yaml
masterQQ:
  - <机器人QQ>      # 机器人自身
  - <主人QQ>      # 主人主号
master:
  - "<机器人QQ>:<机器人QQ>"
  - "<机器人QQ>:<主人QQ>"   # Bot账号:主人QQ
```

`config/config/group.yaml`（群聊触发方式）：
```yaml
default:
  onlyReplyAt: 0        # 0=全量回复 1=仅@ 2=非主人需@
  botAlias:             # 若配置，只回 @机器人 或 别名前缀 的消息
    - 云崽
    - 云宝
```

### 第 9 步：启动与托管

```bash
# Redis（TRSS 会自动拉起，也可手动）
redis-server --daemonize yes

# NapCat（screen 会话，跨会话存活）
screen -dmS napcat /root/napcat_start.sh

# TRSS-Yunzai（后台）
cd /root/yunzai/TRSS-Yunzai && setsid nohup node . > /root/trss.log 2>&1 < /dev/null &

# 生产环境建议 pm2
cd /root/yunzai/TRSS-Yunzai && npm i -g pm2 && pm2 start config/pm2.yaml
```

---

## 五、玩法指南

### 基本交互
- 群聊/私聊发指令，**指令以 `#` 开头**
- `#帮助` / `#喵喵帮助`：查看功能菜单（**图片**渲染）
- `#状态`：查看运行状态/统计

### 绑定与查询（必会）
| 指令 | 功能 |
|------|------|
| `#绑定<UID>` | 绑定原神 UID（如 `#绑定343200486`） |
| `#星铁绑定<UID>` | 绑定星铁 UID |
| `#绑定ck` | 绑定米游社 Cookie（面板/签到需要） |
| `#绑定uid` / `#UID` | 查看绑定 |
| `#面板` / `#<角色>面板` | 角色面板（Enka/MiniGG 服务） |
| `#更新面板` | 刷新面板数据 |
| `#米游社更新面板` | 走米游社接口刷新（需 cookie） |
| `#喵喵抽卡` | 抽卡模拟 |
| `#深渊` | 深渊数据 |

### 插件生态
miao-plugin（游戏）、genshin（绑定）、锅巴插件（Web 管理台）、图鉴插件、py-plugin 等；开发插件 = 写一个继承 `plugin` 的 ES Module 声明 `rule` 正则。

---

## 六、性能需求（实测数据）

### 当前实例真实占用（4 核 15GB WSL）

| 组件 | 内存 (RSS) | CPU | 说明 |
|------|-----------|-----|------|
| QQ/NapCat（NTQQ 多进程，6 个） | ~680MB | <1% 空闲 | 主进程 283MB + 子进程 |
| TRSS-Yunzai（node） | ~170MB | <1% | 主框架 |
| Chromium 渲染（6 个常驻进程） | ~830MB | 渲染时短占 | puppeteer 复用不退出 |
| Xvfb（虚拟显示） | 62MB | 0 | WSL 无头专用 |
| Redis | 15MB | 0 | 缓存 |
| **合计稳态** | **~1.8GB** | **几乎空闲** | |

### 配置建议

| 档位 | 内存 | CPU | 适用场景 |
|------|------|-----|---------|
| 最低 | 2GB | 1 核 | 单号、小群、不常渲染 |
| **推荐** | **4GB** | 2 核 | 单号 + miao-plugin 全家桶 |
| 充裕 | 8GB | 4 核 | 多账号、大群、高频渲染 |
| 磁盘 | ≥10GB 可用 | - | 本体 1.3GB + 缓存数据增长 |

### 结论
- **内存是核心指标**，CPU 完全不是瓶颈（渲染图片仅秒级占用）
- 普通 2 核 4GB 云服务器（轻量 VPS）绰绰有余
- 多账号每 +1 个 QQ ≈ +1GB（NapCat 实例）
- 内存紧张时可配置 Chromium 渲染后自动关闭

---

## 七、踩坑手册（完整记录）

### A. 环境/网络层
| # | 坑 | 现象 | 解决 |
|---|----|------|------|
| 1 | DSH 沙箱挡 WSL | `wsl -l` 报 E_ACCESSDENIED | 需要 danger-full-access 权限 |
| 2 | WSL 继承 Windows 代理 | apt/git/QQ 全部走 `127.0.0.1:7890`（Clash） | `env -u http_proxy -u https_proxy …` 清除 |
| 3 | **apt IPv6 挂死** | apt update 卡死，curl 却秒回 | 写 `/etc/apt/apt.conf.d/99force-ipv4`：`Acquire::ForceIPv4 "true";` |
| 4 | WSL 崩溃 | 装依赖时 VM 崩 2 次，/tmp（tmpfs）清空、dpkg 事务中断 | `dpkg --configure -a` 修复；脚本日志别放 /tmp |
| 5 | GitHub git 协议不通 / Gitee 403 | `git clone` 超时；gitee zip 归档被 WAF 拦 | 用 codeload zip：`https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}`（注意分支名 master/main） |
| 6 | pnpm 11 装不上 | 报 `node:sqlite` 缺失 | 用 `npm i -g pnpm@9` |

### B. 登录层
| # | 坑 | 现象 | 解决 |
|---|----|------|------|
| 7 | icqq 错误码 45 | 版本过低，禁止登录 | 老协议无解 → 转 NapCat |
| 8 | 扫码反复过期 | 二维码 2 分钟 TTL + 复制延迟 | 用 WebUI 实时码，或密码登录（`NAPCAT_QUICK_PASSWORD`） |
| 9 | Electron 崩溃 | `Failed to shutdown`，登录验证阶段偶发 | 重启重试；用 screen 会话启动更稳 |
| 10 | 设备验证页打不开 | `accounts.qq.com/safe/verify` 在浏览器显示「验证失败，请使用最新版手机QQ验证」 | 该页面必须 QQ 客户端内嵌环境调用；**在 NapCat WebUI 中完成验证** |
| 11 | **密码登录成功但反复离线** | `账号状态变更为离线` 每 17 秒循环，收不到消息 | **FlClash fake-IP DNS 劫持 QQ 长连接**（见下） |

### C. 网络深坑（本次最大发现）
- **FlClash（Clash TUN + fake-IP DNS）劫持 `msfwifi.qq.com`**（QQ 长连接服务器）
- 解析被改写成 fake-IP（198.18.0.0/15 段）如 `198.18.0.87`，该地址路由不可达
- 表现极具迷惑性：登录成功（登录服务器可达）、OneBot API 能响应，但**长连接断 → 收不到真实消息**
- 其它 QQ 域名（qun.qq.com 等）的 fake-IP 恰好可达，部分功能正常
- **修复**：关闭 FlClash TUN（或给 `*.qq.com` 加直连规则）；实测关闭后立即恢复

### D. 架构层
| # | 坑 | 现象 | 解决 |
|---|----|------|------|
| 12 | ws-plugin 不能灌入 NapCat 消息 | `未适配的api: undefined` 刷屏（40K 条/2 分钟） | ws-plugin 架构方向相反 → 换 TRSS-Yunzai（原生 OneBotv11） |
| 13 | TRSS 连接即崩溃 | 账号离线时 `get_cookies` API 超时 → 适配器 connect 抛异常重连循环 | 根因在账号在线状态（见 #11） |
| 14 | `#帮助` 群聊不回复 | 只回复 `#状态` 等 | miao-plugin 未加载（启动后再放插件需重启 TRSS） |
| 15 | `#绑定` 不生效 | 回复「请先发送 #绑定+你的UID」 | **TRSS 缺 genshin 插件**（绑定命令来源），从 Miao-Yunzai 复制补齐 |
| 16 | 面板更新失败 | `MiniGG-Api 面板服务维护中` | 外部 API 服务问题，非系统；可换服务或走米游社接口 |

### E. 运维层
| # | 坑 | 现象 | 解决 |
|---|----|------|------|
| 17 | 进程名被改 | `pgrep node` 找不到 TRSS（进程名显示 `TRSS Y`） | 用 `ss -tlnp` 按端口找，或 `pkill -f "node \."` 注意转义 |
| 18 | 复合命令竞态 | `screen quit + pkill + screen start` 连招失败 | 分步执行（先清场、再单独 `screen -dmS`） |
| 19 | puppeteer postinstall 失败 | Chrome 下载失败（缓存目录是空的，310M 其实是 Firefox） | `apt install chromium` + `renderers/puppeteer/config.yaml` 设 `chromiumPath` |

---

## 八、实测验证记录（日志证据）

### Day1（08-16）
- ✅ icqq 直连登录 → 错误码 45（验证老协议死亡）
- ✅ qsign 签名服务可启动（txlib 8.9.96），但救不了协议版本
- ✅ NapCat 密码登录成功：`密码回退登录成功 <机器人QQ>`
- ✅ OneBot API 响应：`get_login_info → {user_id: <机器人QQ>, nickname: 反杀闰土的猹}`
- ✅ TRSS ↔ NapCat 连接：`OneBotv11(QQ) NapCat.Onebot v4.18.19 已连接`
- ✅ 关闭 FlClash 后账号稳定在线（无离线记录）

### Day2（08-17）
- ✅ `#状态` 私聊回复（状态统计完成 1 秒 190）
- ✅ **`#帮助` 图片渲染**（私聊 + 群聊）：
  ```
  [Chromium] /usr/bin/chromium
  puppeteer Chromium 启动成功
  [#帮助][喵喵:喵喵帮助(help)][完成2秒376]
  发送好友消息：[{"type":"image","data":{"file":"base64://..."}}]
  ```
- ✅ **出站发送**：OneBot API `send_private_msg` → 主号收到（`retcode: 0, message_id: 754109916`）
- ✅ **`#绑定343200486` 成功**（补装 genshin 后）：
  ```
  [#绑定343200486][用户绑定(bingUid)][开始处理]
  [图片生成][genshin/html/user/uid-list] 100.41KB 512ms
  [完成2秒107]
  ```
- ✅ `#更新面板` / `#少女面板` 识别 UID 并渲染（面板 API 外部服务暂时维护中）

---

## 九、生产部署建议（用户将部署到 Linux 服务器）

1. **架构**：TRSS-Yunzai + miao-plugin + genshin + NapCat + Redis，全部 Linux 原生运行
2. **硬件**：2 核 4GB 起步（见性能章节），国内云服务器直连 QQ 无网络问题
3. **登录**：首次扫码验证设备后，用 `NAPCAT_QUICK_PASSWORD` + 会话复用免扫码；**环境变量别带代理**
4. **网络**：确保 DNS 干净（无 fake-IP 劫持）、能直连 `msfwifi.qq.com`；生产服务器天然满足
5. **托管**：pm2（`pm2 start config/pm2.yaml`）或 systemd；`restart_time` 定时重启防内存泄漏
6. **安全**：QQ 密码明文存配置文件（0600）；机器人用小号；风控风险自负
7. **维护**：图片缓存/日志定期清理；TRSS 自带 `#更新` / 定时更新

---

## 十、配置速查表

| 文件 | 位置 | 关键项 |
|------|------|--------|
| TRSS 主配置 | `TRSS-Yunzai/config/config/*.yaml` | server.yaml(端口2536) / other.yaml(master) / group.yaml(触发) / bot.yaml(日志) |
| TRSS 渲染器 | `TRSS-Yunzai/renderers/puppeteer/config.yaml` | chromiumPath |
| NapCat 配置 | `Napcat/opt/QQ/resources/app/app_launcher/napcat/config/` | webui.json(token) / onebot11_<QQ>.json(WS连接) |
| NapCat 启动 | `/root/napcat_start.sh` | 密码 env + 清代理 + xvfb |
| 日志 | `/root/trss.log`（TRSS）/ `/root/napcat_run.log`（NapCat） | 排障首选 |

**服务恢复顺序**：Redis → NapCat（screen 脚本）→ TRSS。

---

## 十一、追加进度（Day2 下午 08:45）— 插件生态完善与 bug 修复

### 1. 米游社扫码登录插件（安装 + 安全审查）

**仓库**：`TwiceDrop/mhy-qdcode-to-cookie`（https://github.com/TwiceDrop/mhy-qdcode-to-cookie，GPL-3.0，2026-07 更新，专为 TRSS-Yunzai）

**功能**：群聊发 `#扫码登录` → 生成米游社通行证二维码 → 手机米游社 App 扫码确认 → 自动撤回二维码 → **Cookie 自动写入 genshin 绑定**（miao-plugin 直接读取）

**安全审查结论（确认无毒后安装）**：
| 检查项 | 结果 |
|--------|------|
| 网络目标 | ✅ 仅官方 `passport-api.mihoyo.com` / `user.mihoyo.com`（createQRLogin / queryQRLoginStatus / 换 cookie_token / ltoken） |
| 危险 API（eval/exec/写文件） | ✅ 无 |
| 代码混淆 | ✅ 无 |
| 依赖 | ✅ 仅标准 `qrcode` 包 |
| 自带测试 | ✅ 28/28 通过（含「网络异常不泄露 Token」「账号不一致拒绝生成 Cookie」） |
| 数据落点 | ✅ 只写 genshin MysUser（与手动 `#绑定ck` 同一模型），失败自动回滚 |

**安装**：`plugins/mys-qr-login` + `pnpm install -P` + 重启 TRSS。命令：`#扫码登录` / `#扫码登录原神|崩铁|绝区零` / `#扫码状态`（仅群聊，国服账号）。

### 2. 帮助菜单定制（help.js）

- 按官方规范复制 `config/help_default.js` → `config/help.js`（自定义生效文件）
- 新增「**账号绑定与扫码登录**」组：`#绑定UID` `#绑定ck` `#检查ck状态` `#我的ck` `#删除ck` `#扫码登录` `#扫码状态` `#体力` `#札记` `#原石` `#状态`
- 现共 **6 组**：游戏面板 / 资料图片 / 个人信息签到 / 其他查询 / 管理命令 / 账号绑定与扫码登录

### 3. genshin 插件两个 bug 修复（重要，升级后需重打补丁）

**Bug ①：`#检查ck状态` 无法触发（正则双反斜杠）**
- 症状：命令到达但无任何插件响应
- 根因：`apps/user.js` 第 53 行规则 `reg: /^#\\s*(检查|我的)*c(oo)?k(ie)?(状态)*$/i` —— JS 正则字面量里 `\\s` 匹配**字面字符 `\s`** 而非空白
- 修复：改为 `/^#\s*(检查|我的)*c(oo)?k(ie)?(状态)*$/i`

**Bug ②：`#检查ck状态` 触发即崩溃（缺静态方法）**
- 症状：命令有处理日志但无回复，日志报 `TypeError: MysUser.getCkUid is not a function`
- 根因：`model/mys/MysUser.js` 的 `static checkCkStatus(ck)` 调用不存在的 `static getCkUid(ck, true, true)` —— **上游 genshin 当前版本缺陷**（经查 GitHub 最新镜像同样缺失）
- 修复：给 `MysUser` 补上静态方法 `getCkUid`（用 cookie 调官方 `api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie` 查询绑定 UID，返回 `{status, msg, uids}`，逻辑与现有 `reqMysUid` 一致）
- **实测验证**：`[#检查ck状态][用户绑定(checkCkStatus)][完成2秒179]` → 回复 `CK:459573324 【正常】☑343200486`

### 4. 重要认知：`#签到` 命令不存在

- 当前 genshin 版本**未注册 `#签到` 命令**（底层有 `bbs_sign` API 但没暴露为命令），已从帮助中移除
- **米游社签到入口只在米游社 APP**（我的 → 每日签到），**网页端 miyoushe.com 没有签到入口**（产品设计）
- 需要机器人自动签到时需另装支持自动签到的插件

### 5. 补丁文件清单（升级 genshin/miao-plugin 后需重新应用）

| 文件 | 补丁内容 |
|------|---------|
| `plugins/genshin/apps/user.js:53` | 正则 `\\s` → `\s` |
| `plugins/genshin/model/mys/MysUser.js` | 新增 `static async getCkUid` 方法 |
| `plugins/miao-plugin/config/help.js` | 自定义帮助（新增绑定/扫码组） |

---

## 十二、追加进度（Day2 晚 19:00）— 帮助面板 v3 按绑定状态重排

### 1. 动机（用户指出分类问题）

- `#状态` 是 **TRSS 框架系统命令**（`lib/events/connect.js` 明示「#状态 查看运行状态」），却被放在「个人信息查询（需绑定Cookie）」组 —— 分类错误
- 管理员命令应与普通命令分离，避免混排
- 分组应**严格按绑定状态划分**：绑定 UID 相关 / 已绑定 Cookie 相关 / 无需绑定

### 2. 新版 7 组结构（已部署并实测生效）

| 组 | 条目数 | 内容 |
|----|--------|------|
| 账号绑定（新用户先看这里） | 3 | `#绑定UID #星铁绑定UID`、`#扫码登录 #扫码状态`、`#UID #绑定ck` |
| **已绑定UID可用** | 12 | 角色/面板/圣遗物/深渊/五星/幻想/抽卡记录/上传深渊数据 |
| **已绑定Cookie可用** | 8 | 体力/原石札记/检查ck状态/我的ck/留影叙佳期/深渊使用率/深渊配队/角色持有 |
| 资料查询 | 6 | 角色资料/图鉴/攻略/日历/公告兑换码（无需绑定） |
| 通用功能 | 7 | 十连/表情/老婆/幽境/月谕圣牌（无需绑定） |
| 系统与帮助 | 2 | `#状态`、`#帮助 #版本` |
| 管理命令，仅管理员可用 | 5 | 用户统计/喵喵设置/喵喵更新图像/配置公共ck/删除无效用户（auth: master） |

### 3. 命令绑定要求判定依据（源码级核实）

| 命令 | 绑定要求 | 依据 |
|------|---------|------|
| `#角色 #深渊 #五星 #幻想` | 仅 UID | genshin `role.js` 用 `this.e.uid`（Abyss/Weapon/RoleIndex 模型） |
| `#面板 #更新面板 #圣遗物` | 仅 UID | miao `profile.js` ProfileList/ProfileDetail |
| `#体力 #原石 #札记` | Cookie | genshin `dailyNote.js`/`ledger.js` 走 `getCkUidList` |
| `#深渊使用率 #深渊配队 #角色持有` | Cookie | miao `stat/` 各文件提示「请绑定ck后再使用」 |
| `#留影叙佳期` | Cookie+UID | genshin `takeBirthdayPhoto.js` 显式检查 |
| `#配置公共ck #使用全部ck` | master | genshin `setPubCk.js` `permission: "master"` |
| `#用户统计 #刷新用户统计 #删除无效用户` | master | genshin `userAdmin.js` `permission: "master"` |
| `#状态` | 系统命令 | TRSS `lib/events/connect.js`（不属于任何插件） |

### 4. 生效机制（重要认知）

miao-plugin `Data.importModule`（`components/Data.js:137`）加载 help 配置时带 `?t=${Date.now()}` **缓存破坏** → 每次 `#帮助` 都重新 import `config/help.js` → **改配置无需重启 TRSS，下一条 `#帮助` 即生效**。已实测（18:51 渲染新版成功）。

### 5. 同期入库

- `patches/redis-diagnose.sh`~`5.sh`：Redis 僵尸进程诊断（上次阻塞问题的排查工具）
- `patches/redis-restore-systemd.sh`：恢复 systemd Redis 托管
- `patches/fix-route-hijack.sh`：清除 FlClash TUN 残留 fake-ip 路由规则（lookup 127/128）
- 仓库同步：`plugins/miao-plugin-help.js` 更新为 v3，commit `f20105a` 已推送 GitHub

---

## 十三、追加进度（Day2 晚 19:30）— 十连卡池更新方法

### 1. 问题现象

QQ 发 `#十连`，抽到的角色来自 2025-04 之前的卡池，与 7.0 至冬卡池（奥黛塔 + 阿蕾奇诺复刻）不符。

### 2. 根因分析

- **「十连」命令**：genshin 插件 `apps/gacha.js` → `model/gachaData.js`
- **卡池数据**：`plugins/genshin/defSet/gacha/pool.yaml`（历史卡池列表，按时间倒序）
- **选择逻辑**（`gachaData.js getPool()`）：
  ```js
  let poolArr = gsCfg.getdefSet("gacha", "pool")
  poolArr = [...poolArr].reverse()
  let NowPool = poolArr.find(val => new Date().getTime() <= new Date(val.endTime).getTime()) || poolArr.pop()
  ```
  取 `endTime >= 当前时间` 的**第一个**池子（reverse 后即最近结束的池）；找不到则 fallback 到**最旧的池**。
- **故障原因**：pool.yaml 最新条目 endTime 是 **2025-04-15**，2026-08 时无任何池 `endTime >= now` → fallback 到数组最旧池 → 抽的全是远古池子。

### 3. 解决方案（已验证生效）

在 `pool.yaml` **顶部插入**当前卡池条目（例：7.0 上半 8.12–9.02）：

```yaml
- up4:
    - 阿罗夏
    - 罗莎莉亚
    - 琳妮特
  up5:
    - 奥黛塔
  up5_2:
    - 阿蕾奇诺
  weapon5:
    - 白湖冬羽
    - 赤月之形
  weapon4:
    - 西风剑
    - 祭礼大剑
    - 匣里灭辰
    - 祭礼残章
    - 弓藏
  endTime: "2026-09-02 17:59:59"
```

**字段含义**：`up5`（主 UP 五星）/ `up5_2`（第二个卡池 UP）/ `up4`（四星陪跑）/ `weapon5`（武器池双 UP）/ `weapon4`（四星武器）/ `endTime`（卡池结束时间，决定选中）。

**验证步骤**（脚本见 `patches/update-pool.sh` 及验证逻辑）：
1. 确认角色/武器名在 miao-plugin meta 数据中存在（`Character.get` / `Weapon.get` 返回非空，`imgs.gacha` 有图）
2. `endTime` 设为卡池**结束**时间（如 7.0 上半 9.02）
3. 改后**无需重启**：gsCfg `watch` 用 chokidar 监听，文件变化自动清缓存（日志 `[修改配置文件][defSet][gacha][pool]`）
4. 实测：QQ 发 `#十连`，应出现奥黛塔/阿蕾奇诺

### 4. 卡池数据现状与角色数据源

- miao-plugin 角色数据**已含 7.0 新角色**（奥黛塔 id 10000150、阿罗夏 id 10000150 段、奥黛塔专武「白湖冬羽」alias 标注「奥黛塔专武」）——**渲染头像无需额外下载**
- 注意：外部攻略页写的奥黛塔专武名「霜雪圆舞」是**错误推测**，正确名为「**白湖冬羽**」（miao alias.js:101 明示）
- 武器池 `weapon4` 四星武器可复用历史池常见武器（西风系列等），实际影响不大

### 5. 后续每次版本更新

1. 等新版本前瞻/实测确认卡池（五星、四星陪跑、武器、结束时间）
2. `bash patches/update-pool.sh`（改脚本内 NEW_ENTRY 后执行）或手动编辑 pool.yaml 顶部
3. 用 `node` 验证 `Character.get`/`Weapon.get` 可解析新名字
4. 仓库同步 `plugins/genshin/defSet/gacha/pool.yaml` + commit

---

## 十四、追加进度（Day2 晚 19:40）— 新增「清除模拟抽卡结果」指令

### 1. 需求

QQ 里想重置自己的模拟抽卡数据（保底计数、命定值、定轨、今日/本周次数），新增清除指令。

### 2. 数据存储（关键认知）

模拟抽卡用户数据存 **Redis**（非文件）：
- `key = Yz:genshin:gacha:{群号|private}:{QQ}`（`gachaData.js` 的 `key` getter，prefix 在 `model/base.js`）
- 结构：`permanent`/`role`/`weapon`（保底 num4/num5、isUp4/isUp5、weapon 含 lifeNum 命定值 + type 定轨）、`today`（今日次数，四点刷新）、`week`（本周五星数）
- TTL：14 天（`saveUser` 里 `setEx` 3600*24*14）
- 访问：全局 `redis` 对象（TRSS 提供，`redis.get/del/setEx` 可直接用）

### 3. 指令实现（`plugins/genshin/apps/gacha.js`）

```js
// rule 新增
{
  reg: "^#(清除|重置|清空)(十连|抽卡|抽奖|模拟抽卡)(结果|记录|数据)?$",
  fnc: "clearGacha",
},

// 方法
async clearGacha() {
  let Gacha = await GachaData.init(this.e)
  await redis.del(Gacha.key)  // 删除自己的抽卡数据
  let msg = "已清除模拟抽卡结果\n保底计数、命定值、定轨与今日/本周次数已重置"
  if (Gacha.user?.weapon?.type) msg += "\n（武器池定轨已取消）"
  this.reply(msg, false, { at: this.e.user_id })
}
```

**权限**：所有人可用，但只能清自己（key 带自己的 QQ，天然隔离）。
**命令别名**：`#清除十连` `#清除抽卡` `#清除抽卡结果` `#重置抽卡` `#清空十连` 等。

### 4. 生效机制（重要认知）

- **配置文件**（pool.yaml 等）：gsCfg chokidar 监听自动清缓存 → **无需重启**
- **插件代码**（apps/*.js）：genshin 有 `index.js` 入口，loader 把整个 genshin 当**单一插件**加载（`import('./apps/${file}')` 动态导入），apps 子文件**不走热重载** → **必须重启 TRSS**
- 重启命令：`kill -9 $(ss -tlnp | grep 2536 | grep -oE "pid=[0-9]+" | cut -d= -f2)` 后 `cd /root/yunzai/TRSS-Yunzai && setsid nohup node . > /root/trss.log 2>&1 < /dev/null &`

### 5. 验证

- `node --check` 语法 OK；`#重置用户统计`（userAdmin master 权限）与 `#重置抽卡` 正则不冲突
- `redis-cli del Yz:genshin:gacha:private:3242134533` → 返回 1，get 为空（恢复到初始状态，下次十连重建）
- 已重启 TRSS（19:14，pid 3061），QQ 实测 `#清除十连` 应回复「已清除模拟抽卡结果…」
- 仓库补丁：`patches/03-genshin-clear-gacha.patch`（升级 genshin 后重打 01+02+03）

---

## 十五、追加进度（Day2 晚 19:40）— 面板更新自动获取全部角色

### 1. 需求

已绑定 Cookie 的用户执行 `#更新面板` 时，应获取**全部角色**面板数据（而非仅游戏内展示的角色）。仅绑定 UID（无 Cookie）的用户维持原行为（仅展示角色）。

### 2. 现状分析（源码级）

| 命令 | fromMys | 服务 | 角色范围 |
|------|---------|------|---------|
| `#更新面板` | false | 默认服务（mgg/enka，按 profileServer 配置） | **仅展示角色**（依赖游戏内橱窗展示） |
| `#米游社更新面板` | true | mysPanel（米游社 API） | **全部角色** |

关键代码链：
- `apps/profile.js` profileRefresh → `ProfileList.doRefresh(e, false)`
- `ProfileList.doRefresh` → `player.refreshProfile(2, fromMys)` → `ProfileAvatar.refreshProfile` → `Serv.req(e, player, fromMys)`
- `Serv.getServ(uid, game, fromMys)`：`fromMys=true` 时强制返回 `mysPanel` 服务
- `ProfileReq.requestProfile` 的 `mysPanel` 分支：`mys.getCharacter()` 拿**全部角色 id** → `getCharacterDetail(character_ids)` 逐个获取

### 3. 实现方案（补丁 04）

在 `miao-plugin/apps/profile/ProfileList.js` 的 `doRefresh` 中，`fromMys=false` 时先探测用户是否绑定 Cookie：

```js
// 已绑定Cookie的用户，自动走米游社获取全部角色（而非仅展示角色）
if (!fromMys && e.runtime) {
  let oldNoTips = e.noTips
  e.noTips = true // 探测时静默，避免无Cookie用户被提示打扰
  try {
    let mys = await e.runtime.getMysInfo('cookie')
    if (mys && mys.ckInfo && mys.ckInfo.ck) {
      fromMys = true  // 有Cookie → 走米游社全部角色
    }
  } catch (err) {
    logger.error('自动切换米游社面板失败', err)
  } finally {
    e.noTips = oldNoTips
  }
}
```

**关键机制**：
- `e.runtime` 由 TRSS 框架注入（`lib/plugins/runtime.js:253` 每消息 `e.runtime = new Runtime(e)`）
- `e.runtime.getMysInfo('cookie')`：有 Cookie 返回 MysInfo 实例（`ckInfo.ck` 非空），无则返回（uid 空或 ck 空）
- **静默探测**：`e.noTips = true` 防止无 Cookie 用户收到「暂无可用CK」提示（`MysInfo.getSelfUid` / `checkReply` 会检查 noTips）
- 边界：`#米游社更新面板` 显式传 true 不受影响；无 Cookie 用户 `fromMys` 保持 false 行为不变

### 4. 生效方式

miao-plugin 有 `index.js` 入口（loader 视为单一插件，apps 子文件不走热重载）→ **修改后必须重启 TRSS**。已重启（19:23，pid 3613）。

### 5. 验证与入库

- `node --check` 语法 OK；启动日志无错误（46 个插件正常）
- 仓库：`patches/04-miao-profile-allchars.patch` + `apply-patches.sh` 已扩展支持 01-04 四个补丁
- README 补丁清单已更新；commit `b44ed16` 已推送 GitHub
- **建议实测**：QQ 发 `#更新面板`，观察日志是否出现 `面板服务：米游社`（说明走了全部角色路径），对比修改前（mgg/enka）
