import { MihoyoApiError } from "./mihoyo-api.js"
import { CookieBindingError, MissingDependencyError } from "./bind-cookie.js"

export class QrExpiredError extends Error {
  constructor() {
    super("二维码已过期")
    this.name = "QrExpiredError"
    this.code = "QR_EXPIRED"
  }
}

export class QrCanceledError extends Error {
  constructor() {
    super("用户取消了扫码登录")
    this.name = "QrCanceledError"
    this.code = "QR_CANCELED"
  }
}

export class QrLoginError extends Error {
  constructor(code) {
    super("扫码登录失败")
    this.name = "QrLoginError"
    this.code = code
  }
}

function flattenMessageIds(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenMessageIds(item, output)
  } else if (value !== undefined && value !== null && value !== "") {
    output.push(value)
  }
  return output
}

export function extractMessageIds(response) {
  return flattenMessageIds(
    response?.message_id ?? response?.messageId ?? response?.data?.message_id ?? [],
  )
}

function parseConfirmedPayload(response) {
  if (response?.data?.stat !== "Confirmed") return null
  try {
    const payload = JSON.parse(response.data.payload?.raw || "")
    if (!/^\d+$/.test(String(payload?.uid)) || !payload?.mid || !payload?.stoken) {
      throw new Error("invalid payload")
    }
    return {
      uid: String(payload.uid),
      mid: payload.mid,
      stoken: payload.stoken,
    }
  } catch {
    throw new QrLoginError("INVALID_CONFIRM_PAYLOAD")
  }
}

export class QrLoginManager {
  constructor({
    api,
    toDataUrl,
    makeImage,
    loadBinder,
    sessions = new Map(),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = Date.now,
    logger = console,
    pollIntervalMs = 3_000,
    fallbackTimeoutMs = 120_000,
    confirmWaitReminderMs = 15_000,
  }) {
    this.api = api
    this.toDataUrl = toDataUrl
    this.makeImage = makeImage
    this.loadBinder = loadBinder
    this.sessions = sessions
    this.sleep = sleep
    this.now = now
    this.logger = logger
    this.pollIntervalMs = pollIntervalMs
    this.fallbackTimeoutMs = fallbackTimeoutMs
    this.confirmWaitReminderMs = confirmWaitReminderMs
  }

  sessionKey(event) {
    return `${event.self_id}:${event.user_id}`
  }

  logWarning(code) {
    this.logger?.warn?.(`[mys-qr-login] ${code}`)
  }

  logInfo(code) {
    this.logger?.info?.(`[mys-qr-login] ${code}`)
  }

  async safeReply(reply, message, data = {}) {
    try {
      return await reply(message, data)
    } catch {
      this.logWarning("SEND_MESSAGE_FAILED")
      return false
    }
  }

  async recordQueryWarning(session, reply, code) {
    session.lastWarningCode = code
    if (!session.warningCodes.has(code)) {
      session.warningCodes.add(code)
      this.logWarning(code)
    }
    if (!session.queryWarningNotified) {
      session.queryWarningNotified = true
      await this.safeReply(
        reply,
        `扫码状态查询遇到临时异常，插件仍在重试。\n诊断码：${code}`,
        { at: true },
      )
    }
  }

  async status({ event, reply }) {
    if (!event.isGroup) {
      await this.safeReply(reply, "请在群聊中使用 #扫码状态")
      return true
    }

    const session = this.sessions.get(this.sessionKey(event))
    if (!session) {
      await this.safeReply(reply, "当前没有进行中的扫码登录任务。", { at: true })
      return true
    }

    const phaseText = {
      PREPARING: "正在创建二维码",
      WAITING_SCAN: "等待扫描二维码",
      INIT: "等待扫描二维码",
      SCANNED: "已扫码，米游社通行证尚未返回确认结果",
      CONFIRMED: "通行证已确认，正在读取登录凭据",
      TOKEN_EXCHANGE: "正在换取账号 Cookie",
      COOKIE_BIND: "正在同步 Cookie 至 miao-plugin",
    }[session.phase] || "正在处理扫码登录"
    const remainingSeconds = session.deadline
      ? Math.max(0, Math.ceil((session.deadline - this.now()) / 1000))
      : null
    const lines = [
      `扫码入口：${session.channel.name}（米游社通行证）`,
      `当前状态：${phaseText}`,
    ]
    if (remainingSeconds !== null) lines.push(`二维码剩余时间：约 ${remainingSeconds} 秒`)
    if (session.lastWarningCode) lines.push(`最近诊断码：${session.lastWarningCode}`)

    await this.safeReply(reply, lines.join("\n"), { at: true })
    return true
  }

