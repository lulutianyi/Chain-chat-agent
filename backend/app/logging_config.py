"""日志与请求追踪。

之前全项目只有一处 logger.warning，验证码还直接 print 到 stdout，
生产上既没有结构化日志也没有请求 ID，出问题基本靠猜。
"""

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar

# 请求级上下文：日志里带上 request_id，便于把一个请求的多条日志串起来。
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename", "module",
    "exc_info", "exc_text", "stack_info", "lineno", "funcName", "created", "msecs",
    "relativeCreated", "thread", "threadName", "processName", "process", "taskName",
}


class JsonFormatter(logging.Formatter):
    """一行一个 JSON 对象，便于被日志平台直接解析。"""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": request_id_var.get(),
            "message": record.getMessage(),
        }
        # 通过 logger.info(..., extra={...}) 传入的自定义字段一并带上
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class HumanFormatter(logging.Formatter):
    """本地开发用的可读格式。"""

    def format(self, record: logging.LogRecord) -> str:
        rid = request_id_var.get()
        prefix = f"[{rid[:8]}] " if rid and rid != "-" else ""
        return f"{self.formatTime(record, '%H:%M:%S')} {record.levelname:<7} {prefix}{record.getMessage()}"


def setup_logging(*, json_output: bool) -> None:
    """配置根 logger。

    uvicorn 自己的 logger 也要挂上同一个 handler，否则它的访问日志
    会和业务日志格式不一致。
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if json_output else HumanFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True


def new_request_id() -> str:
    return uuid.uuid4().hex


class RequestTimer:
    """请求耗时（毫秒）。"""

    def __init__(self) -> None:
        self._start = time.perf_counter()

    @property
    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self._start) * 1000)
