import json
from dataclasses import dataclass

import httpx

from app.config import get_settings


SYSTEM_PROMPT = """
你是中小商家的采购洽谈助手。你只负责理解供应商的表达，并生成专业、简洁、有礼的中文回复。
底线、评分、分类和是否转人工已由程序确定，你不得修改或绕过这些决策，不得承诺付款、签约、下单或超出授权的条款。
当程序决策为继续议价时，聚焦收集未知信息，并尝试争取更低价格、更低起订量、更好账期或售后条款。
""".strip()
FALLBACK_REPLY = "感谢补充信息。当前条件未达到我们的优质候选标准。请明确可调整的报价、起订量、账期或资质证明，我们会依据采购规则继续评估。"

TERMS_PROMPT = """
另外，请从供应商最新发言中抽取他本次明确给出的条款数字：只抽取对方清楚说出的数值，未提及或含糊的字段一律填 null，不要推算或臆造。
严格只输出一个 JSON 对象，不要使用 markdown 代码块，格式：
{"reply": "给供应商的中文回复", "quoted_price": 数字或null, "moq": 数字或null, "lead_days": 数字或null, "payment_days": 数字或null}""".strip()


@dataclass
class NegotiationTurn:
    """一次模型生成的结果：回复正文，以及供应商本轮明确给出的条款更新（均为可选项）。"""

    reply: str
    mode: str = "model"  # model | fallback
    quoted_price: float | None = None
    moq: int | None = None
    lead_days: int | None = None
    payment_days: int | None = None


def parse_negotiation_turn(raw: str) -> NegotiationTurn:
    """解析模型输出：优先按 JSON 提取条款与回复，解析失败时整段文本视为回复、不更新条款。"""
    text = raw.strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            data = json.loads(text[start:end + 1])
            reply = str(data.get("reply") or "").strip()

            def number(key, cast=float):
                value = data.get(key)
                return cast(value) if isinstance(value, (int, float)) and value > 0 else None

            if reply:
                return NegotiationTurn(
                    reply=reply,
                    quoted_price=number("quoted_price"),
                    moq=number("moq", int),
                    lead_days=number("lead_days", int),
                    payment_days=number("payment_days", int),
                )
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return NegotiationTurn(reply=text or FALLBACK_REPLY)


async def generate_negotiation_turn(
    *,
    supplier_message: str,
    decision_context: str,
    history: list[dict] | None = None,
    extract_terms: bool = False,
) -> NegotiationTurn:
    settings = get_settings()
    if not settings.deepseek_api_key:
        return NegotiationTurn(reply=FALLBACK_REPLY, mode="fallback")

    system_prompt = f"{SYSTEM_PROMPT}\n\n{TERMS_PROMPT}" if extract_terms else SYSTEM_PROMPT
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": f"程序决策上下文：{decision_context}"},
        *(history or []),
        {"role": "user", "content": supplier_message},
    ]
    payload = {
        "model": settings.deepseek_model,
        "temperature": 0.35,
        "messages": messages,
    }
    headers = {"Authorization": f"Bearer {settings.deepseek_api_key}"}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{settings.deepseek_base_url.rstrip('/')}/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            choice = response.json()["choices"][0]["message"]
            content = (choice.get("content") or choice.get("reasoning_content") or "").strip()
            if not content:
                return NegotiationTurn(reply=FALLBACK_REPLY, mode="fallback")
            return parse_negotiation_turn(content) if extract_terms else NegotiationTurn(reply=content)
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        return NegotiationTurn(reply=FALLBACK_REPLY, mode="fallback")


async def generate_negotiation_reply(*, supplier_message: str, decision_context: str, history: list[dict] | None = None) -> str:
    turn = await generate_negotiation_turn(supplier_message=supplier_message, decision_context=decision_context, history=history)
    return turn.reply
