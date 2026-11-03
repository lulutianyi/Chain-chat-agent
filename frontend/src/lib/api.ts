import { getDictionary } from "@/lib/i18n/dict";
import { getActiveLocale } from "@/lib/i18n/locale-store";
import { format } from "@/lib/i18n/types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// 说明：这里刻意不再引用任何 NEXT_PUBLIC_ADMIN_TOKEN。
// 只要代码里出现该变量，Next 就会把它内联进客户端产物——即使运行时用不到，
// 任何人打开 devtools 也能读到令牌原文。因此前端完全不携带管理员令牌，
// 一律走商家登录拿到的 token；本地调试请用演示账号登录。

const SUPPLIER_TOKEN_KEY = "liantan_supplier_token";
const SUPPLIER_PHONE_KEY = "liantan_supplier_phone";
const MERCHANT_TOKEN_KEY = "liantan_merchant_token";

type AuthMode = "admin" | "supplier" | "none";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function getSupplierToken(): string | null { return safeGet(SUPPLIER_TOKEN_KEY); }
export function getSupplierPhone(): string | null { return safeGet(SUPPLIER_PHONE_KEY); }
export function setSupplierAuth(token: string, phone: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(SUPPLIER_TOKEN_KEY, token); window.localStorage.setItem(SUPPLIER_PHONE_KEY, phone); } catch { /* ignore */ }
}
export function clearSupplierAuth() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(SUPPLIER_TOKEN_KEY); window.localStorage.removeItem(SUPPLIER_PHONE_KEY); } catch { /* ignore */ }
}
export function getMerchantToken(): string | null { return safeGet(MERCHANT_TOKEN_KEY); }
export function setMerchantAuth(token: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(MERCHANT_TOKEN_KEY, token); } catch { /* ignore */ }
}
export function clearMerchantAuth() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(MERCHANT_TOKEN_KEY); } catch { /* ignore */ }
}

/** HTTP 层面的失败：带状态码，调用方可以据此区分「登录失效」与「网络/服务异常」。 */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** 登录态已失效（401/403）。调用方应清掉本地令牌并回登录页，而不是把页面留在半死状态。 */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

// 「这次为什么回到登录页」记在 sessionStorage 里：登录页读一次即清，
// 免去用 useSearchParams（那需要额外包 Suspense 才不破坏静态导出）。
const SESSION_EXPIRED_KEY = "liantan_session_expired";

function markSessionExpired(auth: "admin" | "supplier") {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(SESSION_EXPIRED_KEY, auth); } catch { /* ignore */ }
}

/** 登录页挂载时调用：取走并清掉「登录已过期」标记，用于给用户一句说明。 */
export function consumeSessionExpired(): "admin" | "supplier" | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(SESSION_EXPIRED_KEY);
    if (value === null) return null;
    window.sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    return value === "admin" || value === "supplier" ? value : null;
  } catch { return null; }
}

/**
 * 令牌失效时的统一收尾：清本地登录态 → 记下原因 → 回对应登录页。
 *
 * 走整页跳转（而不是 router.replace）是刻意的：会话已经失效，
 * 客户端里缓存的资料、轮询定时器、SSE 订阅都该随之作废，重载最干净。
 */
export function forceLoginRedirect(auth: "admin" | "supplier", next?: string) {
  if (typeof window === "undefined") return;
  markSessionExpired(auth);
  if (auth === "admin") clearMerchantAuth();
  else clearSupplierAuth();
  if (auth === "supplier") {
    const target = next && next.startsWith("/supplier") ? `?next=${encodeURIComponent(next)}` : "";
    window.location.replace(`/supplier/login${target}`);
    return;
  }
  window.location.replace("/login");
}

export type SupplierOffer = {
  product_id: number;
  company_name: string;
  contact_name: string;
  phone: string;
  region: string;
  quoted_price: number;
  moq: number;
  lead_days: number;
  payment_days: number;
  qualifications: string[];
  qualification_file_ids: string[];
  cooperation_note: string;
  cooperation_rating: number;
};

export type Evaluation = {
  negotiation_id: number | null;
  hard_pass: boolean;
  hard_fail_reasons: string[];
  score: number;
  classification: "eliminated" | "negotiating" | "qualified";
  action: "polite_close" | "continue_ai_negotiation" | "manual_handoff";
  score_breakdown: Record<string, number>;
};

