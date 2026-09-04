const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
export type Negotiation = {
  id: number; score: number; classification: string; status: string; quoted_price: number; moq: number; lead_days: number; payment_days: number;
  hard_fail_reasons: string[]; supplier: { id: number; company_name: string; contact_name: string; region: string; qualifications: string[] };
  product: { id: number; name: string; category: string; description: string };
  messages: { id: number; sender: "supplier" | "ai" | "human" | "system"; content: string; created_at: string }[];
};
export type SupplierReply = {
  negotiation_id: number; status: string; assistant_message: string | null; handoff_required: boolean; classification: "eliminated" | "negotiating" | "qualified"; score: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function evaluateSupplierOffer(payload: SupplierOffer) {
  return request<Evaluation>("/api/suppliers/evaluate", { method: "POST", body: JSON.stringify(payload) });
}

export function handoffNegotiation(negotiationId: number) {
  return request<Negotiation>(`/api/negotiations/${negotiationId}/handoff`, { method: "POST" });
}

export function updateProcurementRule(productId: number, payload: Record<string, unknown>) {
  return request(`/api/rules/${productId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function getManagedProducts() { return request<ManagedProduct[]>("/api/products/manage"); }
export function getProductCatalog() { return request<ManagedProduct[]>("/api/products/catalog"); }
export function createProduct(payload: Omit<ManagedProduct, "id" | "active">) { return request<ManagedProduct>("/api/products", { method: "POST", body: JSON.stringify(payload) }); }
export function updateProduct(id: number, payload: Omit<ManagedProduct, "id">) { return request<ManagedProduct>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function disableProduct(id: number) { return request<{ ok: boolean; detail: string }>(`/api/products/${id}`, { method: "DELETE" }); }
export function getDashboardSummary() { return request<DashboardSummary>("/api/dashboard/summary"); }
export function getNegotiations() { return request<Negotiation[]>("/api/negotiations"); }
export function getNegotiation(id: number) { return request<Negotiation>(`/api/negotiations/${id}`); }
export function sendHumanMessage(id: number, content: string) { return request<Negotiation>(`/api/negotiations/${id}/human-messages`, { method: "POST", body: JSON.stringify({ content }) }); }
export function sendSupplierMessage(id: number, content: string) { return request<SupplierReply>(`/api/negotiations/${id}/messages`, { method: "POST", body: JSON.stringify({ content }) }); }
export function resumeAiNegotiation(id: number) { return request<Negotiation>(`/api/negotiations/${id}/resume-ai`, { method: "POST" }); }
