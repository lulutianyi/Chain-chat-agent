const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || "";

const SUPPLIER_TOKEN_KEY = "liantan_supplier_token";
const SUPPLIER_PHONE_KEY = "liantan_supplier_phone";

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
};

export type DashboardItem = { id: number; supplier: string; product: string; score: number; price: number; moq: number; status: string; classification: string; is_today: boolean };
export type DashboardSummary = { today_received: number; ai_active: number; qualified: number; minutes_saved: number; items: DashboardItem[] };
export type QualificationFile = { id: string; original_name: string; content_type: string; size_bytes: number; verified: boolean; uploaded_at: string };
export type Negotiation = {
  id: number; score: number; classification: string; status: string; quoted_price: number; moq: number; lead_days: number; payment_days: number;
  hard_fail_reasons: string[]; supplier: { id: number; company_name: string; contact_name: string; region: string; qualifications: string[]; qualification_files: QualificationFile[] };
  product: { id: number; name: string; category: string; description: string };
  messages: { id: number; sender: "supplier" | "ai" | "human" | "system"; content: string; created_at: string }[];
};
export type SupplierReply = {
  negotiation_id: number; status: string; assistant_message: string | null; handoff_required: boolean; classification: "eliminated" | "negotiating" | "qualified"; score: number;
};
export type SupplierCode = { phone: string; code: string; expires_in: number };
export type SupplierToken = { access_token: string; phone: string };
export type EvaluationDataset = { key: string; label: string; filename: string; exists: boolean; count: number; size_bytes: number };
export type RuleEvaluationCase = { case_id: string; group: string; supplier: string; product: string; expected: string; actual: string; matched: boolean; score: number; reasons: string[] };
export type RuleEvaluationResult = {
  total: number; matched: number; accuracy: number; distribution: Record<string, number>;
  matrix: Record<string, Record<string, number>>;
  groups: { group: string; total: number; matched: number; accuracy: number }[];
  mismatches: RuleEvaluationCase[]; notes: string[];
};
export type DialogueEvaluationResult = {
  total: number; passed: number; pass_rate: number; llm_configured: boolean; fallback_count: number; note: string;
  results: { case_id: string; type: string; message: string; intent: string; expected_strategy: string; reply: string; strategy_pass: boolean; safety_pass: boolean; passed: boolean; generation_mode: "model" | "fallback" }[];
};

async function request<T>(path: string, init?: RequestInit, auth: AuthMode = "none"): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body instanceof FormData) delete headers["Content-Type"]; // 让浏览器自带 multipart boundary
  else if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (auth === "admin" && ADMIN_TOKEN) headers["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
  else if (auth === "supplier") {
    const token = getSupplierToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// —— 认证 ——
export function requestSupplierCode(phone: string) {
  return request<SupplierCode>("/api/auth/supplier/request-code", { method: "POST", body: JSON.stringify({ phone }) });
}
export function supplierLogin(phone: string, code: string) {
  return request<SupplierToken>("/api/auth/supplier/login", { method: "POST", body: JSON.stringify({ phone, code }) });
}

// —— 供应商侧 ——
export function evaluateSupplierOffer(payload: SupplierOffer) {
  return request<Evaluation>("/api/suppliers/evaluate", { method: "POST", body: JSON.stringify(payload) }, "supplier");
}
export function getProductCatalog() { return request<ManagedProduct[]>("/api/products/catalog", undefined, "supplier"); }
export function getNegotiation(id: number, auth: AuthMode = "supplier") { return request<Negotiation>(`/api/negotiations/${id}`, undefined, auth); }
export function sendSupplierMessage(id: number, content: string, auth: AuthMode = "supplier") { return request<SupplierReply>(`/api/negotiations/${id}/messages`, { method: "POST", body: JSON.stringify({ content }) }, auth); }
export function getSupplierNegotiations() { return request<Negotiation[]>("/api/supplier/negotiations", undefined, "supplier"); }
export function uploadQualificationFile(file: File) {
  const body = new FormData();
  body.append("file", file);
  return request<QualificationFile>("/api/uploads/qualification-files", { method: "POST", body }, "supplier");
}
export async function openQualificationFile(fileId: string) {
  const response = await fetch(`${API_BASE}/api/uploads/${fileId}`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
  if (!response.ok) throw new Error("文件读取失败");
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
export function getDashboardSummary() { return request<DashboardSummary>("/api/dashboard/summary", undefined, "admin"); }
export function getNegotiations() { return request<Negotiation[]>("/api/negotiations", undefined, "admin"); }
export function sendHumanMessage(id: number, content: string) { return request<Negotiation>(`/api/negotiations/${id}/human-messages`, { method: "POST", body: JSON.stringify({ content }) }, "admin"); }
export function resumeAiNegotiation(id: number) { return request<Negotiation>(`/api/negotiations/${id}/resume-ai`, { method: "POST" }, "admin"); }
export function getEvaluationDatasets() { return request<{ datasets: EvaluationDataset[]; llm_configured: boolean }>("/api/evaluations/datasets"); }
export function runRuleEvaluation() { return request<RuleEvaluationResult>("/api/evaluations/rules", { method: "POST" }); }
export function runDialogueEvaluation(sampleSize: number, dialogueType?: string) { return request<DialogueEvaluationResult>("/api/evaluations/dialogues", { method: "POST", body: JSON.stringify({ sample_size: sampleSize, dialogue_type: dialogueType || null }) }); }
