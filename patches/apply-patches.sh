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
if grep -q '/^#\\\\s\*(检查|我的)\*c(oo)?k(ie)?(状态)\*$/i' "$GENSHIN/apps/user.js"; then
  python3 - "$GENSHIN/apps/user.js" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old = "/^#\\\\s*(检查|我的)*c(oo)?k(ie)?(状态)*$/i"
new = "/^#\\s*(检查|我的)*c(oo)?k(ie)?(状态)*$/i"
if old in src:
    src = src.replace(old, new)
    open(p, "w", encoding="utf-8").write(src)
    print("  正则已修复")
else:
    print("  未找到目标正则，尝试通用替换")
    if "\\\\s" in src:
        src = src.replace("\\\\s", "\\s")
        open(p, "w", encoding="utf-8").write(src)
        print("  已做 \\\\s -> \\s 全局替换")
    else:
        print("  无 \\\\s 字面量，跳过")
PYEOF
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

# 补丁5: 抽卡记录 cookie 一键获取（gachaLog.js 加 getAuthKeyByCk）
echo "---- 补丁5: Cookie一键获取抽卡记录 ----"
GACHA_LOG="$GENSHIN/model/gachaLog.js"
if ! grep -q 'getAuthKeyByCk' "$GACHA_LOG"; then
  python3 - "$GACHA_LOG" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()

# import md5
old_import = 'import fetch from "node-fetch"'
new_import = 'import fetch from "node-fetch"\nimport md5 from "md5"'
assert src.count(old_import) == 1, "import anchor not found"
src = src.replace(old_import, new_import)

# 新增 getAuthKeyByCk 方法
anchor = '  async logUrl() {'
method = '''  /**
   * 用已绑定Cookie（stoken）换取抽卡记录authkey
   * 端点: POST api-takumi.mihoyo.com/binding/api/genAuthKey (auth_appid: webview_gacha)
   * 参考: UIGF/mihoyo-api-collect + GenshinUID get_authkey_by_cookie
   */
  async getAuthKeyByCk() {
    if (!this.e.runtime) return false
    let mys
    try {
      let oldNoTips = this.e.noTips
      this.e.noTips = true // 静默探测，避免打扰
      mys = await this.e.runtime.getMysInfo('cookie')
      this.e.noTips = oldNoTips
    } catch (err) {
      logger.error('获取Cookie失败', err)
      return false
    }
    if (!mys || !mys.ckInfo?.ck) {
      return false
    }
    let uid = mys.uid || this.uid
    if (!uid) return false
    const region = String(uid).slice(0, -8) === '5' ? 'cn_qd01' : 'cn_gf01'
    const device = `Yz-${md5(uid).substring(0, 5)}`
    const User_Agent = `Mozilla/5.0 (Linux; Android 12; ${device}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.73 Mobile Safari/537.36 miHoYoBBS/2.40.1`

    const getDs = (q = '', b = '') => {
      const n = 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs' // LK2 salt
      const t = Math.round(Date.now() / 1000)
      const r = Math.floor(Math.random() * 900000 + 100000)
      return `${t},${r},${md5(`salt=${n}&t=${t}&r=${r}&b=${b}&q=${q}`)}`
    }

    const body = JSON.stringify({
      auth_appid: 'webview_gacha',
      game_biz: 'hk4e_cn',
      game_uid: uid,
      region,
    })
    const headers = {
      'x-rpc-app_version': '2.40.1',
      'x-rpc-client_type': '5',
      'User-Agent': User_Agent,
      Referer: 'https://app.mihoyo.com',
      Origin: 'https://webstatic.mihoyo.com',
      'X-Requested-With': 'com.mihoyo.hyperion',
      Host: 'api-takumi.mihoyo.com',
      Cookie: mys.ckInfo.ck,
      'Content-Type': 'application/json',
      DS: getDs('', body),
    }
    try {
      const res = await fetch('https://api-takumi.mihoyo.com/binding/api/genAuthKey', {
        method: 'POST',
        headers,
        body,
      })
      const json = await res.json()
      if (json.retcode === 0 && json.data?.authkey) {
        // 缓存 authkey（24小时）
        await redis.setEx(`${this.urlKey}${uid}`, 86400, json.data.authkey)
        logger.mark(`[抽卡记录] 已用Cookie获取authkey，uid:${uid}`)
        return json.data.authkey
      }
      logger.error(`[抽卡记录] genAuthKey失败 retcode:${json.retcode} ${json.message || ''}`)
    } catch (err) {
      logger.error('[抽卡记录] genAuthKey请求异常', err)
    }
    return false
  }

  async logUrl() {'''
