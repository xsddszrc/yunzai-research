#!/bin/bash
# 应用 genshin / miao-plugin 插件补丁（升级插件后重新执行）
# 用法: bash apply-patches.sh <TRSS-Yunzai根目录>
# 示例: bash apply-patches.sh /root/yunzai/TRSS-Yunzai

set -e
TRSS_ROOT="${1:?用法: bash apply-patches.sh <TRSS-Yunzai根目录>}"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
GENSHIN="$TRSS_ROOT/plugins/genshin"
MIAO="$TRSS_ROOT/plugins/miao-plugin"

echo "==> 应用补丁到 $GENSHIN"

# 补丁1: #检查ck状态 正则修复 (\\s -> \s)
echo "---- 补丁1: 正则修复 (\\s -> \s) ----"
if grep -q '/^#\\s\*(检查|我的)\*c(oo)?k(ie)?(状态)\*$/i' "$GENSHIN/apps/user.js"; then
  sed -i 's|/^#\\s\*(检查|我的)\*c(oo)?k(ie)?(状态)\*$/i|/^#\s*(检查|我的)*c(oo)?k(ie)?(状态)*$/i|' "$GENSHIN/apps/user.js"
  echo "  ✅ 已修复"
else
  echo "  ⏭ 已修复或文件不同，跳过"
fi

# 补丁2: 补 MysUser.getCkUid 静态方法
echo "---- 补丁2: 补齐 MysUser.getCkUid ----"
if ! grep -q 'static async getCkUid' "$GENSHIN/model/mys/MysUser.js"; then
  python3 - "$GENSHIN/model/mys/MysUser.js" <<'PYEOF'
import sys
p = sys.argv[1]
with open(p, encoding="utf-8") as f:
    content = f.read()
method = """  /**
   * 通过CK查询绑定的游戏UID（补齐上游缺失的静态方法）
   * @param ck 米游社Cookie
   * @returns {Promise<{status:number, msg:string, uids:number[]}>}
   */
  static async getCkUid(ck, isDetail = false, isLimit = false) {
    let uids = []
    let err = (msg, status = 2) => {
      return { status, msg, uids }
    }
    if (!ck) return err("CK为空")

    let res = null
    let msg = "error"
    const roleUrls = {
      mys: "https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie",
      hoyolab: "https://sg-public-api.hoyolab.com/binding/api/getUserGameRolesByCookie",
    }
    for (let serv of ["mys", "hoyolab"]) {
      try {
        const roleRes = await fetch(roleUrls[serv], { method: "get", headers: { Cookie: ck } })
        if (!roleRes?.ok) continue
        const json = await roleRes.json()
        if (json?.retcode === 0) {
          res = json
          break
        }
        if (json?.retcode * 1 === -100) msg = "该ck已失效，请重新登录获取"
        msg = json?.message || "error"
      } catch {
        continue
      }
    }
    if (!res) return err(msg)

    const playerList = (res?.data?.list || []).filter(v =>
      ["hk4e_cn", "hkrpg_cn", "nap_cn", "nap_global", "hk4e_global", "hkrpg_global"].includes(v?.game_biz),
    )
    if (!playerList || playerList.length <= 0) {
      return err("该账号尚未绑定原神、星穹或绝区零 角色")
    }
    uids = playerList.map(v => v.game_uid)
    return { status: 0, msg: "", uids }
  }

"""
anchor = "  /**\n   * 检查CK状态"
idx = content.find(anchor)
if idx == -1:
    raise SystemExit("未找到插入锚点")
content = content[:idx] + method + content[idx:]
with open(p, "w", encoding="utf-8") as f:
    f.write(content)
PYEOF
  echo "  ✅ 已补齐"
else
  echo "  ⏭ 已存在，跳过"
fi

# 补丁3: 新增 #清除十连 指令（清除模拟抽卡结果）
echo "---- 补丁3: #清除十连 指令 ----"
if ! grep -q 'clearGacha' "$GENSHIN/apps/gacha.js"; then
  python3 - "$GENSHIN/apps/gacha.js" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old_rule = """        {
          reg: "(^#*定轨|^#定轨(.*))$",
          fnc: "weaponBing",
        },
      ],"""
new_rule = """        {
          reg: "(^#*定轨|^#定轨(.*))$",
          fnc: "weaponBing",
        },
        {
          reg: "^#(清除|重置|清空)(十连|抽卡|抽奖|模拟抽卡)(结果|记录|数据)?$",
          fnc: "clearGacha",
        },
      ],"""
old_method = """    this.reply(msg, false, { at: this.e.user_id })
  }

  /** 初始化创建配置文件 */"""
new_method = """    this.reply(msg, false, { at: this.e.user_id })
  }

  /** #清除十连 清除模拟抽卡结果（仅自己） */
  async clearGacha() {
    let Gacha = await GachaData.init(this.e)
    /** 删除自己的抽卡数据（保底/命定/定轨/今日本周次数全部重置） */
    await redis.del(Gacha.key)

    let msg = "已清除模拟抽卡结果\\n保底计数、命定值、定轨与今日/本周次数已重置"
    if (Gacha.user?.weapon?.type) {
      msg += "\\n（武器池定轨已取消）"
    }
    this.reply(msg, false, { at: this.e.user_id })
  }

  /** 初始化创建配置文件 */"""
assert src.count(old_rule) == 1, "rule block not found"
assert src.count(old_method) == 1, "method block not found"
src = src.replace(old_rule, new_rule).replace(old_method, new_method)
open(p, "w", encoding="utf-8").write(src)
PYEOF
  echo "  ✅ 已添加 #清除十连"
else
  echo "  ⏭ 已存在，跳过"
fi

# 补丁4: miao-plugin 已绑定Cookie用户更新面板自动获取全部角色
echo "---- 补丁4: 面板更新全部角色（miao-plugin ProfileList.js）----"
PROFILE_LIST="$MIAO/apps/profile/ProfileList.js"
if ! grep -q '自动切换米游社面板失败' "$PROFILE_LIST"; then
  python3 - "$PROFILE_LIST" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old = """    // 数据更新
    let player = Player.create(e)
    await player.refreshProfile(2, fromMys)    """
new = """    // 已绑定Cookie的用户，自动走米游社获取全部角色（而非仅展示角色）
    if (!fromMys && e.runtime) {
      let oldNoTips = e.noTips
      e.noTips = true // 探测时静默，避免无Cookie用户被提示打扰
      try {
        let mys = await e.runtime.getMysInfo('cookie')
        if (mys && mys.ckInfo && mys.ckInfo.ck) {
          fromMys = true
        }
      } catch (err) {
        logger.error('自动切换米游社面板失败', err)
      } finally {
        e.noTips = oldNoTips
      }
    }

    // 数据更新
    let player = Player.create(e)
    await player.refreshProfile(2, fromMys)    """
assert src.count(old) == 1, "doRefresh block not found"
src = src.replace(old, new)
open(p, "w", encoding="utf-8").write(src)
PYEOF
  echo "  ✅ 已添加全部角色逻辑"
else
  echo "  ⏭ 已存在，跳过"
fi

echo "==> 全部补丁应用完成。重启 TRSS 生效。"