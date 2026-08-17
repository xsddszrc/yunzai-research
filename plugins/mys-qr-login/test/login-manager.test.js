import assert from "node:assert/strict"
import test from "node:test"

import { CookieBindingError, MissingDependencyError } from "../lib/bind-cookie.js"
import { QrLoginManager } from "../lib/login-manager.js"
import { MihoyoApiError } from "../lib/mihoyo-api.js"

function createEvent(overrides = {}) {
  const recalled = []
  return {
    event: {
      isGroup: true,
      self_id: "bot-1",
      user_id: "user-1",
      group: {
        recallMsg: async id => recalled.push(id),
      },
      ...overrides,
    },
    recalled,
  }
}

function confirmedStatus() {
  return {
    retcode: 0,
    data: {
      stat: "Confirmed",
      payload: {
        raw: JSON.stringify({
          uid: "123456789",
          mid: "mid-secret",
          stoken: "stoken-secret",
        }),
      },
    },
  }
}

function createHarness({ statuses = [], apiOverrides = {}, managerOverrides = {}, eventOverrides = {} } = {}) {
  const replies = []
  const actions = []
  const logs = []
  const { event, recalled } = createEvent(eventOverrides)
  const api = {
    createDeviceId: () => "device-1",
    createQr: async () => {
      actions.push(["create"])
      return {
        url: "https://example.test/qr?ticket=ticket-1",
        ticket: "ticket-1",
        expiresAt: Date.now() + 60_000,
      }
    },
    queryQr: async () => {
      actions.push(["query"])
      return statuses.shift()
    },
    exchangeQrLogin: async payload => {
      actions.push(["exchange", payload.uid])
      return {
        accountId: "123456789",
        cookie: "ltoken=ltoken-secret;ltuid=123456789;cookie_token=cookie-secret;account_id=123456789;stoken=stoken-secret;stuid=123456789;mid=mid-secret;",
      }
    },
    ...apiOverrides,
  }
  const sessions = new Map()
  const manager = new QrLoginManager({
    api,
    sessions,
    toDataUrl: async () => "data:image/png;base64,QRDATA",
    makeImage: data => ({ type: "image", file: data }),
    loadBinder: async () => async data => {
      actions.push(["bind", data.accountId])
    },
    sleep: async () => {},
    logger: {
      info: message => logs.push(message),
      warn: message => logs.push(message),
    },
    pollIntervalMs: 0,
    ...managerOverrides,
  })
  const defaultChannel = { key: "genshin", name: "原神" }
  const originalStart = manager.start.bind(manager)
  manager.start = options => originalStart({ channel: defaultChannel, ...options })
  const reply = async (message, data) => {
    replies.push({ message, data })
    actions.push(["reply", typeof message === "string" ? message : "qr"])
    return { message_id: Array.isArray(message) ? "qr-message" : `message-${replies.length}` }
  }
  return {
    manager,
    api,
    sessions,
    event,
    recalled,
    replies,
    actions,
    logs,
    reply,
    defaultChannel,
  }
}

test("群聊确认登录后先撤回二维码，再写入 Cookie 并提示成功", async () => {
  const harness = createHarness({
    statuses: [
      { retcode: 0, data: { stat: "Init", payload: { raw: "" } } },
      { retcode: 0, data: { stat: "Scanned", payload: { raw: "" } } },
      {
        retcode: 0,
        data: {
          stat: "Confirmed",
          payload: {
            raw: JSON.stringify({
              uid: "123456789",
              mid: "mid-secret",
              stoken: "stoken-secret",
            }),
          },
        },
      },
    ],
  })
  harness.event.group.recallMsg = async id => {
    harness.recalled.push(id)
    harness.actions.push(["recall", id])
  }

  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.deepEqual(harness.recalled, ["qr-message"])
  assert.equal(harness.replies[0].data.at, true)
  assert.match(harness.replies[0].message[0], /当前扫码入口：原神（米游社通行证）/)
  assert.equal(harness.replies[0].message[1].file, "base64://QRDATA")
  assert.ok(harness.replies.some(item => item.message === "二维码已扫描，请在米游社中确认登录。"))
  assert.ok(
    harness.replies.some(
      item => item.message === "原神入口登录完成，Cookie 已安全同步至 miao-plugin。",
    ),
  )
  assert.ok(
    harness.actions.findIndex(item => item[0] === "recall") <
      harness.actions.findIndex(item => item[0] === "bind"),
  )
  assert.equal(harness.sessions.size, 0)
  assert.ok(harness.actions.some(item => item[0] === "create"))
  assert.ok(harness.actions.some(item => item[0] === "query"))
  assert.deepEqual(
    harness.logs.filter(item => /QR_STATUS_|TOKEN_EXCHANGE_|COOKIE_BIND_/.test(item)),
    [
      "[mys-qr-login] QR_STATUS_INIT",
      "[mys-qr-login] QR_STATUS_SCANNED",
      "[mys-qr-login] QR_STATUS_CONFIRMED",
      "[mys-qr-login] TOKEN_EXCHANGE_STARTED",
      "[mys-qr-login] TOKEN_EXCHANGE_OK",
      "[mys-qr-login] COOKIE_BIND_STARTED",
      "[mys-qr-login] COOKIE_BIND_OK",
    ],
  )
  assert.doesNotMatch(JSON.stringify(harness.replies), /mid-secret|stoken-secret|cookie-secret/)
  assert.doesNotMatch(harness.logs.join("\n"), /mid-secret|stoken-secret|cookie-secret/)
})

