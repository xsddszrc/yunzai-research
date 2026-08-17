// 拉取全部卡池记录，按时间排序，找第一条五星，展示入坑到第一个五星的记录
import md5 from '/root/yunzai/TRSS-Yunzai/node_modules/md5/index.js'
import fetch from '/root/yunzai/TRSS-Yunzai/node_modules/node-fetch/index.js'
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('/root/yunzai/TRSS-Yunzai/data/db/data.db', { readOnly: true })
const rows = db.prepare('SELECT ck, uids FROM MysUsers WHERE ltuid = 459573324').all()
db.close()
const ck = rows[0].ck
const uid = JSON.parse(rows[0].uids || '{}').gs?.[0]
const region = String(uid).slice(0, -8) === '5' ? 'cn_qd01' : 'cn_gf01'
const device = `Yz-${md5(uid).substring(0, 5)}`
const User_Agent = `Mozilla/5.0 (Linux; Android 12; ${device}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.73 Mobile Safari/537.36 miHoYoBBS/2.40.1`
function getDs(q = '', b = '') {
  const n = 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs'
  const t = Math.round(Date.now() / 1000)
  const r = Math.floor(Math.random() * 900000 + 100000)
  return `${t},${r},${md5(`salt=${n}&t=${t}&r=${r}&b=${b}&q=${q}`)}`
}
const body = JSON.stringify({ auth_appid: 'webview_gacha', game_biz: 'hk4e_cn', game_uid: uid, region })
const headers = {
  'x-rpc-app_version': '2.40.1', 'x-rpc-client_type': '5', 'User-Agent': User_Agent,
  Referer: 'https://app.mihoyo.com', Origin: 'https://webstatic.mihoyo.com',
  'X-Requested-With': 'com.mihoyo.hyperion', Host: 'api-takumi.mihoyo.com',
  Cookie: ck, 'Content-Type': 'application/json', DS: getDs('', body),
}
const authRes = await fetch('https://api-takumi.mihoyo.com/binding/api/genAuthKey', { method: 'POST', headers, body })
const authJson = await authRes.json()
const authkey = authJson.data?.authkey
if (!authkey) { console.log('authkey fail'); process.exit(1) }
console.log('✅ authkey 获取成功')

const gachaUrl = 'https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog?'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 池名映射
const poolName = { 301: '角色', 302: '武器', 500: '集录', 200: '常驻' }
const allRecords = []

async function pullPool(type) {
  let page = 1, endId = '0'
  while (page <= 100) {
    const params = new URLSearchParams({
      authkey_ver: 1, lang: 'zh-cn', gacha_type: type,
      page, size: 20, end_id: endId, authkey, region,
    })
    let json
    try {
      const res = await fetch(gachaUrl + params.toString(), { headers: { 'User-Agent': User_Agent } })
      json = await res.json()
    } catch (e) { console.log(`[${poolName[type]}] err @${page}:`, e.message); break }
    if (json.retcode !== 0) {
      console.log(`[${poolName[type]}] retcode=${json.retcode} @page=${page}`)
      if (json.retcode === -110) { await sleep(30000); continue }
      break
    }
    const list = json.data?.list || []
    if (!list.length) break
    for (const it of list) {
      allRecords.push({ ...it, pool: poolName[type] })
    }
    const newEnd = list[list.length - 1].id
    if (newEnd === endId) break
    endId = newEnd
    page++
    await sleep(400)
  }
  console.log(`[${poolName[type]}] 拉取完成`)
}

for (const t of [301, 302, 500, 200]) {
  await pullPool(t)
  await sleep(800)
}

console.log('\n共拉取记录:', allRecords.length, '条')

// 按时间排序（最早的在前）
allRecords.sort((a, b) => a.time.localeCompare(b.time))

// 找第一个五星（rank_type=5）
const fiveIdx = allRecords.findIndex(r => r.rank_type === '5')
console.log('第一个五星索引:', fiveIdx)

if (fiveIdx >= 0) {
  const firstFive = allRecords[fiveIdx]
  console.log(`\n🎉 第一个五星: ${firstFive.name} (${firstFive.pool}池) @ ${firstFive.time}`)
  console.log('   (rank_type:', firstFive.rank_type, ')')
} else {
  console.log('未找到五星记录')
  process.exit(0)
}

// 展示：从最早记录到第一个五星（最多 30 条）
const start = 0
const end = Math.min(fiveIdx + 1, allRecords.length)
console.log(`\n===== 从入坑第一条到第一个五星（共 ${end} 条，最早→最晚）=====`)
for (let i = start; i < end; i++) {
  const r = allRecords[i]
  const star = '★'.repeat(Number(r.rank_type))
  const is5 = r.rank_type === '5' ? ' ⭐五星' : ''
  console.log(`${String(i + 1).padStart(3)}. [${r.pool}] ${r.name} (${r.item_type}) ${star}${is5}  ${r.time}`)
}

// 统计：第一个五星前各池分布
console.log(`\n===== 第一个五星前的构成（${end} 条）=====`)
const before = allRecords.slice(0, end)
const byPool = {}
for (const r of before) {
  byPool[r.pool] = (byPool[r.pool] || 0) + 1
}
console.log(JSON.stringify(byPool, null, 2))

process.exit(0)