export type ManagedProduct = {
  id: number; name: string; category: string; description: string; active: boolean;
  target_price: number; hard_max_price: number; max_moq: number; max_lead_days: number;
  max_payment_days: number; handoff_score: number; required_qualifications: string[]; preferred_regions: string[];
  scoring_model: "custom_rule" | "ml"; score_weights: Record<string, number>;
  ml_model: string; ml_qualify_threshold: number; ml_eliminate_threshold: number;
};

export type DashboardItem = {
  id: number; supplier: string; product: string; score: number; price: number; moq: number;
  status: string; classification: string; is_today: boolean; created_at: string; last_activity_at: string;
};
export type DashboardSummary = {
  today_received: number; ai_active: number; qualified: number; minutes_saved: number;
  items: DashboardItem[]; range_days: number; range_received: number;
};
export type QualificationFile = { id: string; original_name: string; content_type: string; size_bytes: number; verified: boolean; ocr_status: string; ocr_company: string; ocr_detail: string; uploaded_at: string };
export type Negotiation = {
  id: number; score: number; classification: string; status: string; quoted_price: number; moq: number; lead_days: number; payment_days: number;
  hard_fail_reasons: string[]; supplier: { id: number; company_name: string; contact_name: string; region: string; qualifications: string[]; qualification_files: QualificationFile[] };
  product: { id: number; name: string; category: string; description: string };
  messages: { id: number; sender: "supplier" | "ai" | "human" | "system"; content: string; created_at: string }[];
};
export type SupplierReply = {
  negotiation_id: number; status: string; assistant_message: string | null; handoff_required: boolean; classification: "eliminated" | "negotiating" | "qualified"; score: number;
};
export type SupplierCode = { phone: string; code: string | null; expires_in: number; demo_mode?: boolean };
export type SupplierToken = { access_token: string; phone: string };
export type MerchantProfile = { store_name: string; logo_emoji: string; logo_image: string; contact: string; category: string };
export type MerchantToken = MerchantProfile & { access_token: string };
export type MerchantCode = { phone: string; code: string | null; expires_in: number; demo_mode?: boolean; registered?: boolean };
export type RegisterPayload = {
  account: string;
  password: string;
  store_name: string;
  phone: string;
  email: string;
  agree_terms: boolean;
};
export type EvaluationDataset = { key: string; label: string; filename: string; exists: boolean; count: number; size_bytes: number };
/** 后端返回的结构化硬规则原因；前端按 code 翻译，避免英文界面直接显示中文 reasons。 */
export type RuleReasonCode = {
  code: "price_above_ceiling" | "moq_above_max" | "lead_time_above_max" | "payment_below_min" | "missing_qualifications";
  quoted_price?: number; hard_max_price?: number;
  moq?: number; max_moq?: number;
  lead_days?: number; max_lead_days?: number;
  payment_days?: number; min_payment_days?: number;
  qualifications?: string[];
};
export type RuleEvaluationCase = { case_id: string; group: string; supplier: string; product: string; expected: string; actual: string; matched: boolean; score: number; reasons: string[]; reason_codes?: RuleReasonCode[] };
export type RuleEvaluationResult = {
  total: number; matched: number; accuracy: number; distribution: Record<string, number>;
  matrix: Record<string, Record<string, number>>;
  groups: { group: string; total: number; matched: number; accuracy: number }[];
  mismatches: RuleEvaluationCase[]; notes: string[]; note_keys?: string[];
};
export type DialogueEvaluationResult = {
  total: number; passed: number; pass_rate: number; llm_configured: boolean; fallback_count: number; note: string; note_key?: string;
  results: { case_id: string; type: string; message: string; intent: string; expected_strategy: string; reply: string; strategy_pass: boolean; safety_pass: boolean; passed: boolean; generation_mode: "model" | "fallback" }[];
};
export type MLEvaluationResult = {
  model: string; accuracy: number; candidate_accuracy: Record<string, number>; cv_accuracy_mean: number;
  confusion_matrix: Record<string, Record<string, number>>; per_class_recall: Record<string, number>;
  feature_importance: Record<string, number>; decision_tree_rules: string | null; rule_engine_baseline_accuracy: number; note: string;
};

