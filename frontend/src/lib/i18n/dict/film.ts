import { defineDict } from "../types";

/**
 * 首页产品影片（src/components/negotiation-demo.tsx）与它的播放器（src/components/product-film.tsx）。
 *
 * 两条与别处不同的约定，改这个文件前先读一遍：
 *
 * 1. **数字一律不进词典**。影片里的分数、金额、件数、天数全部由 negotiation-demo.tsx 的
 *    公式算出（七维分数求和、逐项底线阈值），也全部留在那个文件里。词典只放「词」，
 *    数值通过 {name} 占位符在渲染时插进去（见 lib/i18n/types.ts 的 format）。
 *    这样改一个阈值不会出现「词典里还写着旧数字」的两份真相。
 *
 * 2. **英文比中文短**。影片舞台是 1280×960 的定尺画布，字号 19–36px、若干栏宽固定
 *    （评分维度标签 150px、左侧评分栏 300px），英文一旦变长就会溢出或把行撑到裁切线外。
 *    所以这里的英文是在「同一句话、更少字符」的前提下写出来的口语化短句，
 *    而不是中文的逐字对译；采购术语按首页 home.ts 的既有译法统一（MOQ / Lead time /
 *    Payment terms / Hard-limit check / Tiered handoff 等）。
 */
export const film = defineDict({
  zh: {
    /** 影片顶栏：谈判台标题与 AI 状态胶囊。品牌名取自 common.brand，不在这里重复。 */
    chrome: {
      desk: "采购谈判台 · {supplier}",
      live: "AI 自动接待中",
      handedOff: "已转人工 · 待接管",
    },
    /** 顶部三幕进度轨的标签；步骤号 01/02/03 是数字，留在组件里。 */
    rail: {
      reception: "自动接待",
      bottomline: "底线校验",
      handoff: "分层转人工",
    },
    /** 影片里唯一的供应商（演示数据，不是真实企业）。 */
    supplier: {
      name: "东莞恒达五金",
      contact: "陈经理",
      /** 头像方牌里的一个字，英文用首字母。 */
      avatar: "供",
    },
    /** 数值后面的单位。数值本身不进词典。 */
    units: {
      pieces: "件",
      days: "天",
      perPiece: "/ 件",
    },
    /** 条款字段名：报价单、底线核验行、变化对照卡共用同一套叫法。 */
    terms: {
      quote: "报价",
      moq: "起订量",
      leadTime: "交期",
      payment: "账期",
      credentials: "必备资质",
    },
    /** 七维评分维度名。键与 negotiation-demo.tsx 的 DIMENSIONS 一一对应。 */
    dimensions: {
      price: "价格竞争力",
      moq: "起订量",
      credentials: "资质完整度",
      leadTime: "交期",
      payment: "账期",
      region: "区域匹配",
      responsiveness: "沟通配合度",
    },
    /** 第一幕：自动接待。 */
    reception: {
      title: "AI 正在自动接待",
      subtitle: "供应商不必等你在线",
      greeting: "你好，我们是{name}，想给这款收纳盒报个价。",
      termsTitle: "供应商提交的条款",
      termsPending: "待程序校验",
      reply: "收到。我先按贵司的采购底线逐项核对报价、起订量、交期、账期与资质。",
    },
    /** 第二幕：底线校验。规则里的限值由组件填空，词序按语言各自写通顺。 */
    bottomline: {
      title: "采购底线逐项硬性核对",
      subtitle: "程序判定，不靠模型自觉",
      rules: {
        quote: "不高于硬性价格上限 {limit}",
        moq: "不高于硬性上限 {limit}",
        leadTime: "不超过 {limit}",
        payment: "不低于 {limit}",
        credentials: "营业执照等文件已上传",
      },
      /** 资质一项没有可比数值，通过后显示这个状态词。 */
      verified: "已核验",
      summary: "{count} 项全部通过 · 未触碰采购底线，进入加权评分",
    },
    /** 第三幕：首次评分未达阈值。 */
    scoring: {
      title: "首次加权评分",
      subtitle: "七维权重由商家自定义",
      supplierScore: "供应商综合评分",
      threshold: "阈值 {value}",
      belowThreshold: "未达阈值 · AI 继续议价",
      summary: "{score} 分 < 转人工阈值 {threshold} · 不打扰商家，AI 继续谈",
    },
    /** 第四幕：AI 议价后重新校验。 */
    recheck: {
      title: "AI 议价 → 程序重新校验",
      subtitle: "条款一变，评分立刻重算",
      ask: "当前 {score} 分，未达贵司设定的转人工线 {threshold} 分。若起订量降到 {moq} 件、账期延到 {days} 天，可以继续。",
      reply: "起订量 {moq} 件、账期 {days} 天都可以，价格再让到 {price}。",
      scoreLabel: "重新校验评分",
      qualified: "达标 · 优质候选",
      system: "系统消息：重新校验评分 {from} → {to}，分类「{fromLabel}」→「{toLabel}」",
      /** 会话分类名，与商家端会话列表同一套用词。 */
      classification: {
        negotiating: "AI 拉锯",
        qualified: "优质候选",
      },
    },
    /** 第五幕：分层转人工。 */
    handoff: {
      headline: "{score} 分 ≥ 阈值 {threshold} · 判定为优质候选",
      principle: "评分由程序算出，AI 不参与决策，只负责把结论讲清楚",
      /** 拆成三段是为了让中间那句保持加粗；英文没有「已」这个助词，lead 留空。 */
      stopped: { lead: "已", strong: "停止 AI 自动回复", tail: "，不再替商家继续许诺" },
      alerted: { lead: "已", strong: "提醒商家接管", tail: "，高质量候选不再排队等 AI" },
      card: "最新报价 {price} / 件 · 起订量 {moq} 件 · 账期 {days} 天 · 评分轨迹 {from} → {to}",
      pending: "待人工接管",
    },
    /** 播放器（首页 hero）：控件无障碍名称、静态帧替代文本与字幕。 */
    player: {
      pause: "暂停产品演示",
      play: "播放产品演示",
      stillAlt: "{brand} 谈判台演示：供应商提交条款、底线逐项核验、七维评分达标后转人工",
      captionLead: "真实链路演示：",
      caption:
        "自动接待 → 底线逐项核验 → 首次 {first} 分未达阈值 → AI 继续议价 → 重新校验 {final} 分 → 达标转人工。",
    },
  },
  en: {
    chrome: {
      desk: "Negotiation desk · {supplier}",
      live: "AI handling intake",
      handedOff: "Handed off · awaiting you",
    },
    rail: {
      reception: "Automatic intake",
      bottomline: "Hard-limit check",
      handoff: "Tiered handoff",
    },
    supplier: {
      /** 顶栏、问候语与候选卡片共用；英文比中文长，取能在一行里放下的写法。 */
      name: "Hengda Hardware",
      contact: "Mr. Chen",
      avatar: "S",
    },
    units: {
      pieces: "pcs",
      days: "days",
      perPiece: "/ pc",
    },
    terms: {
      quote: "Quote",
      moq: "MOQ",
      leadTime: "Lead time",
      payment: "Payment terms",
      credentials: "Required credentials",
    },
    /**
     * 影片里这一列只有 150px 宽、24px 字，首页那套全称（Price competitiveness 252px、
     * Credential completeness、Responsiveness 182px）在这里必定折行或溢出，
     * 所以用同义的短标签；能被完整放下的仍沿用首页译法（MOQ / Credentials / Lead time），
     * 全称以首页为准。
     */
    dimensions: {
      price: "Price",
      moq: "MOQ",
      credentials: "Credentials",
      leadTime: "Lead time",
      payment: "Payment",
      region: "Region",
      responsiveness: "Engagement",
    },
    reception: {
      title: "AI handles the intake",
      subtitle: "No need to be online",
      greeting: "Hello, we're {name}. We'd like to quote on this storage box.",
      termsTitle: "Terms from the supplier",
      termsPending: "Awaiting rule check",
      reply: "Got it. I'll check the quote, MOQ, lead time, payment terms and credentials against your limits.",
    },
    bottomline: {
      title: "Hard limits, checked item by item",
      subtitle: "Decided by code, not by the model",
      rules: {
        quote: "No higher than the hard price ceiling of {limit}",
        moq: "No higher than the hard cap of {limit}",
        leadTime: "No longer than {limit}",
        payment: "No shorter than {limit}",
        credentials: "Business licence and other files uploaded",
      },
      verified: "Verified",
      summary: "All {count} checks passed · Limits untouched, moving to weighted scoring",
    },
    scoring: {
      title: "First weighted score",
      subtitle: "Seven weights, set by the buyer",
      supplierScore: "Supplier score",
      threshold: "Threshold {value}",
      belowThreshold: "Below threshold",
      summary: "{score} < handoff threshold {threshold} · Buyer not disturbed, AI keeps talking",
    },
    recheck: {
      title: "AI negotiates → code re-checks",
      subtitle: "Any change, the score is recomputed",
      ask: "{score} — below your handoff threshold of {threshold}. Cut the MOQ to {moq} pcs and extend terms to {days} days and we can go on.",
      reply: "An MOQ of {moq} pcs and {days}-day terms are both fine — we can also come down to {price}.",
      scoreLabel: "Re-checked score",
      qualified: "Cleared · top candidate",
      system: 'System message: score re-checked {from} → {to}, category "{fromLabel}" → "{toLabel}"',
      classification: {
        negotiating: "AI negotiation",
        qualified: "Top candidate",
      },
    },
    handoff: {
      headline: "{score} ≥ threshold {threshold} · Top candidate",
      principle: "The score comes from code; the AI takes no part in the decision",
      stopped: { lead: "", strong: "AI auto-replies stopped", tail: " — no more promises on the buyer's behalf" },
      alerted: { lead: "", strong: "Buyer alerted to take over", tail: " — top candidates skip the AI queue" },
      card: "Latest quote {price} / pc · MOQ {moq} pcs · payment {days} days · score {from} → {to}",
      pending: "Awaiting handoff",
    },
    player: {
      pause: "Pause the product demo",
      play: "Play the product demo",
      stillAlt:
        "{brand} demo: a supplier submits terms, every hard limit is checked, and a qualifying score hands over to the buyer",
      captionLead: "The real flow, end to end: ",
      caption:
        "Automatic intake → every hard limit checked → first score of {first} below threshold → AI keeps negotiating → re-scored {final} → handed to you.",
    },
  },
});
