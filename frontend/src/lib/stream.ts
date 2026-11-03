import { API_BASE, getMerchantToken } from "@/lib/api";

const RECONNECT_DELAY_MS = 3000;

// 连接商家侧全局实时通道：任一会话出现新消息、状态 / 评分 / 分类变化都会触发一次回调。
// 用 fetch 流式读取而非 EventSource，因为 EventSource 无法携带 Authorization 头。
// 返回取消订阅函数（组件卸载时调用）。令牌缺失或鉴权失败时直接返回，不重试。
export function subscribeNegotiations(onChange: () => void): () => void {
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();

  async function connect(): Promise<void> {
    if (stopped) return;
    const token = getMerchantToken();
    if (!token) return; // 未登录：不订阅，靠调用方的轮询兜底
    try {
      const res = await fetch(`${API_BASE}/api/negotiations/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) return; // 令牌失效，停止重连
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (chunk.includes("event: change")) onChange();
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      // 网络中断：静默，稍后重连
    }
    if (!stopped) retryTimer = setTimeout(() => void connect(), RECONNECT_DELAY_MS);
  }

  void connect();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller.abort();
  };
}
