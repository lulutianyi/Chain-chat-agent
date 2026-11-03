import { defineDict } from "../types";

/**
 * 系统级文案：404 页、错误页，以及 api.ts 里所有面向用户的接口失败提示。
 *
 * 这里只放「前端自己生成的」话术。后端返回的 detail 原文（例如接口的业务报错）
 * 属于后端内容，前端原样展示，不进词典。
 */
export const system = defineDict({
  zh: {
    notFound: {
      title: "页面不存在",
      body: "你访问的页面可能已被移动或删除。可以回到首页，或直接前往登录。",
      goLogin: "前往登录",
    },
    error: {
      title: "页面出了点问题",
      body: "已记录这次异常。你可以重试一次；如果一直失败，请稍后再试或联系管理员。",
      /** {digest} = Next 给这次异常的编号，方便用户报给开发。 */
      digest: "错误编号：{digest}",
    },
    api: {
      /** 后端字段名 → 用户看得懂的名字。键与后端字段名一一对应，只翻译值。 */
      fieldLabels: {
        account: "登录账号",
        password: "密码",
        phone: "手机号",
        code: "验证码",
        email: "邮箱",
        storeName: "商家名称",
        agreeTerms: "平台须知",
        currentPassword: "原密码",
        newPassword: "新密码",
        content: "消息内容",
        /** 字段名都没拿到时的兜底称呼。 */
        required: "必填项",
      },
      validation: {
        agreeTerms: "请先阅读并勾选同意平台须知",
        phone: "请输入 11 位手机号",
        code: "请输入 6 位验证码",
        email: "请输入正确的邮箱地址",
        account: "账号需 3-80 位，仅限字母、数字、下划线",
        password: "密码长度需大于 8 个字符",
        missing: "{field}不能为空",
        invalid: "{field}填写有误",
        invalidSubmission: "提交的内容格式不正确，请检查后重试",
      },
      errors: {
        notBackend:
          "后端地址 {base} 上的服务不是 {brand} 后端（该地址没有 /api/health 接口）。请检查 NEXT_PUBLIC_API_URL 是否误填成了前端网址。",
        unreachable:
          "无法连接后端服务 {base}。请确认后端已启动；若前端是部署在别处的，请检查 NEXT_PUBLIC_API_URL 是否指向正确的后端地址。",
        blocked:
          "请求没能送达后端。{base} 本身可访问，通常是后端 FRONTEND_ORIGIN 没有包含 {origin}，请求被跨域拦截。",
        /** 取不到 window.location.origin 时的兜底说法（服务端渲染阶段）。 */
        currentPage: "当前网页",
        nonJson: "后端返回了非 JSON 响应，接口 {path} 可能不是 {brand} 后端。",
        staleBackend:
          "后端服务可达（版本 {version}），但没有 {path} 这个接口——后端很可能还停在旧版本，请更新后端代码并重启。",
        dbUnavailable: "后端数据库暂时不可用，请稍后重试；若持续出现，请检查后端 DATABASE_URL 配置。",
        serverError: "后端处理失败（HTTP {status}）。可把顶栏请求编号提供给开发排查。",
        requestFailed: "请求失败（HTTP {status}）",
        unknownVersion: "未知",
        fileRead: "文件读取失败",
      },
    },
  },
  en: {
    notFound: {
      title: "Page not found",
      body: "The page you are looking for may have been moved or deleted. Go back to the home page, or sign in instead.",
      goLogin: "Go to sign in",
    },
    error: {
      title: "Something went wrong on this page",
      body: "This error has been logged. Try again; if it keeps failing, come back later or contact your administrator.",
      digest: "Error ID: {digest}",
    },
    api: {
      fieldLabels: {
        account: "Account",
        password: "Password",
        phone: "Phone number",
        code: "Verification code",
        email: "Email address",
        storeName: "Company name",
        agreeTerms: "Platform notice",
        currentPassword: "Current password",
        newPassword: "New password",
        content: "Message",
        required: "Required field",
      },
      validation: {
        agreeTerms: "Please read and tick the platform notice first",
        phone: "Enter an 11-digit phone number",
        code: "Enter the 6-digit verification code",
        email: "Enter a valid email address",
        account: "The account must be 3-80 characters, using letters, digits and underscores only",
        password: "The password must be longer than 8 characters",
        missing: "{field} is required",
        invalid: "Please check the {field} field",
        invalidSubmission: "Some of the submitted values are in the wrong format. Please check them and try again.",
      },
      errors: {
        notBackend:
          "The service at {base} is not the {brand} backend: that address has no /api/health endpoint. Check that NEXT_PUBLIC_API_URL has not been pointed at the frontend URL by mistake.",
        unreachable:
          "Cannot reach the backend service at {base}. Make sure the backend is running; if the frontend is deployed elsewhere, check that NEXT_PUBLIC_API_URL points to the correct backend address.",
        blocked:
          "The request never reached the backend. {base} itself is reachable, which usually means the backend's FRONTEND_ORIGIN does not include {origin}, so the request was blocked by CORS.",
        currentPage: "the current page",
        nonJson: "The backend returned a non-JSON response. The endpoint {path} may not belong to the {brand} backend.",
        staleBackend:
          "The backend is reachable (version {version}) but has no endpoint {path} — it is most likely still on an older version. Update the backend code and restart it.",
        dbUnavailable:
          "The backend database is temporarily unavailable. Try again in a moment; if it keeps happening, check the backend DATABASE_URL setting.",
        serverError:
          "The backend failed to process the request (HTTP {status}). You can give the request ID shown in the top bar to your developer.",
        requestFailed: "Request failed (HTTP {status})",
        unknownVersion: "unknown",
        fileRead: "Could not load the file. Close the window and try again.",
      },
    },
  },
});
