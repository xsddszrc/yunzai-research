// 验证：用已绑定 Cookie（stoken）换取抽卡记录 authkey，并拉取抽卡记录
// 复用 genshin MysApi 的 getDs/getHeaders 逻辑
import md5 from '/root/yunzai/TRSS-Yunzai/node_modules/md5/index.js'
import fetch from '/root/yunzai/TRSS-Yunzai/node_modules/node-fetch/index.js'
import { DatabaseSync } from 'node:sqlite'

// 1. 读主号已绑定 Cookie（含 stoken）
const db = new DatabaseSync('/root/yunzai/TRSS-Yunzai/data/db/data.db', { readOnly: true })
const rows = db.prepare("SELECT ltuid, ck, uids FROM MysUsers WHERE ltuid = 459573324").all()
db.close()

if (!rows.length) {
  console.log('FAIL: 未找到已绑定 Cookie')
  process.exit(1)
}
const ck = rows[0].ck
const uids = JSON.parse(rows[0].uids || '{}')
const uid = (uids.gs || [])[0]
console.log('绑定 ltuid:', rows[0].ltuid, '| 游戏 uid:', uid)

// 检查 stoken 字段
const stokenMatch = ck.match(/stoken=([^;]+)/)
const stuidMatch = ck.match(/stuid=([^;]+)/)
if (!stokenMatch) {
  console.log('FAIL: Cookie 中无 stoken 字段')
  process.exit(1)
}
console.log('stoken 存在:', '是')

// 2. 构造请求头（复用 genshin getDs/getHeaders 逻辑）
const region = String(uid).slice(0, -8) === '5' ? 'cn_qd01' : 'cn_gf01'
const app_version = '2.40.1'
const device = `Yz-${md5(uid).substring(0, 5)}`
const User_Agent = `Mozilla/5.0 (Linux; Android 12; ${device}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.73 Mobile Safari/537.36 miHoYoBBS/2.40.1`

function getDs(q = '', b = '') {
  const n = 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs'
  const t = Math.round(Date.now() / 1000)
  const r = Math.floor(Math.random() * 900000 + 100000)
  const DS = md5(`salt=${n}&t=${t}&r=${r}&b=${b}&q=${q}`)
  return `${t},${r},${DS}`
}

// 3. 调 genAuthKey（用完整 Cookie，含 stoken）
const authUrl = 'https://api-takumi.mihoyo.com/binding/api/genAuthKey'
const body = JSON.stringify({
  auth_appid: 'webview_gacha',
  game_biz: 'hk4e_cn',
  game_uid: uid,
  region,
})

console.log('\n=== 请求 genAuthKey ===')
console.log('body:', body)
console.log('DS:', getDs('', body))

const headers = {
  'x-rpc-app_version': app_version,
  'x-rpc-client_type': '5',
  'User-Agent': User_Agent,
  Referer: 'https://app.mihoyo.com',
  Origin: 'https://webstatic.mihoyo.com',
  'X-Requested-With': 'com.mihoyo.hyperion',
  Host: 'api-takumi.mihoyo.com',
  Cookie: ck,
  'Content-Type': 'application/json',
  DS: getDs('', body),
}

let authkey = ''
try {
  const res = await fetch(authUrl, { method: 'POST', headers, body })
  const json = await res.json()
  console.log('genAuthKey 响应 retcode:', json.retcode, '| message:', json.message)
  if (json.retcode === 0 && json.data?.authkey) {
    authkey = json.data.authkey
    console.log('✅ 获得 authkey（前30字符）:', authkey.slice(0, 30) + '...')
    console.log('   authkey_ver:', json.data.authkey_ver)
  } else {
    console.log('❌ 获取 authkey 失败:', JSON.stringify(json).slice(0, 300))
  }
} catch (e) {
  console.log('❌ 请求异常:', e.message)
}

// 4. 用 authkey 调 getGachaLog 拉取角色池记录（第一页）
if (authkey) {
  console.log('\n=== 请求 getGachaLog ===')
  // 与 genshin gachaLog.js logApi 保持一致：public-operation 域名 + 纯 URL 参数
  const gachaUrl = 'https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog?'
  const params = new URLSearchParams({
    authkey_ver: 1,
    lang: 'zh-cn',
    gacha_type: 301,
    page: 1,
    size: 10,
    end_id: 0,
    authkey,
    region,
  })
  try {
    const res = await fetch(gachaUrl + params.toString(), {
      headers: { 'User-Agent': User_Agent },
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      console.log('❌ 非 JSON 响应:', text.slice(0, 200))
      process.exit(1)
    }
    console.log('getGachaLog retcode:', json.retcode, '| message:', json.message)
    if (json.retcode === 0 && json.data?.list?.length) {
      console.log('✅ 抽卡记录获取成功！本页', json.data.list.length, '条')
      const first = json.data.list[0]
      console.log('第一条:', JSON.stringify({ name: first.name, item_type: first.item_type, rank_type: first.rank_type, time: first.time }))
      console.log('该池总记录数:', json.data.total || '?')
    } else {
      console.log('❌ 记录获取失败:', JSON.stringify(json).slice(0, 300))
    }
  } catch (e) {
    console.log('❌ getGachaLog 异常:', e.message)
  }
}
process.exit(0)
