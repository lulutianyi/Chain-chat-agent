import json
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

import httpx

from app.config import get_settings


SYSTEM_PROMPT = """
你是中小商家的采购洽谈助手。目标是用自然、克制、有诚意的中文推动供应商继续协商，而不是机械压价。

【回复长度】
默认只回复1至2句话，尽量不超过80个汉字；确有两个独立问题时最多3句话。直接回应对方最新一句，不复述整段历史，不写总结式长段落。

【谈判推进】
1. 供应商给出新让步时，用半句话简短认可，然后只推进当前最重要的一项；不要同时罗列多个要求。
2. 已确认或已经达到程序目标的价格、起订量、交期、账期不得再次询问，也不要要求对方“维持不变”。
3. 如果供应商连续两次发言都没有调整报价、起订量、交期或账期等明确数值，必须主动给出一个具体、双方可讨论的折中数值，不再泛泛询问“还有没有空间”。折中数值应位于当前条件与程序目标之间，并保持在程序允许范围内。
4. 给出折中数值时使用委婉的单点提议，例如：“我们不反复压价了，51元/件是否可以作为双方的折中点？”也可以提出一次条件交换，但只能表达“可进一步评估/推进”，不能承诺下单。
5. 如果对方拒绝折中方案，先询问主要成本障碍，或改问阶梯价、不同起订量对应价格、交期与价格交换等新信息，不得原样重复上一轮要求。

【供应商体验】
不必每轮都说感谢。避免连续使用相同开头、句式和结尾，尤其不要复读“感谢您的支持”“想再确认两点”“推进会更顺畅”“后续补货优先考虑”。
简要说明请求理由，并给对方保留提出替代方案的空间；不施压、不说教、不贬低报价，不虚构订单量、预算、竞品报价或合作承诺。
把最近三轮自己的回复视为禁用模板：新回复必须更换表达和推进策略。

底线、评分、分类和是否转人工已由程序确定，你不得修改或绕过这些决策，不得承诺付款、签约、下单或超出授权的条款。只使用程序决策上下文提供的数值和安全范围。
""".strip()
FALLBACK_REPLY = "感谢您认真补充方案，我们很愿意继续了解合作可能。为了让首批合作更容易推进，想请您帮忙看看报价或起订量是否还有一些调整空间？您可以先告诉我其中更方便协商的一项。"

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
        "temperature": 0.55,
        "messages": messages,
    }
    if extract_terms:
        payload["response_format"] = {"type": "json_object"}
    headers = {"Authorization": f"Bearer {settings.deepseek_api_key}"}

    def too_similar(reply: str) -> bool:
        recent = [item.get("content", "") for item in (history or []) if item.get("role") == "assistant"][-3:]
        compact = re.sub(r"\s+", "", reply)
        return any(SequenceMatcher(None, compact, re.sub(r"\s+", "", old)).ratio() >= 0.68 for old in recent if old)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{settings.deepseek_base_url.rstrip('/')}/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            choice = response.json()["choices"][0]["message"]
            content = (choice.get("content") or choice.get("reasoning_content") or "").strip()
            if not content:
                return NegotiationTurn(reply=FALLBACK_REPLY, mode="fallback")
            turn = parse_negotiation_turn(content) if extract_terms else NegotiationTurn(reply=content)
            if too_similar(turn.reply):
                retry_payload = {
                    **payload,
                    "temperature": 0.72,
                    "messages": [
                        *messages,
                        {"role": "assistant", "content": content},
                        {"role": "system", "content": "刚才这版与近期回复过于相似，请重新作答。保留事实与安全边界，但必须更换开头、句式和谈判策略；不要重复确认已经达标的条款，只推进一个最值得谈的事项。"},
                    ],
                }
                retry = await client.post(f"{settings.deepseek_base_url.rstrip('/')}/chat/completions", json=retry_payload, headers=headers)
                retry.raise_for_status()
                retry_choice = retry.json()["choices"][0]["message"]
                retry_content = (retry_choice.get("content") or retry_choice.get("reasoning_content") or "").strip()
                if retry_content:
                    return parse_negotiation_turn(retry_content) if extract_terms else NegotiationTurn(reply=retry_content)
            return turn
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        return NegotiationTurn(reply=FALLBACK_REPLY, mode="fallback")


async def generate_negotiation_reply(*, supplier_message: str, decision_context: str, history: list[dict] | None = None) -> str:
    turn = await generate_negotiation_turn(supplier_message=supplier_message, decision_context=decision_context, history=history)
    return turn.reply


async def generate_opening_message(
    *, supplier_name: str, product_name: str, quoted_price: float, target_price: float,
    moq: int, max_moq: int, lead_days: int, max_lead_days: int,
    payment_days: int, min_payment_days: int,
) -> str:
    """供应商提交方案后，由采购 AI 主动开启第一轮协商。"""
    gaps: list[str] = []
    if quoted_price > target_price:
        gaps.append(f"报价从 ¥{quoted_price:g}/件向目标价 ¥{target_price:g}/件靠拢")
    if moq > max_moq * 0.6:
        gaps.append(f"首批起订量从 {moq} 件适当降低")
    if lead_days > max_lead_days * 0.7:
        gaps.append(f"将 {lead_days} 天交期适当缩短")
    if min_payment_days > 0 and payment_days < min_payment_days * 1.25:
        gaps.append(f"账期从 {payment_days} 天适当延长")
    priorities = "；".join(gaps[:2]) or "报价与首批合作条件再优化一些"
    fallback = (
        f"{supplier_name}您好，感谢您提交{product_name}的供货方案，我们对进一步合作很有兴趣。"
        f"为了让首批合作更容易落地，想请您帮忙看看，是否能在{priorities}？"
        "如果首批配合顺利，我们也愿意优先讨论后续补货安排。您看哪一项更方便先帮我们争取一下？"
    )
    turn = await generate_negotiation_turn(
        supplier_message="供应商刚提交了首轮方案。请由采购方主动发起第一条消息，不要等待对方提问。",
        decision_context=(
            f"继续 AI 议价。供应商：{supplier_name}；商品：{product_name}；"
            f"当前报价 ¥{quoted_price:g}，目标价 ¥{target_price:g}；当前起订量 {moq}，可接受上限 {max_moq}；"
            f"当前交期 {lead_days} 天，可接受上限 {max_lead_days} 天；当前账期 {payment_days} 天，最低期望 {min_payment_days} 天。"
            f"本轮优先、委婉地协商：{priorities}。表达合作兴趣，但禁止承诺采购量、下单、签约或付款。"
        ),
    )
    return fallback if turn.mode == "fallback" else turn.reply
