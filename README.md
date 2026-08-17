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
│   ├── genshin/              # 原神绑定插件（已含两个 bug 修复补丁）
│   ├── mys-qr-login/         # 米游社扫码登录插件（第三方，已安全审查）
│   └── miao-plugin-help.js   # miao-plugin 自定义帮助配置（含绑定/扫码组）
├── config/
│   ├── napcat_start.sh       # NapCat 启动脚本（密码登录+清代理+xvfb）
│   ├── napcat-onebot11.json  # NapCat OneBot WS 客户端配置模板
│   ├── trss-other.yaml       # TRSS 主人/权限配置模板
│   ├── trss-group.yaml       # TRSS 群聊触发配置模板
│   ├── trss-server.yaml      # TRSS 服务器端口配置模板
│   ├── trss-redis.yaml       # Redis 配置模板
│   └── puppeteer-config.yaml # TRSS 渲染器配置（chromiumPath）
├── patches/
│   ├── 01-genshin-regex-fix.patch   # #检查ck状态 正则修复
│   ├── 02-genshin-getckuid.patch    # 补 MysUser.getCkUid 静态方法
│   └── apply-patches.sh             # 一键应用补丁脚本
└── docs/
    └── Yunzai机器人研究总结.md      # 完整研究总结（部署/玩法/踩坑/性能）
```

## 快速部署

完整可复现步骤见 `docs/Yunzai机器人研究总结.md` 第四节。核心链路：

1. **环境**：Node ≥ 23.11 + pnpm@9 + Redis + Chromium
2. **TRSS-Yunzai**：`git clone https://github.com/TimeRainStarSky/Yunzai` + `pnpm install -P`
3. **NapCat**：官方安装器 + `NAPCAT_QUICK_PASSWORD` 密码登录（首次需 WebUI 扫码验证设备）
4. **连接**：NapCat `onebot11_<QQ>.json` 配置 `websocketClients` → `ws://127.0.0.1:2536/OneBotv11`
5. **插件**：复制本仓库 `plugins/` 下 genshin、mys-qr-login；miao-plugin 单独安装
6. **渲染**：`renderers/puppeteer/config.yaml` 设 `chromiumPath`
7. **补丁**：`bash patches/apply-patches.sh <TRSS根目录>`

## 关键修复记录

| 问题 | 修复 |
|------|------|
| icqq 老协议登录被拒（错误码45） | 换 NapCat（NTQQ 内核） |
| ws-plugin 无法灌入 NapCat 消息 | 换 TRSS-Yunzai（原生 OneBotv11） |
| `#检查ck状态` 无法触发 | 正则 `\\s`→`\s`（补丁1） |
| `#检查ck状态` 触发即崩溃 | 补 `MysUser.getCkUid` 静态方法（补丁2） |
| `#绑定` 不生效 | TRSS 缺 genshin 插件（本仓库已含） |
| QQ 反复掉线 | 本机 FlClash fake-IP DNS 劫持，关闭即恢复 |

## 安全说明

- 配置模板已脱敏（QQ 密码不入库，QQ 号为占位符）
- mys-qr-login 已做安全审查：仅访问官方 `passport-api.mihoyo.com`，28/28 测试通过
- genshin 插件无运行时数据（cookie/UID 存于服务器 data 目录，不入库）

## 许可

本项目仓库整体采用 **GPL-3.0**（见 LICENSE 文件），以兼容仓库内各组件的上游许可：

| 组件 | 上游许可 |
|------|---------|
| TRSS-Yunzai（部署框架，未入库） | GPL-3.0 |
| mys-qr-login（扫码登录插件） | GPL-3.0（TwiceDrop/mhy-qdcode-to-cookie） |
| miao-plugin（喵喵插件，仅 help.js 配置入库） | MIT（Copyright 2023 Yoimiya） |
| genshin（绑定插件） | 上游未声明，社区惯例自由使用 |

> 本仓库仅用于学习研究；部署与使用请遵循各上游项目许可及 QQ/米游社平台规范。