// —— 失败原因诊断 ——
// 背景：接口报错时前端此前直接把后端 detail 原文抛给用户，于是界面上会出现
// 「Not Found」「Failed to fetch」「[object Object]」这类原文——用户看到 not found
// 只会怀疑数据库断了或鉴权坏了，而我们连「后端没起来」「后端是旧版本」
// 「参数格式不对」都分不出来。这里把三类失败拆开，各给一句能照着做的中文。

/**
 * 取当前语言的词典。必须在真正要出提示语的函数体内调用：
 * 写在模块顶层会在 import 的那一刻把语言定死，切语言后提示语不会跟着变。
 */
function dict() {
  return getDictionary(getActiveLocale());
}

/** 品牌名两种语言写法不同（链谈 Agent / LianTan Agent），因此同样从词典取。 */
function brandName(): string {
  return `${dict().common.brand.name} ${dict().common.brand.suffix}`;
}

/** 后端字段名 → 用户看得懂的名字。键必须与后端字段名一致，只翻译展示出去的值。 */
function fieldLabel(field: string): string {
  const labels = dict().system.api.fieldLabels;
  const map: Record<string, string> = {
    account: labels.account,
    password: labels.password,
    phone: labels.phone,
    code: labels.code,
    email: labels.email,
    store_name: labels.storeName,
    agree_terms: labels.agreeTerms,
    current_password: labels.currentPassword,
    new_password: labels.newPassword,
    content: labels.content,
  };
  return map[field] ?? field;
}

type Probe =
  | { state: "ok"; version: string | null }
  | { state: "not-backend" }
  | { state: "offline" };

let probeCache: { at: number; value: Probe } | null = null;

/** 回探 /api/health，用来区分「后端没起来」和「后端还是旧版本」。5 秒内复用结果。 */
async function probeBackend(): Promise<Probe> {
  if (probeCache && Date.now() - probeCache.at < 5000) return probeCache.value;
  let value: Probe;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { version?: string; status?: string } | null;
      value = body && body.status === "ok" ? { state: "ok", version: body.version ?? null } : { state: "not-backend" };
    } else if (response.status === 404) {
      // 有服务在监听，但不认识 /api/health——地址多半指错了地方（例如指到了前端）。
      value = { state: "not-backend" };
    } else {
      value = { state: "offline" };
    }
  } catch {
    value = { state: "offline" };
  }
  probeCache = { at: Date.now(), value };
  return value;
}

function offlineMessage(probe: Probe): string {
  const { errors } = dict().system.api;
  if (probe.state === "not-backend") {
    return format(errors.notBackend, { base: API_BASE, brand: brandName() });
  }
  return format(errors.unreachable, { base: API_BASE });
}

/** 把一条 FastAPI 校验错误翻译成人话。FastAPI 的 msg 是英文，直接展示等于没说。 */
function describeValidationItem(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const { fieldLabels, validation } = dict().system.api;
  const record = item as { loc?: unknown[]; type?: string };
  const path = Array.isArray(record.loc) ? record.loc.filter((part) => part !== "body") : [];
  const field = path.length ? String(path[path.length - 1]) : "";
  const label = fieldLabel(field);
  const type = record.type ?? "";
  if (field === "agree_terms") return validation.agreeTerms;
  if (type.includes("missing")) return format(validation.missing, { field: field ? label : fieldLabels.required });
  if (field === "phone") return validation.phone;
  if (field === "code") return validation.code;
  if (field === "email") return validation.email;
  if (field === "account" && (type.includes("pattern") || type.includes("short"))) return validation.account;
  if (field === "password" && (type.includes("short") || type.includes("length"))) return validation.password;
  return label ? format(validation.invalid, { field: label }) : null;
}

/** detail 可能是字符串、FastAPI 的校验错误数组，或对象；取不出去就返回 null 走兜底。 */
function messageFromDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    const text = detail.trim();
    // "Not Found" 是 FastAPI 在路由不存在时的默认值，等于没写，交给 404 分支去探因。
    if (!text || text === "Not Found") return null;
    // 后端自己的业务报错文案：属于后端内容，原样展示，不由前端翻译。
    return text;
  }
  if (Array.isArray(detail)) {
    const messages = detail.map(describeValidationItem).filter((item): item is string => Boolean(item));
    return messages.length ? messages[0] : dict().system.api.validation.invalidSubmission;
  }
  if (detail && typeof detail === "object") {
    const nested = (detail as { message?: unknown; detail?: unknown }).message ?? (detail as { detail?: unknown }).detail;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return null;
}

