import json
import logging
import re
from dataclasses import dataclass

import httpx

from app.config import get_settings


logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
你是代表中小商家与供应商沟通的采购人员。请认真理解供应商最新一句话和完整对话历史，并结合程序提供的当前条款、采购目标与安全边界，自主判断如何自然地回应和推进协商。不要套用固定话术，也不要无视、曲解或重复追问对方已经明确表达的内容。供应商明确拒绝调整某项条件时，尊重这一最新态度，不要立刻再次要求同一项调整；后续如何继续由你结合上下文判断。

回复只写1至2句话，不超过80个汉字。语气真诚、平等、专业，像真实采购人员聊天。不得虚构事实，不得擅自承诺下单、签约、付款或突破程序给出的采购底线。
""".strip()

# 接口失败时明确告知系统状态，避免把程序兜底误认为模型回答。
FALLBACK_REPLY = "模型服务暂时不可用，本轮未生成谈判回复，请稍后重试。"

TERMS_PROMPT = """
请严格输出一个 JSON 对象，不要使用 Markdown。reply 字段仍按系统提示自由回复；另外只提取供应商最新发言中明确给出的数字，未提及的字段填 null：
{"reply":"回复内容","quoted_price":null,"moq":null,"lead_days":null,"payment_days":null}
""".strip()


@dataclass
class NegotiationTurn:
    """一次模型生成的回复，以及可选的供应商条款更新。"""

    reply: str
    mode: str = "model"  # model | fallback
    quoted_price: float | None = None
    moq: int | None = None
    lead_days: int | None = None
    payment_days: int | None = None


def parse_negotiation_turn(raw: str) -> NegotiationTurn:
    """兼容 JSON 与纯文本模型输出。"""
    text = raw.strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            data = json.loads(text[start:end + 1])
            reply = str(data.get("reply") or "").strip()

            def number(key, cast=float):
                value = data.get(key)
                if isinstance(value, str):
                    cleaned = value.strip().replace(",", "")
                    match = re.search(r"\d+(?:\.\d+)?", cleaned)
                    value = float(match.group()) if match else None
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

    def fallback(reason: str) -> NegotiationTurn:
        logger.warning("Negotiation model fallback: %s (model=%s)", reason, settings.deepseek_model)
        return NegotiationTurn(reply=FALLBACK_REPLY, mode="fallback")

    if not settings.deepseek_api_key:
        return fallback("missing API key")

    system_prompt = f"{SYSTEM_PROMPT}\n\n{TERMS_PROMPT}" if extract_terms else SYSTEM_PROMPT
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": f"程序提供的事实与边界：{decision_context}"},
        *(history or []),
        {"role": "user", "content": supplier_message},
    ]
    payload = {
        "model": settings.deepseek_model,
        "temperature": 0.75,
        "messages": messages,
    }
    if extract_terms:
        payload["response_format"] = {"type": "json_object"}
    headers = {"Authorization": f"Bearer {settings.deepseek_api_key}"}

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            choice = response.json()["choices"][0]["message"]
            content = (choice.get("content") or choice.get("reasoning_content") or "").strip()
            if not content:
                return fallback("empty model response")
            return parse_negotiation_turn(content) if extract_terms else NegotiationTurn(reply=content)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        status = f" HTTP {exc.response.status_code}" if isinstance(exc, httpx.HTTPStatusError) else ""
        return fallback(f"{type(exc).__name__}{status}")


async def generate_negotiation_reply(
    *, supplier_message: str, decision_context: str, history: list[dict] | None = None,
) -> str:
    turn = await generate_negotiation_turn(
        supplier_message=supplier_message,
        decision_context=decision_context,
        history=history,
    )
    return turn.reply


async def generate_opening_message(
    *,
    supplier_name: str,
    product_name: str,
    quoted_price: float,
    target_price: float,
    moq: int,
    max_moq: int,
    lead_days: int,
    max_lead_days: int,
    payment_days: int,
    min_payment_days: int,
) -> str:
    """供应商提交方案后，由采购模型自由生成开场消息。"""
    turn = await generate_negotiation_turn(
        supplier_message="这是新会话，请由采购方先发一条消息。",
        decision_context=(
            f"供应商：{supplier_name}；商品：{product_name}；报价 ¥{quoted_price:g}，目标价 ¥{target_price:g}；"
            f"起订量 {moq}，上限 {max_moq}；交期 {lead_days} 天，上限 {max_lead_days} 天；"
            f"账期 {payment_days} 天，最低期望 {min_payment_days} 天。"
        ),
    )
    return turn.reply


async def generate_boundary_recovery_reply(
    *,
    supplier_message: str,
    reasons: list[str],
    history: list[dict] | None = None,
    previous_price: float | None = None,
    previous_moq: int | None = None,
    previous_lead_days: int | None = None,
    previous_payment_days: int | None = None,
) -> str:
    """最新组合触碰底线时，让模型在明确边界内继续协商。"""
    previous = ""
    if previous_price is not None:
        previous = (
            f"上一轮可继续协商的条件：报价 ¥{previous_price:g}/件、起订量 {previous_moq} 件、"
            f"交期 {previous_lead_days} 天、账期 {previous_payment_days} 天。"
        )
    turn = await generate_negotiation_turn(
        supplier_message=supplier_message,
        history=history,
        decision_context=(
            f"最新方案触碰采购底线：{'；'.join(reasons)}。当前方案不能接受，但会话继续。{previous}"
        ),
    )
    return turn.reply
