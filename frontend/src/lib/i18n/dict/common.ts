import { defineDict } from "../types";

/** 全站通用：品牌名、通用动作、语言切换与切换过渡层的文案。 */
export const common = defineDict({
  zh: {
    brand: {
      name: "链谈",
      suffix: "Agent",
      /** 侧栏品牌下的英文小字，两种语言下都保留英文原样。 */
      tagline: "SUPPLY NEGOTIATOR",
    },
    /** 站点级元信息（<title> / description / 社交卡片）。首页标题即站点默认标题。 */
    meta: {
      defaultTitle: "链谈 Agent | 供应商智能接待、分层谈判与筛选",
      titleTemplate: "%s | 链谈 Agent",
      description:
        "为中小采购商家自动接待、筛选并分层供应商的谈判系统。大模型负责理解和表达，底线、评分和决策由程序完成。",
      applicationName: "链谈 Agent",
      keywords: ["供应商管理", "采购谈判", "AI 谈判", "供应商筛选", "采购工作台", "供应链"],
      ogTitle: "链谈 Agent · 把时间留给真正值得谈的供应商",
      ogDescription: "自动接待、底线校验、分层转人工：把精力只花在值得谈的供应商上。",
      ogImageAlt: "链谈 Agent 供应商智能谈判工作台",
      ogLocale: "zh_CN",
    },
    actions: {
      cancel: "取消",
      save: "保存",
      saving: "保存中…",
      confirm: "确定",
      close: "关闭",
      retry: "重试",
      backHome: "返回首页",
      loading: "加载中…",
    },
    /** 基础组件里的读屏文案（弹窗关闭、密码可见性、轻提示关闭）。 */
    a11y: {
      close: "关闭",
      closeToast: "关闭提示",
      showPassword: "显示密码",
      hidePassword: "隐藏密码",
    },
    language: {
      /** 切换按钮的无障碍名称。 */
      label: "界面语言",
      /** 每个选项的 title 提示：{target} 会被替换成目标语言全称。 */
      switchTo: "切换到 {target}",
      /** 过渡层文案。{target} = 目标语言全称；用「当前语言」书写，保证看得懂。 */
      transitionTitle: "正在切换到 {target} 界面…",
      transitionBody: "页面内容较多，载入可能需要几秒钟。切换期间请勿关闭或刷新本页。",
      transitionHint: "登录状态与已填写的内容都会保留。",
    },
  },
  en: {
    brand: {
      name: "LianTan",
      suffix: "Agent",
      tagline: "SUPPLY NEGOTIATOR",
    },
    meta: {
      defaultTitle: "LianTan Agent | Supplier intake, tiered negotiation and screening",
      titleTemplate: "%s | LianTan Agent",
      description:
        "A negotiation system that greets, screens and tiers suppliers for small and mid-sized sourcing teams. The model handles understanding and wording; limits, scoring and decisions are made by code.",
      applicationName: "LianTan Agent",
      keywords: [
        "supplier management",
        "procurement negotiation",
        "AI negotiation",
        "supplier screening",
        "sourcing workspace",
        "supply chain",
      ],
      ogTitle: "LianTan Agent · Save your time for the suppliers worth talking to",
      ogDescription:
        "Automatic intake, hard-limit checks, tiered handoff: spend your effort only on the suppliers worth talking to.",
      ogImageAlt: "LianTan Agent supplier negotiation workspace",
      ogLocale: "en_US",
    },
    actions: {
      cancel: "Cancel",
      save: "Save",
      saving: "Saving…",
      confirm: "Confirm",
      close: "Close",
      retry: "Retry",
      backHome: "Back to home",
      loading: "Loading…",
    },
    a11y: {
      close: "Close",
      closeToast: "Dismiss notification",
      showPassword: "Show password",
      hidePassword: "Hide password",
    },
    language: {
      label: "Interface language",
      switchTo: "Switch to {target}",
      transitionTitle: "Switching to {target}…",
      transitionBody:
        "This page carries a lot of content, so loading may take a few seconds. Please don't close or reload the page.",
      transitionHint: "Your session and everything you have typed are kept.",
    },
  },
});
