#!/bin/bash
echo "=== test: redis on port 6380 ==="
redis-server --port 6380 --daemonize yes --save '' --appendonly no 2>&1
sleep 1
timeout 5 redis-cli -p 6380 ping
echo "port_6380_exit=$?"
redis-cli -p 6380 shutdown nosave 2>/dev/null
echo "=== iptables nat rules ==="
iptables -t nat -L -n 2>&1 | head -20
echo "=== ip rule / tun iface ==="
ip -brief addr 2>/dev/null | head -10
ip rule show 2>/dev/null | head -10
echo "=== clash-ish procs in WSL ==="
pgrep -af "clash|FlClash|tun2socks|sing-box|v2ray|xray" || echo "none"
echo "=== test 6379 with timeout cat ==="
timeout 4 bash -c 'exec 3<>/dev/tcp/127.0.0.1/6379; printf "PING\r\n" >&3; cat <&3' | head -c 100
echo "exit=$?"
echo "=== done ==="