test("三个游戏命令保留入口名称但共用 Passport 扫码会话", async () => {
  const harness = createHarness({ statuses: [{ retcode: -106, message: "ExpiredCode" }] })
  const channel = { key: "zenless", name: "绝区零" }

  await harness.manager.start({
    event: harness.event,
    reply: harness.reply,
    channel,
  })

  assert.ok(harness.actions.some(item => item[0] === "create"))
  assert.ok(harness.actions.some(item => item[0] === "query"))
  assert.match(harness.replies[0].message[0], /当前扫码入口：绝区零（米游社通行证）/)
  assert.ok(harness.logs.includes("[mys-qr-login] QR_CREATED_PASSPORT"))
})

test("服务端报告二维码过期时撤回并提示重试", async () => {
  const harness = createHarness({ statuses: [{ retcode: -106, message: "ExpiredCode" }] })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.deepEqual(harness.recalled, ["qr-message"])
  assert.ok(
    harness.replies.some(item => item.message === "二维码已过期，请重新发送 #扫码登录。"),
  )
  assert.equal(harness.sessions.size, 0)
})

test("Passport 的 -3501 过期状态会立即撤回二维码", async () => {
  const harness = createHarness({ statuses: [{ retcode: -3501, message: "expired" }] })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.deepEqual(harness.recalled, ["qr-message"])
  assert.ok(harness.replies.some(item => /二维码已过期/.test(String(item.message))))
  assert.equal(harness.sessions.size, 0)
})

test("Passport 的 -3505 取消状态会撤回二维码并提示已取消", async () => {
  const harness = createHarness({ statuses: [{ retcode: -3505, message: "canceled" }] })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.deepEqual(harness.recalled, ["qr-message"])
  assert.ok(harness.replies.some(item => /已取消扫码登录/.test(String(item.message))))
  assert.equal(harness.sessions.size, 0)
})

test("本地达到二维码截止时间时不再请求并自动撤回", async () => {
  let now = 0
  let queryCount = 0
  const harness = createHarness({
    apiOverrides: {
      createQr: async () => ({ url: "https://example.test/qr", ticket: "ticket-1", expiresAt: 10 }),
      queryQr: async () => {
        queryCount++
      },
    },
    managerOverrides: {
      now: () => now,
      sleep: async () => {
        now = 10
      },
      pollIntervalMs: 10,
    },
  })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.equal(queryCount, 0)
  assert.deepEqual(harness.recalled, ["qr-message"])
  assert.ok(harness.replies.some(item => /二维码已过期/.test(String(item.message))))
})

test("一次短暂网络错误后继续轮询并成功", async () => {
  let queryCount = 0
  const harness = createHarness({
    apiOverrides: {
      queryQr: async () => {
        queryCount++
        if (queryCount === 1) throw new MihoyoApiError("NETWORK_ERROR", "temporary")
        return confirmedStatus()
      },
    },
  })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.equal(queryCount, 2)
  assert.ok(
    harness.replies.some(item => /诊断码：QUERY_NETWORK_ERROR/.test(String(item.message))),
  )
  assert.ok(harness.replies.some(item => /登录完成/.test(String(item.message))))
})

