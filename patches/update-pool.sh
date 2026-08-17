#!/bin/bash
# 在 pool.yaml 顶部插入 7.0 上半卡池条目
POOL=/root/yunzai/TRSS-Yunzai/plugins/genshin/defSet/gacha/pool.yaml
BAK=${POOL}.bak-v2025
[ -f "$BAK" ] || cp "$POOL" "$BAK"

NEW_ENTRY='- up4:
    - 阿罗夏
    - 罗莎莉亚
    - 琳妮特
  up5:
    - 奥黛塔
  up5_2:
    - 阿蕾奇诺
  weapon5:
    - 白湖冬羽
    - 赤月之形
  weapon4:
    - 西风剑
    - 祭礼大剑
    - 匣里灭辰
    - 祭礼残章
    - 弓藏
  endTime: "2026-09-02 17:59:59"
'

# 用临时文件拼接：新条目 + 原内容
{ printf '%s' "$NEW_ENTRY"; cat "$POOL"; } > /tmp/pool-new.yaml
mv /tmp/pool-new.yaml "$POOL"

echo "=== 验证：前 20 行 ==="
head -20 "$POOL"
echo
echo "=== 条目数 ==="
grep -c '^- up4:' "$POOL"
echo
echo "=== endTime 列表（前3条）==="
grep -n "endTime" "$POOL" | head -3
