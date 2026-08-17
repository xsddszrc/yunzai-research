const channelDefinitions = [
  {
    key: "genshin",
    name: "原神",
    aliases: ["原神"],
  },
  {
    key: "starrail",
    name: "崩坏：星穹铁道",
    shortName: "崩铁",
    aliases: ["崩铁", "星铁", "星穹铁道", "崩坏星穹铁道", "崩坏：星穹铁道"],
  },
  {
    key: "zenless",
    name: "绝区零",
    aliases: ["绝区零", "绝区"],
  },
]

export const QR_LOGIN_CHANNELS = Object.freeze(
  channelDefinitions.map(channel => Object.freeze({
    ...channel,
    aliases: Object.freeze([...channel.aliases]),
  })),
)

const channelByAlias = new Map(
  QR_LOGIN_CHANNELS.flatMap(channel => channel.aliases.map(alias => [alias, channel])),
)

export const QR_LOGIN_HELP = [
  "请选择扫码登录入口（底层均使用米游社通行证）：",
  "#扫码登录原神",
  "#扫码登录崩铁",
  "#扫码登录绝区零",
].join("\n")

export function resolveQrLoginChannel(message) {
  const choice = String(message || "")
    .trim()
    .replace(/^#扫码登录\s*/, "")
    .replace(/\s+/g, "")

  return channelByAlias.get(choice) || null
}
