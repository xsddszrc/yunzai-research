#!/bin/bash
# NapCat 启动脚本（模板，脱敏）
# 使用前替换：<QQ密码> 为机器人 QQ 密码，<机器人QQ> 为 QQ 号
# 放置位置：/root/napcat_start.sh
export DISPLAY=:99
export NAPCAT_QUICK_PASSWORD=<QQ密码>
# 关键：清除 Windows 继承的代理环境变量（QQ/Chromium 会读取它们导致协议连接被破坏）
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY no_proxy NO_PROXY
pkill -f "qq --no-sandbox" 2>/dev/null
pkill -f "Xvfb" 2>/dev/null
sleep 2
cd /root/Napcat/opt/QQ
exec xvfb-run -a ./qq --no-sandbox -q <机器人QQ> 2>&1 | tee /root/napcat_run.log
