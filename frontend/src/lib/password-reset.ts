/** 找回密码流程跨页面共享的常量、存储与密码规则，避免两个页面各写一份。 */

/** 验证通过后把一次性令牌放在 sessionStorage，而不是 URL：避免留在历史记录与 Referer 里。 */
export const RESET_TOKEN_KEY = "liantan_reset_token";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** sessionStorage 在隐私模式/禁用存储时可能抛错；读写都收敛成布尔/空值，由页面给提示。 */
export function saveResetToken(token: string): boolean {
  try {
    window.sessionStorage.setItem(RESET_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function readResetToken(): string | null {
  try {
    return window.sessionStorage.getItem(RESET_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearResetToken(): void {
  try {
    window.sessionStorage.removeItem(RESET_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** 与注册页 / 账号安全页保持同一套密码规则。 */
export function passwordChecks(pw: string, labels: { length: string; letter: string; digit: string }) {
  return [
    { ok: pw.length > 8, label: labels.length },
    { ok: /[a-zA-Z]/.test(pw), label: labels.letter },
    { ok: /[0-9]/.test(pw), label: labels.digit },
  ];
}