test("Token 交换失败时撤回二维码且不写入 Cookie", async () => {
  const harness = createHarness({
    statuses: [
      confirmedStatus(),
    ],
    apiOverrides: {
      exchangeQrLogin: async () => {
        throw new MihoyoApiError("TOKEN_EXCHANGE_FAILED", "failed")
      },
    },
  })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.deepEqual(harness.recalled, ["qr-message"])
  assert.equal(harness.actions.some(item => item[0] === "bind"), false)
  assert.ok(harness.replies.some(item => /扫码登录失败/.test(String(item.message))))
})

test("同一用户的重复命令不会创建第二张二维码", async () => {
  let releaseCreate
  let createCount = 0
  const createPending = new Promise(resolve => {
    releaseCreate = resolve
  })
  const harness = createHarness({
    apiOverrides: {
      createQr: async () => {
        createCount++
        return await createPending
      },
      queryQr: async () => ({ retcode: -106 }),
    },
  })

  const first = harness.manager.start({ event: harness.event, reply: harness.reply })
  await Promise.resolve()
  await harness.manager.start({ event: harness.event, reply: harness.reply })
  assert.equal(createCount, 1)
  assert.ok(harness.replies.some(item => /已有正在进行/.test(String(item.message))))

  releaseCreate({
    url: "https://example.test/qr?ticket=ticket-1",
    ticket: "ticket-1",
    expiresAt: Date.now() + 60_000,
  })
  await first
  assert.equal(harness.sessions.size, 0)
})

test("不同用户可以同时建立扫码任务", async () => {
  const releases = []
  let createCount = 0
  const harness = createHarness({
    apiOverrides: {
      createQr: async () => {
        createCount++
        return await new Promise(resolve => releases.push(resolve))
      },
      queryQr: async () => ({ retcode: -106 }),
    },
  })
  const secondEvent = createEvent({ user_id: "user-2" }).event

  const first = harness.manager.start({ event: harness.event, reply: harness.reply })
  const second = harness.manager.start({ event: secondEvent, reply: harness.reply })
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(createCount, 2)
  assert.equal(harness.sessions.size, 2)
  for (const release of releases) {
    release({
      url: "https://example.test/qr?ticket=ticket-1",
      ticket: "ticket-1",
      expiresAt: Date.now() + 60_000,
    })
  }
  await Promise.all([first, second])
  assert.equal(harness.sessions.size, 0)
})

test("Passport 明确拒绝查询时立即撤回并返回脱敏诊断码", async () => {
  const harness = createHarness({
    statuses: [{ retcode: -3503, message: "rejected" }],
  })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.deepEqual(harness.recalled, ["qr-message"])
  assert.ok(harness.logs.some(item => /QUERY_RETCODE_-3503/.test(item)))
  assert.ok(
    harness.replies.some(item => /诊断码：QUERY_RETCODE_-3503/.test(String(item.message))),
  )
  assert.equal(harness.replies.some(item => /登录完成/.test(String(item.message))), false)
})

test("服务端给出异常的五天有效期时仍限制为本地两分钟上限", async () => {
  let now = 0
  let queryCount = 0
  const harness = createHarness({
    apiOverrides: {
      createQr: async () => ({
        url: "https://example.test/qr",
        ticket: "ticket-1",
        expiresAt: 432_000_000,
      }),
      queryQr: async () => {
        queryCount++
        return { retcode: 0, data: { stat: "Init", payload: { raw: "" } } }
      },
    },
    managerOverrides: {
      now: () => now,
      sleep: async milliseconds => {
        now += milliseconds
      },
      pollIntervalMs: 10,
      fallbackTimeoutMs: 30,
    },
  })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.equal(now, 30)
  assert.equal(queryCount, 2)
  assert.ok(harness.replies.some(item => /二维码已过期/.test(String(item.message))))
})

test("已扫描但尚未确认时保持任务运行", async () => {
  let queryCount = 0
  let releaseConfirmation
  const confirmation = new Promise(resolve => {
    releaseConfirmation = resolve
  })
  const harness = createHarness({
    apiOverrides: {
      queryQr: async () => {
        queryCount++
        if (queryCount === 1) {
          return { retcode: 0, data: { stat: "Scanned", payload: { raw: "" } } }
        }
        return await confirmation
      },
    },
  })

  const running = harness.manager.start({ event: harness.event, reply: harness.reply })
  for (let attempt = 0; attempt < 20; attempt++) {
    if (harness.replies.some(item => /二维码已扫描/.test(String(item.message)))) break
    await Promise.resolve()
  }

  assert.equal(harness.sessions.size, 1)
  assert.equal(harness.replies.some(item => /扫码登录失败/.test(String(item.message))), false)
  await harness.manager.status({ event: harness.event, reply: harness.reply })
  assert.ok(
    harness.replies.some(
      item =>
        /扫码入口：原神（米游社通行证）/.test(String(item.message)) &&
        /已扫码，米游社通行证尚未返回确认结果/.test(String(item.message)),
    ),
  )
  releaseConfirmation(confirmedStatus())
  await running

  assert.ok(harness.replies.some(item => /登录完成/.test(String(item.message))))
  assert.equal(harness.sessions.size, 0)
})

