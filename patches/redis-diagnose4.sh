#!/bin/bash
echo "=== iptables nat ==="
timeout 3 iptables -t nat -L -n 2>&1 | head -30
echo "=== nft ruleset ==="
timeout 3 nft list ruleset 2>&1 | head -40
echo "=== ip rule ==="
timeout 3 ip rule show 2>&1
echo "=== route table ==="
timeout 3 ip route 2>&1
echo "=== listening ports (all) ==="
ss -tlnp 2>/dev/null | head -25
echo "=== proxy-ish procs ==="
pgrep -af "clash|sing-box|tun2socks|v2ray|xray|trojan|hysteria" || echo "none"
echo "=== redis version + config from cmdline ==="
tr '\0' ' ' < /proc/9761/cmdline 2>/dev/null; echo
echo "=== sysctl overcommit ==="
cat /proc/sys/vm/overcommit_memory
echo "=== done ==="