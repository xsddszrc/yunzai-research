import assert from "node:assert/strict"
import test from "node:test"

import {
  QR_LOGIN_CHANNELS,
  QR_LOGIN_HELP,
  resolveQrLoginChannel,
} from "../lib/channels.js"

test("扫码命令保留原神、崩铁和绝区零三个兼容入口", () => {
  assert.deepEqual(
    QR_LOGIN_CHANNELS.map(channel => [channel.key, channel.name]),
    [
      ["genshin", "原神"],
      ["starrail", "崩坏：星穹铁道"],
      ["zenless", "绝区零"],
    ],
  )
  assert.equal(resolveQrLoginChannel("#扫码登录原神")?.key, "genshin")
  assert.equal(resolveQrLoginChannel("#扫码登录 崩铁")?.key, "starrail")
  assert.equal(resolveQrLoginChannel("#扫码登录星铁")?.key, "starrail")
  assert.equal(resolveQrLoginChannel("#扫码登录 绝区零")?.key, "zenless")
})

test("无渠道或未知渠道时返回选择帮助", () => {
  assert.equal(resolveQrLoginChannel("#扫码登录"), null)
  assert.equal(resolveQrLoginChannel("#扫码登录未定事件簿"), null)
  assert.match(QR_LOGIN_HELP, /#扫码登录原神/)
  assert.match(QR_LOGIN_HELP, /#扫码登录崩铁/)
  assert.match(QR_LOGIN_HELP, /#扫码登录绝区零/)
  assert.match(QR_LOGIN_HELP, /米游社通行证/)
})
