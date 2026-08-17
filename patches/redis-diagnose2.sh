#!/bin/bash
echo "=== est conns on 6379 ==="
ss -tn '( sport = :6379 )' 2>/dev/null
echo "=== all 6379 sockets ==="
ss -tlnp | grep 6379
echo "=== disk ==="
df -h / | tail -2
echo "=== redis data dir ==="
ls -la /var/lib/redis 2>/dev/null | head -10
echo "=== python PING test ==="
timeout 6 python3 - <<'PYEOF'
import socket
try:
    s = socket.create_connection(("127.0.0.1", 6379), 3)
    s.sendall(b"PING\r\n")
    s.settimeout(3)
    data = s.recv(100)
    print("RECV:", data)
except Exception as e:
    print("FAIL:", repr(e))
PYEOF
echo "=== redis procs ==="
pgrep -af redis-server
echo "=== done ==="