/** 非 2xx 时决定给用户看什么。 */
async function explainFailure(status: number, body: unknown, path: string): Promise<string> {
  const { errors } = dict().system.api;
  const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : undefined;
  const fromDetail = messageFromDetail(detail);
  if (fromDetail) return fromDetail;
  if (status === 404) {
    const probe = await probeBackend();
    if (probe.state === "ok") {
      return format(errors.staleBackend, { version: probe.version ?? errors.unknownVersion, path });
    }
    return offlineMessage(probe);
  }
  if (status === 503) return errors.dbUnavailable;
  if (status >= 500) return format(errors.serverError, { status });
  return format(errors.requestFailed, { status });
}

async function request<T>(path: string, init?: RequestInit, auth: AuthMode = "none"): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body instanceof FormData) delete headers["Content-Type"]; // 让浏览器自带 multipart boundary
  else if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (auth === "admin") {
    // 采购方登录后的商家 token；未登录则不带鉴权头，由后端返回 401。
    const token = getMerchantToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  else if (auth === "supplier") {
    const token = getSupplierToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    // fetch 直接抛错 = 请求根本没送到后端：服务没起来、被跨域拦下、或混合内容被浏览器拦。
    const probe = await probeBackend();
    if (probe.state === "ok") {
      const errors = dict().system.api.errors;
      const origin = typeof window === "undefined" ? errors.currentPage : window.location.origin;
      throw new Error(format(errors.blocked, { base: API_BASE, origin }));
    }
    throw new Error(offlineMessage(probe));
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(await explainFailure(response.status, body, path), response.status);
  }
  const body = await response.json().catch(() => null);
  if (body === null) {
    throw new Error(format(dict().system.api.errors.nonJson, { path, brand: brandName() }));
  }
  return body as T;
}

// —— 认证 ——
export function requestSupplierCode(phone: string) {
  return request<SupplierCode>("/api/auth/supplier/request-code", { method: "POST", body: JSON.stringify({ phone }) });
}
export function supplierLogin(phone: string, code: string) {
  return request<SupplierToken>("/api/auth/supplier/login", { method: "POST", body: JSON.stringify({ phone, code }) });
}
export function supplierLogout() {
  return request<{ ok: boolean }>("/api/auth/supplier/logout", { method: "POST" }, "supplier");
}

