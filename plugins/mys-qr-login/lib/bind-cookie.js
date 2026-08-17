export class MissingDependencyError extends Error {
  constructor() {
    super("缺少 Yunzai-genshin 或 miao-plugin")
    this.name = "MissingDependencyError"
    this.code = "MISSING_DEPENDENCY"
  }
}

export class CookieBindingError extends Error {
  constructor(code = "COOKIE_BINDING_FAILED") {
    super("Cookie 写入失败")
    this.name = "CookieBindingError"
    this.code = code
  }
}

export async function loadGenshinBinder() {
  let MysUser
  let NoteUser
  try {
    ;[
      { default: MysUser },
      { default: NoteUser },
    ] = await Promise.all([
      import("../../genshin/model/mys/MysUser.js"),
      import("../../genshin/model/mys/NoteUser.js"),
    ])
  } catch {
    throw new MissingDependencyError()
  }

  if (!MysUser?.create || !NoteUser?.create) {
    throw new MissingDependencyError()
  }

  return async function bindCookie({ event, accountId, cookie }) {
    const mys = await MysUser.create(accountId)
    const user = await NoteUser.create(event)
    if (!mys || !user) throw new CookieBindingError("MODEL_INIT_FAILED")

    const previousCookie = mys.ck
    mys.setCkData({ ck: cookie, type: "mys" })

    let uidResult
    try {
      uidResult = await mys.reqMysUid()
    } catch {
      mys.ck = previousCookie
      mys._delCache?.()
      throw new CookieBindingError("COOKIE_VALIDATE_FAILED")
    }

    if (uidResult?.status !== 0) {
      mys.ck = previousCookie
      mys._delCache?.()
      throw new CookieBindingError("COOKIE_VALIDATE_FAILED")
    }

    try {
      await user.addMysUser(mys)
      await mys.initCache()
      await user.save()
    } catch {
      throw new CookieBindingError("COOKIE_SAVE_FAILED")
    }

    return { uidInfo: mys.getUidInfo?.() || "" }
  }
}
