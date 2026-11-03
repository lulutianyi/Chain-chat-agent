import { defineDict } from "../types";

/** 平台须知页（/terms）：正文、返回注册的入口与页面元信息。 */
export const legal = defineDict({
  zh: {
    meta: {
      title: "平台须知",
      description: "注册与使用链谈 Agent 采购谈判工作台前需要了解的演示范围、数据用途与决策责任说明。",
    },
    backToRegister: "返回注册",
    title: "平台须知",
    /** 第一段带 {brand} 占位符，渲染时用 d.common.brand 拼出的品牌名替换。 */
    paragraphs: [
      "欢迎使用「{brand}」采购谈判工作台。注册并使用本平台即表示你已阅读、理解并同意本须知。",
      "本平台为演示用途：手机验证码为演示码（不发送真实短信），邮箱仅做格式与唯一性校验（不发送验证邮件）。平台基于你填写的采购规则自动评分、筛选供应商并生成谈判话术，最终采购决策与合同签订由商家自行负责。",
      "你提交的商家名称、联系方式、商品规则与谈判记录仅用于本次演示，请勿上传真实敏感信息。平台不会向第三方出售或共享你的数据。",
      "本须知为占位文案，正式上线前请替换为完整、合规的《用户协议》与《隐私政策》。",
    ],
    confirm: "已阅读，返回注册",
  },
  en: {
    meta: {
      title: "Platform notice",
      description:
        "What to know before registering for and using the LianTan Agent sourcing negotiation workspace: demo scope, how your data is used, and who owns the decision.",
    },
    backToRegister: "Back to sign-up",
    title: "Platform notice",
    paragraphs: [
      "Welcome to the {brand} sourcing negotiation workspace. By registering for and using this platform you confirm that you have read, understood and accepted this notice.",
      "This platform is for demonstration purposes: mobile verification codes are demo codes (no real SMS is sent), and email addresses are checked for format and uniqueness only (no verification email is sent). The platform scores suppliers, screens them and drafts negotiation messages from the sourcing rules you enter; the final purchasing decision and the signing of any contract remain the buyer's own responsibility.",
      "The company name, contact details, product rules and negotiation records you submit are used for this demonstration only, so please do not upload real or sensitive information. The platform does not sell or share your data with third parties.",
      "This notice is placeholder copy. Replace it with a complete, compliant User Agreement and Privacy Policy before launch.",
    ],
    confirm: "Agree and go back to sign-up",
  },
});
