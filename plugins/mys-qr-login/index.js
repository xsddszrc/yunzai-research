import QRCode from "qrcode"
import { QR_LOGIN_HELP, resolveQrLoginChannel } from "./lib/channels.js"
import { MihoyoApiClient } from "./lib/mihoyo-api.js"
import { loadGenshinBinder } from "./lib/bind-cookie.js"
import { QrLoginManager } from "./lib/login-manager.js"

const sessions = new Map()
const api = new MihoyoApiClient()
const writeInfoLog = message => {
  if (typeof logger.mark === "function") return logger.mark(message)
  if (typeof logger.info === "function") return logger.info(message)
  return logger.warn?.(message)
}
const manager = new QrLoginManager({
  api,
  sessions,
  loadBinder: loadGenshinBinder,
  toDataUrl: (text, options) => QRCode.toDataURL(text, options),
  makeImage: data => segment.image(data),
  sleep: ms => Bot.sleep(ms),
  logger: {
    info: writeInfoLog,
    warn: message => logger.warn(message),
  },
})

export class MysQrLogin extends plugin {
  constructor() {
    super({
      name: "米游社扫码登录",
      dsc: "群聊扫码登录米游社并同步 Cookie 至 miao-plugin",
      event: "message",
      priority: 10,
      rule: [
        {
          reg: "^#扫码登录(?:\\s*\\S+)?\\s*$",
          fnc: "scanLogin",
        },
        {
          reg: "^#扫码状态$",
          fnc: "scanLoginStatus",
        },
      ],
    })
  }

  async scanLogin() {
    const reply = (message, data = {}) => this.reply(message, false, data)
    const channel = resolveQrLoginChannel(this.e.msg)

    if (this.e.isGroup && !channel) {
      await reply(QR_LOGIN_HELP, { at: true })
      return true
    }

    return await manager.start({
      event: this.e,
      reply,
      channel,
    })
  }

  async scanLoginStatus() {
    return await manager.status({
      event: this.e,
      reply: (message, data = {}) => this.reply(message, false, data),
    })
  }
}