// —— 采购方（商家）账号 ——
export function merchantLogin(account: string, password: string) {
  return request<MerchantToken>("/api/auth/merchant/login", { method: "POST", body: JSON.stringify({ account, password }) });
}
export function requestMerchantCode(phone: string) {
  return request<MerchantCode>("/api/auth/merchant/request-code", { method: "POST", body: JSON.stringify({ phone }) });
}
export function merchantCodeLogin(phone: string, code: string) {
  return request<MerchantToken>("/api/auth/merchant/login-code", { method: "POST", body: JSON.stringify({ phone, code }) });
}
export function merchantRegister(payload: RegisterPayload) {
  return request<MerchantToken>("/api/auth/merchant/register", { method: "POST", body: JSON.stringify(payload) });
}
// 找回密码：邮箱验证码 → 一次性重置令牌 → 设置新密码（重置后必须重新登录）。
export type ForgotPasswordResponse = { ok: boolean; expires_in: number };
export type ResetTokenResponse = { reset_token: string; expires_in: number };
export function requestMerchantPasswordReset(email: string) {
  return request<ForgotPasswordResponse>("/api/auth/merchant/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}
export function verifyMerchantResetCode(email: string, code: string) {
  return request<ResetTokenResponse>("/api/auth/merchant/forgot-password/verify", { method: "POST", body: JSON.stringify({ email, code }) });
}
export function resetMerchantPassword(reset_token: string, new_password: string) {
  return request<{ ok: boolean }>("/api/auth/merchant/forgot-password/reset", { method: "POST", body: JSON.stringify({ reset_token, new_password }) });
}
export function merchantLogout() {
  return request<{ ok: boolean }>("/api/auth/merchant/logout", { method: "POST" }, "admin");
}
export function changeMerchantPassword(current_password: string, new_password: string) {
  // 改密会吊销所有旧令牌，响应里带回新令牌，前端必须换掉本地这份。
  return request<{ ok: boolean; access_token?: string }>("/api/auth/merchant/password", { method: "PUT", body: JSON.stringify({ current_password, new_password }) }, "admin");
}
export function getMerchantProfile() {
  return request<MerchantProfile>("/api/merchant/profile", undefined, "admin");
}
export function updateMerchantProfile(payload: MerchantProfile) {
  return request<MerchantProfile>("/api/merchant/profile", { method: "PUT", body: JSON.stringify(payload) }, "admin");
}

// —— 供应商侧 ——
export function evaluateSupplierOffer(payload: SupplierOffer) {
  return request<Evaluation>("/api/suppliers/evaluate", { method: "POST", body: JSON.stringify(payload) }, "supplier");
}
export function getProductCatalog() { return request<ManagedProduct[]>("/api/products/catalog", undefined, "supplier"); }
export function getNegotiation(id: number, auth: AuthMode = "supplier") { return request<Negotiation>(`/api/negotiations/${id}`, undefined, auth); }
export function sendSupplierMessage(id: number, content: string, auth: AuthMode = "supplier") { return request<SupplierReply>(`/api/negotiations/${id}/messages`, { method: "POST", body: JSON.stringify({ content }) }, auth); }
export function getSupplierNegotiations() { return request<Negotiation[]>("/api/supplier/negotiations", undefined, "supplier"); }
export function uploadQualificationFile(file: File, companyName: string) {
  const body = new FormData();
  body.append("file", file);
  body.append("company_name", companyName);
  return request<QualificationFile>("/api/uploads/qualification-files", { method: "POST", body }, "supplier");
}
export async function openQualificationFile(fileId: string) {
  const token = getMerchantToken();
  const response = await fetch(`${API_BASE}/api/uploads/${fileId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(dict().system.api.errors.fileRead);
  const url = URL.createObjectURL(await response.blob());
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export function toggleQualificationVerified(fileId: string) { return request<QualificationFile>(`/api/qualification-files/${fileId}/verify`, { method: "POST" }, "admin"); }

// —— 商家侧 ——
export function handoffNegotiation(negotiationId: number) {
  return request<Negotiation>(`/api/negotiations/${negotiationId}/handoff`, { method: "POST" }, "admin");
}
export function updateProcurementRule(productId: number, payload: Record<string, unknown>) {
  return request(`/api/rules/${productId}`, { method: "PUT", body: JSON.stringify(payload) }, "admin");
}
export function getManagedProducts() { return request<ManagedProduct[]>("/api/products/manage", undefined, "admin"); }
export function createProduct(payload: Omit<ManagedProduct, "id" | "active">) { return request<ManagedProduct>("/api/products", { method: "POST", body: JSON.stringify(payload) }, "admin"); }
export function updateProduct(id: number, payload: Omit<ManagedProduct, "id">) { return request<ManagedProduct>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }, "admin"); }
export function disableProduct(id: number) { return request<{ ok: boolean; detail: string }>(`/api/products/${id}`, { method: "DELETE" }, "admin"); }
// days=0 表示全部历史；其余为「最近 N 天内新提交」的统计口径。
export function getDashboardSummary(days = 0) {
  return request<DashboardSummary>(`/api/dashboard/summary?days=${days}`, undefined, "admin");
}
export function getNegotiations() { return request<Negotiation[]>("/api/negotiations", undefined, "admin"); }
export function sendHumanMessage(id: number, content: string) { return request<Negotiation>(`/api/negotiations/${id}/human-messages`, { method: "POST", body: JSON.stringify({ content }) }, "admin"); }
export function resumeAiNegotiation(id: number) { return request<Negotiation>(`/api/negotiations/${id}/resume-ai`, { method: "POST" }, "admin"); }
export function getEvaluationDatasets() { return request<{ datasets: EvaluationDataset[]; llm_configured: boolean }>("/api/evaluations/datasets", undefined, "admin"); }
export function runRuleEvaluation() { return request<RuleEvaluationResult>("/api/evaluations/rules", { method: "POST" }, "admin"); }
export function runDialogueEvaluation(sampleSize: number, dialogueType?: string) { return request<DialogueEvaluationResult>("/api/evaluations/dialogues", { method: "POST", body: JSON.stringify({ sample_size: sampleSize, dialogue_type: dialogueType || null }) }, "admin"); }
export function runMLEvaluation() { return request<MLEvaluationResult>("/api/ml/evaluate", { method: "POST" }, "admin"); }
