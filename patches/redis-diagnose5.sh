#!/bin/bash
echo "=== all interfaces ==="
ip -brief link
echo
echo "=== table 127 ==="
ip route show table 127 2>&1 | head -10
echo "=== table 128 ==="
ip route show table 128 2>&1 | head -10
echo "=== main table detail ==="
ip route show table main 2>&1
echo
echo "=== connect via eth4 IP (bypass loopback) ==="
IP=$(ip -4 addr show eth4 | grep -oP 'inet \K[0-9.]+' | head -1)
echo "eth4 IP=$IP"
timeout 4 python3 - "$IP" <<'PYEOF'
import socket, sys
ip = sys.argv[1]
try:
    s = socket.create_connection((ip, 6379), 3)
    s.sendall(b"PING\r\n")
    s.settimeout(3)
    print("RECV via eth4:", s.recv(100))
except Exception as e:
    print("FAIL via eth4:", repr(e))
PYEOF
echo
echo "=== connect via ::1 (IPv6 loopback) ==="
timeout 4 python3 - <<'PYEOF'
import socket
try:
    s = socket.create_connection(("::1", 6379), 3)
    s.sendall(b"PING\r\n")
    s.settimeout(3)
    print("RECV via ::1:", s.recv(100))
except Exception as e:
    print("FAIL via ::1:", repr(e))
PYEOF
echo
echo "=== fib trie (loopback routes) ==="
ip -4 route show table local 2>&1 | head -15
echo "=== done ==="