"""上传文件的安全校验。

之前只按「用户给的文件名后缀」判断类型，并且 `await file.read()` 把整个文件
读进内存之后才检查大小——也就是说：一个改名的 .exe 能过校验，
一个几百 MB 的请求会先把内存吃满再被拒绝。
"""

import re

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
READ_CHUNK_BYTES = 64 * 1024

# 按文件头识别真实类型：suffix 与 media_type 都由识别结果决定，
# 不再采信客户端传来的文件名后缀与 Content-Type。
# 键是内部类型名，值是 (标准后缀, 响应用的 media type)。
ALLOWED_TYPES: dict[str, tuple[str, str]] = {
    "jpeg": (".jpg", "image/jpeg"),
    "png": (".png", "image/png"),
    "webp": (".webp", "image/webp"),
    "pdf": (".pdf", "application/pdf"),
}

# 允许客户端使用、但会归一化到标准后缀的等价写法。
SUFFIX_ALIASES = {".jpeg": ".jpg", ".jpg": ".jpg", ".png": ".png", ".webp": ".webp", ".pdf": ".pdf"}

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def detect_file_type(head: bytes) -> str | None:
    """按文件头判断真实类型，不认识则返回 None。"""
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head.startswith(b"%PDF-"):
        return "pdf"
    return None


def sanitize_filename(name: str, *, max_length: int = 200) -> str:
    """清洗文件名。

    - 去掉 CR/LF 与控制字符（否则可以注入 Content-Disposition 响应头）；
    - 去掉路径分隔符（避免把路径当文件名展示）；
    - 截断到列宽以内（库字段是 String(255)，超长在 PostgreSQL 上会直接报错）。
    """
    cleaned = _CONTROL_CHARS.sub("", name or "")
    cleaned = cleaned.replace("\\", "/").split("/")[-1]
    cleaned = cleaned.replace('"', "").strip() or "file"
    if len(cleaned) > max_length:
        # 尽量保留后缀，方便用户辨认：取最后一个点之后 1~10 个字符视为扩展名。
        dot = cleaned.rfind(".")
        tail_length = len(cleaned) - dot - 1
        suffix = cleaned[dot:] if dot != -1 and 1 <= tail_length <= 10 else ""
        cleaned = cleaned[: max_length - len(suffix)] + suffix
    return cleaned


def normalize_suffix(filename: str) -> str:
    """取小写后缀并归一化（.jpeg → .jpg），无后缀返回空串。"""
    dot = (filename or "").rfind(".")
    if dot == -1:
        return ""
    return SUFFIX_ALIASES.get((filename or "")[dot:].lower(), "")


async def read_limited(upload, limit: int = MAX_UPLOAD_BYTES) -> bytes:
    """分块读取，超过上限立刻中止。

    关键点：在读取过程中就判断大小，而不是先 read() 全量再比较——
    后者对超大文件等于先把内存吃满。超限抛 ValueError，由调用方转成 413。
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(READ_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise ValueError(f"文件超过 {limit // (1024 * 1024)}MB 上限")
        chunks.append(chunk)
    return b"".join(chunks)
