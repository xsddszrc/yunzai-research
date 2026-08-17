/**
 * 自定义帮助配置（v3 按绑定状态分层）
 * - 分组按「绑定状态」划分：账号绑定引导 / 已绑定UID / 已绑定Cookie / 资料查询 / 通用功能 / 系统与帮助 / 管理命令
 * - #状态 为 TRSS 框架系统命令，归入「系统与帮助」组（不再混入个人信息）
 * - 管理员命令（master 权限）独立成组，仅管理员可见
 * - 删除私聊发送 ck 明文绑定方式（改走扫码登录，明文方式入开发者文档备用）
 */

// 帮助配置
export const helpCfg = {
  // 帮助标题
  title: '喵喵帮助',

  // 帮助副标题
  subTitle: 'Yunzai-Bot & Miao-Plugin',

  // 帮助表格列数，可选：2-5，默认3
  colCount: 3,

  // 单列宽度，默认265
  colWidth: 265,

  // 皮肤选择，可多选，或设置为all
  theme: 'all',

  // 排除皮肤
  themeExclude: ['default'],

  // 是否启用背景毛玻璃效果
  bgBlur: true
}

// 帮助菜单内容
export const helpList = [{
  group: '账号绑定（新用户先看这里）',
  desc: '绑定UID后可查面板，绑定Cookie后可查体力/札记',
  list: [{
    icon: 63,
    title: '#绑定UID #星铁绑定UID',
    desc: '绑定游戏UID，支持原神/星铁/绝区零'
  }, {
    icon: 35,
    title: '#扫码登录 #扫码状态',
    desc: '群聊扫码登录米游社，自动绑定Cookie'
  }, {
    icon: 61,
    title: '#UID #绑定ck',
    desc: '查看已绑定UID / 私聊发送Cookie绑定'
  }]
}, {
  group: '已绑定UID可用',
  desc: '绑定UID后即可查询，无需Cookie',
  list: [{
    icon: 61,
    title: '#角色 #角色卡片 #探索',
    desc: '你的原神角色数据，数据来自米游社'
  }, {
    icon: 63,
    title: '#面板 #更新面板',
    desc: '查看已经获取面板信息的角色列表'
  }, {
    icon: 61,
    title: '#雷神面板 #雷神伤害',
    desc: '查看角色详细面板及伤害信息'
  }, {
    icon: 63,
    title: '#圣遗物列表 #雷神圣遗物',
    desc: '查看圣遗物列表 / 评分详情'
  }, {
    icon: 61,
    title: '#面板帮助',
    desc: '面板替换及其他帮助信息'
  }, {
    icon: 63,
    title: '#深渊 #深渊12层',
    desc: '深渊数据，打完请2小时后查询'
  }, {
    icon: 61,
    title: '#五星 #武器 #今日素材',
    desc: '你的原神角色详情数据'
  }, {
    icon: 63,
    title: '#五星列表 #练度统计',
    desc: '角色列表数据'
  }, {
    icon: 61,
    title: '#幻想 #幻想真境剧诗 #上期幻想',
    desc: '幻想真境剧诗数据'
  }, {
    icon: 63,
    title: '#抽卡记录 #记录帮助',
    desc: '统计游戏抽卡数据'
  }, {
    icon: 61,
    title: '#角色统计 #武器统计',
    desc: '按卡池统计抽卡数据'
  }, {
    icon: 63,
    title: '#上传深渊数据',
    desc: '上传您的深渊数据用于数据统计'
  }]
}, {
  group: '已绑定Cookie可用',
  desc: '需要绑定Cookie（扫码登录即可绑定）',
  list: [{
    icon: 15,
    title: '#体力 #体力帮助',
    desc: '查询体力（需绑定Cookie）'
  }, {
    icon: 5,
    title: '#原石 #札记 #札记统计',
    desc: '札记与原石统计（需绑定Cookie）'
  }, {
    icon: 22,
    title: '#检查ck状态',
    desc: '检查Cookie是否有效'
  }, {
    icon: 10,
    title: '#我的ck #删除ck',
    desc: '查看已绑定Cookie / 删除Cookie'
  }, {
    icon: 61,
    title: '#留影叙佳期',
    desc: '角色生日留影（需绑定Cookie）'
  }, {
    icon: 63,
    title: '#深渊使用率 #深渊出场率',
    desc: '查看本期深渊使用或出场统计'
  }, {
    icon: 61,
    title: '#深渊配队',
    desc: '根据你的角色池推荐组队'
  }, {
    icon: 63,
    title: '#角色持有 #角色0命',
    desc: '查看角色的持有率、0命统计'
  }]
}, {
  group: '资料查询',
  desc: '无需绑定，通用资料',
  list: [{
    icon: 63,
    title: '#刻晴 #心海',
    desc: '角色卡片与角色资料'
  }, {
    icon: 61,
    title: '#夜兰天赋 #胡桃命座',
    desc: '查看角色的天赋与命座资料'
  }, {
    icon: 63,
    title: '#心海图鉴 #护摩',
    desc: '角色武器图鉴'
  }, {
    icon: 61,
    title: '#刻晴攻略',
    desc: '西风驿站攻略'
  }, {
    icon: 63,
    title: '#日历 #日历列表',
    desc: '查看活动日历'
  }, {
    icon: 61,
    title: '#公告 #资讯 #兑换码',
    desc: '官方公告 / 最新兑换码'
  }]
}, {
  group: '通用功能',
  desc: '无需绑定，娱乐与社区功能',
  list: [{
    icon: 21,
    title: '十连 十连2 定轨',
    desc: '真实模拟抽卡'
  }, {
    icon: 74,
    title: '添加哈哈 删除哈哈',
    desc: '添加表情，回复哈哈触发'
  }, {
    icon: 61,
    title: '#老婆 #老公',
    desc: '查看老婆、老公'
  }, {
    icon: 63,
    title: '#老婆设置心海,雷神',
    desc: '设置老婆列表，也可设置随机'
  }, {
    icon: 61,
    title: '#老婆照片 #甘雨照片',
    desc: '查看指定角色的图片'
  }, {
    icon: 63,
    title: '#幽境 #幽境危战 #上期幽境',
    desc: '幽境危战数据'
  }, {
    icon: 61,
    title: '#月谕圣牌 #月谕圣牌交换',
    desc: '「月谕圣牌」收藏查询与本群交换匹配'
  }]
}, {
  group: '系统与帮助',
  desc: '机器人系统命令',
  list: [{
    icon: 74,
    title: '#状态',
    desc: '查看系统运行状态'
  }, {
    icon: 74,
    title: '#帮助 #版本 #喵喵版本',
    desc: '帮助菜单与版本信息'
  }]
}, {
  group: '管理命令，仅管理员可用',
  auth: 'master',
  list: [{
    icon: 85,
    title: '#用户统计',
    desc: '查看用户CK-UID列表'
  }, {
    icon: 32,
    title: '#喵喵设置',
    desc: '配置喵喵功能'
  }, {
    icon: 35,
    title: '#喵喵更新图像',
    desc: '更新喵喵的增量角色图像素材'
  }, {
    icon: 22,
    title: '#配置公共ck',
    desc: '配置公共查询Cookie（master）'
  }, {
    icon: 85,
    title: '#删除无效用户',
    desc: '清理无效绑定用户（master）'
  }]
}]