assert src.count(anchor) == 1, "logUrl anchor not found"
src = src.replace(anchor, method)

# updateLog 兜底
old_update = '''  /** 更新抽卡记录 */
  async updateLog() {
    /** 获取authkey */
    let authkey = await redis.get(`${this.urlKey}${this.uid}`)
    if (!authkey) return false'''
new_update = '''  /** 更新抽卡记录 */
  async updateLog() {
    /** 获取authkey，缺失时自动用Cookie获取 */
    let authkey = await redis.get(`${this.urlKey}${this.uid}`)
    if (!authkey) {
      authkey = await this.getAuthKeyByCk()
    }
    if (!authkey) return false'''
assert src.count(old_update) == 1, "updateLog anchor not found"
src = src.replace(old_update, new_update)

# getGcLogData 兜底（#抽卡记录 无authkey时自动获取）
old_getdata = '''  async getGcLogData() {
    /** 卡池 */
    const { type, typeName } = this.getPool()
    /** 更新记录 */
    if (!this.isLogUrl) await this.updateLog()'''
new_getdata = '''  async getGcLogData() {
    /** 卡池 */
    const { type, typeName } = this.getPool()
    /** 更新记录（无authkey时自动用Cookie获取） */
    if (!this.isLogUrl) {
      let authkey = await redis.get(`${this.urlKey}${this.uid}`)
      if (!authkey) {
        authkey = await this.getAuthKeyByCk()
        if (authkey) {
          logger.mark(`[抽卡记录] #${this.e?.logFnc || '抽卡记录'} 已用Cookie自动获取authkey`)
        }
      }
      await this.updateLog()
    }'''
assert src.count(old_getdata) == 1, "getGcLogData anchor not found"
src = src.replace(old_getdata, new_getdata)

open(p, "w", encoding="utf-8").write(src)
PYEOF
  echo "  ✅ 已添加 Cookie 一键获取抽卡记录"
else
  echo "  ⏭ 已存在，跳过"
fi

# 补丁6: miao-plugin 修复（gachaStat 抢占 + 群内最强正则）
echo "---- 补丁6: miao-plugin 修复 ----"
# 6a: cfg_system.js 移除 gachaStat 的 miao 标记（修复 #抽卡记录 被抢占）
CFG_SYS="$MIAO/config/system/cfg_system.js"
if grep -q "gachaStat" "$CFG_SYS" && ! grep -q "已移除" "$CFG_SYS"; then
  python3 - "$CFG_SYS" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old = """      gachaStat: {
        title: '#抽卡分析 #抽卡统计',
        key: '抽卡',
        def: false,
        miao: true
      },"""
new = """      gachaStat: {
        title: '#抽卡分析 #抽卡统计',
        key: '抽卡',
        def: false
        // miao: true  # 已移除：TRSS 上会让 miao 抢占 genshin 的 #抽卡记录
      },"""
assert src.count(old) == 1, "gachaStat block not found"
src = src.replace(old, new)
open(p, "w", encoding="utf-8").write(src)
PYEOF
  echo "  ✅ 已修复 gachaStat 抢占"
else
  echo "  ⏭ 已处理或文件不同，跳过"
