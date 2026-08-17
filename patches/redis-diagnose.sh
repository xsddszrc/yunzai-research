#!/bin/bash
# Redis 僵尸诊断脚本
echo "=== proc state (pid 9665) ==="
ps -o pid,ppid,stat,wchan:30,%cpu,%mem,etime,cmd -p 9665 2>/dev/null || echo "pid 9665 gone"

echo "=== all redis procs ==="
pgrep -af redis-server || echo "none"

echo "=== journal redis-server recent ==="
journalctl -u redis-server --no-pager -n 15 2>&1 | tail -15

echo "=== raw TCP PING test (3s) ==="
timeout 3 bash -c 'exec 3<>/dev/tcp/127.0.0.1/6379 && printf "PING\r\n" >&3 && timeout 3 head -c 50 <&3' 2>&1
echo "tcp_exit=$?"

echo "=== config dir ==="
ls -la /etc/redis/ 2>/dev/null

echo "=== done ==="