test("扫码后十五秒仍未确认时只发送一次群内诊断提示", async () => {
  let now = 0
  const harness = createHarness({
    apiOverrides: {
      createQr: async () => ({
        url: "https://example.test/qr",
        ticket: "ticket-1",
        expiresAt: 22_000,
      }),
      queryQr: async () => ({
        retcode: 0,
        data: { stat: "Scanned", payload: { raw: "" } },
      }),
    },
    managerOverrides: {
      now: () => now,
      sleep: async milliseconds => {
        now += milliseconds
      },
      pollIntervalMs: 5_000,
      confirmWaitReminderMs: 15_000,
    },
  })

  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.equal(
    harness.replies.filter(item => /诊断码：SCANNED_WAITING/.test(String(item.message))).length,
    1,
  )
  assert.ok(harness.replies.some(item => /二维码已过期/.test(String(item.message))))
})

test("损坏的确认载荷会安全终止且不泄露内容", async () => {
  const harness = createHarness({
    statuses: [
      { retcode: 0, data: { stat: "Confirmed", payload: { raw: "not-json" } } },
    ],
  })
  await harness.manager.start({ event: harness.event, reply: harness.reply })
  assert.deepEqual(harness.recalled, ["qr-message"])
  assert.ok(harness.replies.some(item => /扫码登录失败/.test(String(item.message))))
  assert.doesNotMatch(JSON.stringify(harness.replies), /not-json/)
})

test("Cookie 校验失败时提示同步失败且不泄露内部错误", async () => {
  const harness = createHarness({
    statuses: [
      confirmedStatus(),
    ],
    managerOverrides: {
      loadBinder: async () => async () => {
        throw new CookieBindingError("COOKIE_VALIDATE_FAILED")
      },
    },
  })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.ok(harness.replies.some(item => /Cookie 同步失败/.test(String(item.message))))
  assert.ok(harness.logs.some(item => /COOKIE_VALIDATE_FAILED/.test(item)))
  assert.doesNotMatch(JSON.stringify(harness.replies), /mid-secret|stoken-secret/)
})

test("缺少 genshin 或 miao-plugin 时给出明确提示且不请求二维码", async () => {
  let createCount = 0
  const harness = createHarness({
    apiOverrides: {
      createQr: async () => {
        createCount++
      },
    },
    managerOverrides: {
      loadBinder: async () => {
        throw new MissingDependencyError()
      },
    },
  })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.equal(createCount, 0)
  assert.ok(harness.replies.some(item => /Yunzai-genshin 与 miao-plugin/.test(String(item.message))))
  assert.equal(harness.sessions.size, 0)
})

test("撤回失败仍会提示结果并清理会话", async () => {
  const harness = createHarness({ statuses: [{ retcode: -106 }] })
  harness.event.group.recallMsg = async () => {
    throw new Error("recall unavailable")
  }
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.ok(harness.logs.some(item => /RECALL_FAILED/.test(item)))
  assert.ok(harness.replies.some(item => /二维码已过期/.test(String(item.message))))
  assert.equal(harness.sessions.size, 0)
})

test("私聊只提示去群聊使用，不建立会话", async () => {
  const harness = createHarness({ eventOverrides: { isGroup: false, group: undefined } })
  await harness.manager.start({ event: harness.event, reply: harness.reply })

  assert.equal(harness.replies[0].message, "请在群聊中使用 #扫码登录")
  assert.equal(harness.sessions.size, 0)
})

test("没有扫码会话时 #扫码状态 给出明确提示", async () => {
  const harness = createHarness()
  await harness.manager.status({ event: harness.event, reply: harness.reply })

  assert.equal(harness.replies[0].message, "当前没有进行中的扫码登录任务。")
  assert.equal(harness.replies[0].data.at, true)
})
