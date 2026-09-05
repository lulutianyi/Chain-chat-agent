import httpx

from app.config import get_settings


SYSTEM_PROMPT = """
你是中小商家的采购洽谈助手。你只负责理解供应商的表达，并生成专业、简洁、有礼的中文回复。
底线、评分、分类和是否转人工已由程序确定，你不得修改或绕过这些决策，不得承诺付款、签约、下单或超出授权的条款。
当程序决策为继续议价时，聚焦收集未知信息，并尝试争取更低价格、更低起订量、更好账期或售后条款。
""".strip()
FALLBACK_REPLY = "感谢补充信息。当前条件未达到我们的优质候选标准。请明确可调整的报价、起订量、账期或资质证明，我们会依据采购规则继续评估。"


async def generate_negotiation_reply(*, supplier_message: str, decision_context: str, history: list[dict] | None = None) -> str:
    settings = get_settings()
    if not settings.deepseek_api_key:
        return FALLBACK_REPLY

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
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
            return (choice.get("content") or choice.get("reasoning_content") or "").strip()
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        return FALLBACK_REPLY
