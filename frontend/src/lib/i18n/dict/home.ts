import { defineDict } from "../types";

/** 首页（落地页）：导航、Hero、工作流程、产品能力、供应商入口、页脚。 */
export const home = defineDict({
  zh: {
    nav: {
      flow: "工作流程",
      capability: "产品能力",
      supplier: "供应商入口",
    },
    header: {
      supplierEntry: "我是供应商",
      merchantLogin: "商家登录",
    },
    hero: {
      badge: "面向中小微采购商家",
      titleLead: "把时间留给",
      titleAccent: "真正值得谈",
      titleTail: "的供应商",
      body:
        "链谈 Agent 自动接待上门的供应商，先按你的采购底线硬性筛选，再按七维权重打分分层。达到标准的才提醒你接手，其余由 AI 继续议价。",
      principleLabel: "核心原则：",
      principleLead: "大模型负责理解和表达，",
      principleStrong: "底线、评分和决策由程序完成",
      principleTail: "。",
      primaryCta: "免费创建商家账号",
      secondaryCta: "已有账号，直接登录",
      demoNote: "演示环境：注册即用，验证码为演示码，不发送真实短信。",
    },
    flow: {
      title: "它替你做了什么",
      body: "每一步的判断都由程序给出，AI 不参与决策，只负责把结论讲清楚。",
      items: [
        {
          step: "01",
          title: "自动接待",
          body: "供应商上门提交报价、起订量、账期与资质后，AI 立即开始洽谈，不必等你在线。",
        },
        {
          step: "02",
          title: "底线校验",
          body: "价格上限、起订量、交期、账期、必备资质逐项硬性核对，触碰底线当场说明，不靠模型自觉。",
        },
        {
          step: "03",
          title: "分层转人工",
          body: "加权评分达到阈值就停止 AI 自动回复并提醒你接管，把精力只花在真正值得谈的供应商上。",
        },
      ],
    },
    capability: {
      title: "决策规则写在明面上",
      body:
        "模型会理解供应商在说什么，但「给谁报价机会、给谁转人工、谁直接淘汰」由一套确定的规则计算。你可以随时调整权重，结果立刻跟着变。",
      weightsTitle: "默认七维满分（可按商品自定义）",
      dimensions: [
        { label: "价格竞争力", weight: 30 },
        { label: "起订量", weight: 15 },
        { label: "资质完整度", weight: 20 },
        { label: "交期", weight: 10 },
        { label: "账期", weight: 10 },
        { label: "区域匹配", weight: 5 },
        { label: "沟通配合度", weight: 10 },
      ],
      items: [
        {
          title: "采购底线可配置",
          body: "每个商品单独设定目标价、硬性价格上限、最高起订量、最长交期与账期，以及转人工分数。",
        },
        {
          title: "评分口径透明",
          body: "七维加权满分，权重由你自己分配；硬性规则优先于评分，任一硬指标触线即淘汰。",
        },
        {
          title: "资质自动初筛",
          body: "营业执照经 OCR 识别并与填写企业名比对，不一致或无法识别时转人工核验，全程留痕。",
        },
        {
          title: "多商家数据隔离",
          body: "每个商家账号独立存储，商品、规则、谈判记录与资质文件按账号隔离，互不可见。",
        },
      ],
    },
    supplier: {
      title: "我是供应商，想供货",
      body: "手机号登录后填写报价、起订量、账期与资质，提交前就能看到是否满足采购底线，通过后直接进入 AI 洽谈。",
      cta: "进入供应商入口",
    },
    footer: {
      body: "面向中小微采购商家的供应商智能接待、分层谈判和筛选系统。",
      productsTitle: "产品",
      termsTitle: "条款",
      createAccount: "创建商家账号",
      merchantLogin: "商家登录",
      supplierLogin: "供应商登录",
      platformNotice: "平台须知",
      copyright: "© {year} 链谈 Agent · 演示环境",
      pendingInfo: "备案号 / 联系方式待上线前补充",
    },
  },
  en: {
    nav: {
      flow: "How it works",
      capability: "Capabilities",
      supplier: "Supplier portal",
    },
    header: {
      // 顶栏按钮：英文刻意取短词。"I'm a supplier"（128px）会让 375–420px 的顶栏溢出，
      // 而顶栏里紧挨着「Sign in」，一个 Supplier 已经足够清楚（正文与页脚里仍是完整说法）。
      supplierEntry: "Supplier",
      merchantLogin: "Sign in",
    },
    hero: {
      badge: "Built for small and mid-sized sourcing teams",
      titleLead: "Save your time for",
      titleAccent: "the suppliers",
      // 前导空格是刻意的：中文的「真正值得谈」与「的供应商」之间不能有空格，
      // 英文的 accent 与 tail 之间必须有，否则渲染成 "the suppliersworth talking to"。
      titleTail: " worth talking to",
      body:
        "LianTan Agent greets every inbound supplier, applies your hard sourcing limits first, then grades and tiers them across seven weighted dimensions. Only those that clear the bar reach you — the rest keep negotiating with the AI.",
      principleLabel: "Core principle: ",
      principleLead: "the model handles understanding and wording, while ",
      principleStrong: "limits, scoring and decisions are made by code",
      principleTail: ".",
      primaryCta: "Create a free buyer account",
      secondaryCta: "I already have an account",
      demoNote: "Demo environment: sign up and use it right away; verification codes are demo codes, no real SMS is sent.",
    },
    flow: {
      title: "What it does for you",
      body: "Every judgement comes from code. The AI takes no part in the decision — it only explains the conclusion in plain language.",
      items: [
        {
          step: "01",
          title: "Automatic intake",
          body: "Suppliers submit their quote, MOQ, payment terms and credentials; the AI starts negotiating immediately, whether or not you are online.",
        },
        {
          step: "02",
          title: "Hard-limit check",
          body: "Price ceiling, MOQ, lead time, payment terms and required credentials are verified item by item. Anything that crosses a limit is refused on the spot — never left to the model's judgement.",
        },
        {
          step: "03",
          title: "Tiered handoff",
          body: "Once the weighted score clears your threshold, the AI stops replying and asks you to take over, so your attention goes only to suppliers worth talking to.",
        },
      ],
    },
    capability: {
      title: "The decision rules are in plain sight",
      body:
        "The model understands what a supplier is saying, but who gets a quote, who is handed to you and who is eliminated is computed by a fixed rule set. Adjust the weights at any time and the outcome follows at once.",
      weightsTitle: "Default weights across seven dimensions (customisable per product)",
      dimensions: [
        { label: "Price competitiveness", weight: 30 },
        { label: "MOQ", weight: 15 },
        { label: "Credential completeness", weight: 20 },
        { label: "Lead time", weight: 10 },
        { label: "Payment terms", weight: 10 },
        { label: "Region match", weight: 5 },
        { label: "Responsiveness", weight: 10 },
      ],
      items: [
        {
          title: "Configurable sourcing limits",
          body: "Set a target price, a hard price ceiling, maximum MOQ, longest lead time and minimum payment terms, plus the handoff score — for every product.",
        },
        {
          title: "Transparent scoring",
          body: "Seven weighted dimensions out of 100, with weights you assign. Hard rules outrank the score: crossing any hard limit eliminates the supplier.",
        },
        {
          title: "Automatic credential screening",
          body: "Business licences are read by OCR and matched against the company name on file. Mismatches and unreadable files go to manual review, with a full audit trail.",
        },
        {
          title: "Isolated merchant data",
          body: "Every merchant account keeps its own products, rules, negotiation records and credential files, invisible to anyone else.",
        },
      ],
    },
    supplier: {
      title: "I'm a supplier and want to sell",
      body: "Sign in with your phone number, then enter your quote, MOQ, payment terms and credentials. You will see whether you meet the buyer's limits before submitting, and go straight into the AI negotiation once you pass.",
      cta: "Go to the supplier portal",
    },
    footer: {
      body: "Supplier intake, tiered negotiation and screening for small and mid-sized sourcing teams.",
      productsTitle: "Product",
      termsTitle: "Legal",
      createAccount: "Create a buyer account",
      merchantLogin: "Buyer login",
      supplierLogin: "Supplier login",
      platformNotice: "Platform notice",
      copyright: "© {year} LianTan Agent · Demo environment",
      pendingInfo: "Filing number / contact details to be added before launch",
    },
  },
});