  async recallQr(event, session) {
    if (session.recalled || !session.messageIds.length) return
    if (typeof event.group?.recallMsg !== "function") {
      this.logWarning("RECALL_NOT_SUPPORTED")
      session.recalled = true
      return
    }

    let allSucceeded = true
    for (const messageId of session.messageIds) {
      try {
        await event.group.recallMsg(messageId)
      } catch {
        allSucceeded = false
        this.logWarning("RECALL_FAILED")
      }
    }
    session.recalled = allSucceeded
    if (allSucceeded) this.logInfo("QR_RECALLED")
  }

  async start({ event, reply, channel }) {
    if (!event.isGroup) {
      await this.safeReply(reply, "请在群聊中使用 #扫码登录")
      return true
    }

    const key = this.sessionKey(event)
    if (this.sessions.has(key)) {
      await this.safeReply(reply, "你已有正在进行的扫码登录任务，请先完成或等待二维码过期。", {
        at: true,
      })
      return true
    }

    const session = {
      channel,
      phase: "PREPARING",
      deadline: null,
      messageIds: [],
      recalled: false,
      warningCodes: new Set(),
      lastQrStatus: null,
      lastWarningCode: null,
      queryWarningNotified: false,
      scannedAt: null,
      confirmWaitNotified: false,
    }
    this.sessions.set(key, session)
    this.logInfo("SESSION_STARTED")

    try {
      const bindCookie = await this.loadBinder()
      this.logInfo("DEPENDENCIES_READY")
      const device = this.api.createDeviceId()
      const qr = await this.api.createQr(device)
      this.logInfo("QR_CREATED_PASSPORT")
      const dataUrl = await this.toDataUrl(qr.url, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 360,
      })
      const base64Image = dataUrl.startsWith("data:image/png;base64,")
        ? `base64://${dataUrl.slice("data:image/png;base64,".length)}`
        : dataUrl

      const sent = await this.safeReply(
        reply,
        [
          `当前扫码入口：${channel.name}（米游社通行证）\n请使用本人的米游社 App 扫码并确认；确认页可能显示米游社或 HoYoPlay。\n扫码者的米游社账号会绑定到当前 QQ，请勿让他人扫描。`,
          this.makeImage(base64Image),
        ],
        { at: true },
      )
      if (sent === false) throw new QrLoginError("SEND_QR_FAILED")
      session.messageIds = extractMessageIds(sent)
      if (!session.messageIds.length) this.logWarning("MISSING_MESSAGE_ID")
      this.logInfo("QR_SENT")

      const startedAt = this.now()
      const fallbackDeadline = startedAt + this.fallbackTimeoutMs
      const deadline = qr.expiresAt && qr.expiresAt > startedAt
        ? Math.min(qr.expiresAt, fallbackDeadline)
        : fallbackDeadline
      session.deadline = deadline
      session.phase = "WAITING_SCAN"
      let confirmed = null
      let scannedNotified = false

      while (this.now() < deadline) {
        const remaining = deadline - this.now()
        await this.sleep(Math.min(this.pollIntervalMs, Math.max(0, remaining)))
        if (this.now() >= deadline) break

        let status
        try {
          status = await this.api.queryQr(device, qr.ticket)
        } catch (error) {
          // 网络抖动、超时或偶发空响应不等于拒绝登录，可以继续轮询。
          if (
            error instanceof MihoyoApiError &&
            ["NETWORK_ERROR", "REQUEST_TIMEOUT", "HTTP_ERROR", "INVALID_RESPONSE"].includes(error.code)
          ) {
            const warningCode = `QUERY_${error.code}`
            await this.recordQueryWarning(session, reply, warningCode)
            continue
          }
          throw error
        }

        const retcode = Number(status?.retcode)
        if (
          retcode === -106 ||
          retcode === -3501 ||
          /ExpiredCode|expired/i.test(status?.message || "")
        ) {
          throw new QrExpiredError()
        }
        if (retcode === -3505) throw new QrCanceledError()
        if (retcode !== 0) {
          throw new QrLoginError(
            `QUERY_RETCODE_${Number.isFinite(retcode) ? retcode : "INVALID"}`,
          )
        }

        const qrStatus = ["Init", "Scanned", "Confirmed"].includes(status?.data?.stat)
          ? status.data.stat.toUpperCase()
          : "UNKNOWN"
        if (session.lastQrStatus !== qrStatus) {
          session.lastQrStatus = qrStatus
          this.logInfo(`QR_STATUS_${qrStatus}`)
        }
        session.phase = qrStatus

        if (qrStatus === "UNKNOWN") {
          await this.recordQueryWarning(session, reply, "QUERY_STATUS_UNKNOWN")
          continue
        }

        if (status?.data?.stat === "Scanned" && !scannedNotified) {
          scannedNotified = true
          session.scannedAt = this.now()
          await this.safeReply(reply, "二维码已扫描，请在米游社中确认登录。", { at: true })
        }

        if (
          status?.data?.stat === "Scanned" &&
          session.scannedAt !== null &&
          !session.confirmWaitNotified &&
          this.now() - session.scannedAt >= this.confirmWaitReminderMs
        ) {
          session.confirmWaitNotified = true
          await this.safeReply(
            reply,
            `米游社通行证仍未返回“已确认”状态。若你已经点击确认，可发送 #扫码状态 查看详情；插件会继续等待到二维码过期。\n诊断码：SCANNED_WAITING`,
            { at: true },
          )
        }

        confirmed = parseConfirmedPayload(status)
        if (confirmed) break
      }

      if (!confirmed) throw new QrExpiredError()

      await this.recallQr(event, session)
      session.phase = "TOKEN_EXCHANGE"
      this.logInfo("TOKEN_EXCHANGE_STARTED")
      const account = await this.api.exchangeQrLogin(confirmed)
      this.logInfo("TOKEN_EXCHANGE_OK")
      session.phase = "COOKIE_BIND"
      this.logInfo("COOKIE_BIND_STARTED")
      await bindCookie({ event, accountId: account.accountId, cookie: account.cookie })
      this.logInfo("COOKIE_BIND_OK")
      await this.safeReply(
        reply,
        `${channel.name}入口登录完成，Cookie 已安全同步至 miao-plugin。`,
        { at: true },
      )
    } catch (error) {
      await this.recallQr(event, session)
      if (error instanceof QrExpiredError) {
        this.logInfo("QR_EXPIRED")
        await this.safeReply(reply, "二维码已过期，请重新发送 #扫码登录。", { at: true })
      } else if (error instanceof QrCanceledError) {
        this.logInfo("QR_CANCELED")
        await this.safeReply(reply, "你已取消扫码登录，请重新发送 #扫码登录。", { at: true })
      } else if (error instanceof MissingDependencyError) {
        await this.safeReply(
          reply,
          "扫码登录依赖 Yunzai-genshin 与 miao-plugin，请先安装并更新这两个插件。",
          { at: true },
        )
      } else if (error instanceof CookieBindingError) {
        this.logWarning(error.code)
        await this.safeReply(reply, "登录已确认，但 Cookie 同步失败，请稍后重试。", { at: true })
      } else if (error instanceof QrLoginError) {
        this.logWarning(error.code)
        await this.safeReply(
          reply,
          `扫码登录失败，请重新发送 #扫码登录。\n诊断码：${error.code}`,
          { at: true },
        )
      } else {
        this.logWarning(error?.code || error?.name || "LOGIN_FAILED")
        await this.safeReply(reply, "扫码登录失败，请稍后重新发送 #扫码登录。", { at: true })
      }
    } finally {
      await this.recallQr(event, session)
      if (this.sessions.get(key) === session) this.sessions.delete(key)
      this.logInfo("SESSION_FINISHED")
    }

    return true
  }
}