fi
# 6b: profile.js 群内最强正则 .+ → .*
PROFILE_JS="$MIAO/apps/profile.js"
if grep -q "(最强|最高|最高分|最牛|第一|极限)+.+/" "$PROFILE_JS"; then
  sed -i 's/\(最强|最高|最高分|最牛|第一|极限\)+.+\//\1+.*\//' "$PROFILE_JS"
  echo "  ✅ 已修复 #群内最强 正则"
else
  echo "  ⏭ 已修复或文件不同，跳过"
fi

# 补丁7: 禁用 genshin #xxx材料 命令（数据源停更）
echo "---- 补丁7: 禁用 #xxx材料 ----"
MATERIAL_JS="$GENSHIN/apps/material.js"
if grep -q 'reg: "^#?(星铁)?(.\*)(突破|材料|素材|培养)$"' "$MATERIAL_JS"; then
  python3 - "$MATERIAL_JS" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old = '''          reg: "^#?(星铁)?(.*)(突破|材料|素材|培养)$",
          fnc: "material",'''
new = '''          // 已禁用：数据源为米游社人工投稿合集，最新仅到V3.6（2023），新角色无数据
          reg: "^#?(星铁)?(突破|材料|素材|培养)$",
          fnc: "material",'''
assert src.count(old) == 1, "material rule not found"
src = src.replace(old, new)
open(p, "w", encoding="utf-8").write(src)
PYEOF
  echo "  ✅ 已禁用 #xxx材料"
else
  echo "  ⏭ 已禁用或文件不同，跳过"
fi

# 补丁8: miao gacha.js 移除 yzRule（修复 #抽卡记录 被抢占）
echo "---- 补丁8: miao gacha.js 移除 yzRule ----"
MIAO_GACHA="$MIAO/apps/gacha.js"
if grep -q 'yzRule' "$MIAO_GACHA"; then
  python3 - "$MIAO_GACHA" <<'PYEOF'
import sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
old = '''app.reg({
  detail: {
    name: '抽卡记录',
    fn: Gacha.detail,
    rule: /^#*(星铁)?喵喵(抽卡|抽奖|角色|武器|光锥|常驻|集录|up)+池?(记录|祈愿|分析)$/,
    yzRule: /^#*(星铁)?(抽卡|抽奖|角色|武器|光锥|常驻|集录|up)+池?(记录|祈愿|分析)$/,
    yzCheck: () => Cfg.get('gachaStat', false)
  },
  stat: {
    name: '抽卡统计',
    fn: Gacha.stat,
    rule: /^#*(星铁)?喵喵(全部|抽卡|抽奖|角色|武器|光锥|常驻|集录|up|版本)+池?统计$/,
    yzRule: /^#*(星铁)?(全部|抽卡|抽奖|角色|武器|光锥|常驻|集录|up|版本)+池?统计$/,
    yzCheck: () => Cfg.get('gachaStat', false)
  }
})'''
new = '''// 注：已删除 yzRule。TRSS 上 Version.isMiao=true 时 yzRule 无条件生效（yzCheck 不参与判断），
// 会抢占 genshin 的 #抽卡记录。普通 #抽卡记录 由 genshin 处理（支持 Cookie 一键获取）。
app.reg({
  detail: {
    name: '抽卡记录',
    fn: Gacha.detail,
    rule: /^#*(星铁)?喵喵(抽卡|抽奖|角色|武器|光锥|常驻|集录|up)+池?(记录|祈愿|分析)$/
  },
  stat: {
    name: '抽卡统计',
    fn: Gacha.stat,
    rule: /^#*(星铁)?喵喵(全部|抽卡|抽奖|角色|武器|光锥|常驻|集录|up|版本)+池?统计$/
  }
})'''
assert src.count(old) == 1, "miao gacha app.reg block not found"
src = src.replace(old, new)
open(p, "w", encoding="utf-8").write(src)
PYEOF
  echo "  ✅ 已移除 miao gacha yzRule"
else
  echo "  ⏭ 已处理，跳过"
fi

echo "==> 全部补丁应用完成。重启 TRSS 生效。"