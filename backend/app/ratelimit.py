"""轻量级进程内限流。

为什么不用 slowapi 之类：当前部署是单实例（Render 免费档），
这点逻辑自己写反而更透明，也少一个依赖。

重要限制：计数器存在进程内存里，因此
- 多 worker / 多实例部署时每个进程各算各的，实际额度会被放大；
- 进程重启即清零。
真正上线多实例时应换成 Redis 计数（或直接交给网关限流）。
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class SlidingWindowLimiter:
    """滑动窗口计数器：每个 key 记录最近若干次命中的时间戳。"""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_prune = time.monotonic()

    def _prune(self, now: float) -> None:
        """定期清理过期 key，避免长期运行后内存只增不减。"""
        if now - self._last_prune < 300:
            return
        self._last_prune = now
        for key in list(self._hits):
            hits = self._hits[key]
            while hits and now - hits[0] > 3600:
                hits.popleft()
            if not hits:
                self._hits.pop(key, None)

    def peek(self, key: str, limit: int, window_seconds: int) -> int:
        """只看是否超限，不记录。返回 0 表示放行，否则返回建议的重试秒数。"""
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            hits = self._hits[key]
            while hits and now - hits[0] > window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                return max(1, int(window_seconds - (now - hits[0])) + 1)
            return 0

    def record(self, key: str) -> None:
        """记录一次命中（只在需要计入额度时调用，例如登录失败）。"""
        with self._lock:
            self._hits[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        """清空某个 key 的计数（例如登录成功后，之前的失败次数一笔勾销）。"""
        with self._lock:
            self._hits.pop(key, None)

    def hit(self, key: str, limit: int, window_seconds: int) -> int:
        """检查并记录一次命中（适用于「每次调用都该计入」的场景，如取验证码）。"""
        retry_after = self.peek(key, limit, window_seconds)
        if retry_after:
            return retry_after
        self.record(key)
        return 0

    def reset(self) -> None:
        """清空所有计数（测试用）。"""
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    """取客户端 IP。

    部署在 Render / Vercel 这类反向代理后面时，真实来源在 X-Forwarded-For
    的第一段；直连时退回 socket 地址。
    注意：这信任了平台代理，如果服务能被直接访问，该头可被伪造——
    因此限流只作为「提高攻击成本」的手段，鉴权本身不能依赖它。
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce(request: Request, *, scope: str, key: str, limit: int, window_seconds: int, message: str) -> None:
    """检查并记录一次命中，超限则抛 429。适用于「每次调用都计入」的端点。"""
    retry_after = limiter.hit(f"{scope}:{key}", limit, window_seconds)
    if retry_after:
        # 把等待时间写进 detail：只回「请稍后再试」，用户不知道是 3 秒还是 1 小时，
        # 只会不停重试，把额度耗得更彻底。Retry-After 头保留给程序化调用方。
        raise HTTPException(
            status_code=429,
            detail=f"{message}（约 {retry_after} 秒后可再试）",
            headers={"Retry-After": str(retry_after)},
        )


def guard(*, scope: str, key: str, limit: int, window_seconds: int, message: str) -> str:
    """只检查不记录，返回用于后续 record/clear 的完整 key。

    用于登录这类「只有失败才该计入额度」的场景：
    若把成功登录也计入，用户在 15 分钟内正常登录 5 次就会被自己锁在门外。
    """
    full_key = f"{scope}:{key}"
    retry_after = limiter.peek(full_key, limit, window_seconds)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail=f"{message}（约 {retry_after} 秒后可再试）",
            headers={"Retry-After": str(retry_after)},
        )
    return full_key


def record_failure(full_key: str) -> None:
    limiter.record(full_key)


def clear_failures(full_key: str) -> None:
    limiter.clear(full_key)

