# TRSS-Yunzai 米游社扫码登录

在群聊中生成米游社通行证二维码。用户扫码确认后，插件会自动撤回二维码，把 Cookie
写入 Yunzai-genshin 的用户数据；miao-plugin 会通过 Yunzai runtime 直接读取该 Cookie。

插件使用当前的 Passport `createQRLogin / queryQRLoginStatus` 流程。旧版游戏二维码接口会在
查询阶段持续返回 `-3503`，因此不再使用旧版原神、崩铁、绝区零 `app_id` 创建二维码。
三个游戏命令仍作为兼容入口保留，但底层生成的是同一种米游社通行证二维码；手机确认页可能
显示“米游社”或“HoYoPlay”，不会保证显示命令中的游戏名称。

## 前置条件

- TRSS-Yunzai 3.1.x，Node.js 18 或更高版本
- 已安装并更新 `plugins/genshin`
- 已安装并更新 `plugins/miao-plugin`
- 国服米游社账号；暂不支持国际服 HoYoLAB

## 安装

将整个 `mys-qr-login` 目录复制到 TRSS-Yunzai 的 `plugins` 目录：

```text
TRSS-Yunzai/
└─ plugins/
   └─ mys-qr-login/
```

在 TRSS-Yunzai 根目录安装依赖并重启：

```bash
pnpm install
pnpm restart
```

Windows 也可以在本仓库根目录运行一键安装脚本（路径包含空格时保留双引号）：

```bat
install.bat "D:\path\to\TRSS-Yunzai"
```

## 使用

群内发送：

```text
#扫码登录
```

机器人会列出三个兼容入口：

```text
#扫码登录原神
#扫码登录崩铁
#扫码登录绝区零
```

也支持 `#扫码登录 星铁`、`#扫码登录 星穹铁道`、`#扫码登录 绝区` 等别名。

扫码过程中可发送：

```text
#扫码状态
```

同一机器人账号下，每个 QQ 用户同时只能进行一个任务，不同用户可以并发登录。二维码最长
保留 120 秒；即使服务端 URL 返回异常的超长 `expire`，插件也会应用本地 120 秒上限。
确认、取消、服务端过期或本地超时后，插件会精确撤回二维码消息并 `@` 发起者告知结果。

确认成功后，插件直接使用 Passport 返回的 SToken/MID 换取 LToken 与 Cookie Token，生成
包含 `ltoken`、`ltuid`、`cookie_token`、`account_id`、`stoken`、`stuid` 和 `mid` 的 Cookie，
再交给 Yunzai-genshin 校验、刷新角色并保存。

## 安全说明

- 群二维码无法限制只有被 `@` 的用户扫描，扫码账号最终会绑定到命令发起者的 QQ。
- 插件不会在聊天或日志中输出 Cookie、SToken、MID 或二维码原始载荷。
- Cookie 只保存到 Yunzai-genshin 使用的数据库与缓存，不额外创建明文 Cookie 文件。
- 请确保机器人主机、Redis 与数据库文件仅受信任管理员可以访问。

## 验证

扫码成功后可使用 `#uid`、`#体力` 或 miao-plugin 的面板命令确认账号已同步。

开发测试：

```bash
pnpm test
```
