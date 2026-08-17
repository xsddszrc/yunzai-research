#!/bin/bash
echo "=== stop manual test instances ==="
redis-cli -p 6379 shutdown nosave 2>/dev/null || pkill -9 -f "redis-server \*:6379" 2>/dev/null
redis-cli -p 6380 shutdown nosave 2>/dev/null || pkill -9 -f "redis-server \*:6380" 2>/dev/null
sleep 2
echo "=== ensure systemd redis up ==="
systemctl enable redis-server 2>&1 | tail -1
systemctl start redis-server 2>&1
sleep 2
systemctl is-active redis-server
echo "=== verify PING via 127.0.0.1 ==="
timeout 5 redis-cli -h 127.0.0.1 -p 6379 ping
echo "ping_exit=$?"
echo "=== port 6379 owner ==="
ss -tlnp | grep 6379
echo "=== done ==="