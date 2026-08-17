#!/bin/bash
set -x
echo "=== before ==="
ip rule show | head -20

# 删除 FlClash TUN 残留的 fake-ip 路由规则（lookup 127/128）
ip rule del from all ipproto tcp lookup 127 2>/dev/null
ip rule del from all ipproto udp lookup 127 2>/dev/null
ip rule del from all ipproto tcp lookup 128 2>/dev/null
ip rule del from all ipproto udp lookup 128 2>/dev/null

echo "=== after rule del ==="
ip rule show | head -20

# 清理残留的 table 127/128 路由条目（如存在）
ip route flush table 127 2>/dev/null
ip route flush table 128 2>/dev/null

echo "=== table 127 after flush ==="
ip route show table 127 2>&1 | head -5
echo "=== table 128 after flush ==="
ip route show table 128 2>&1 | head -5

echo "=== verification: PING via 127.0.0.1 ==="
timeout 4 python3 - <<'PYEOF'
import socket
try:
    s = socket.create_connection(("127.0.0.1", 6379), 3)
    s.sendall(b"PING\r\n")
    s.settimeout(3)
    print("RECV 127.0.0.1:", s.recv(100))
except Exception as e:
    print("FAIL:", repr(e))
PYEOF
echo "=== done ==="