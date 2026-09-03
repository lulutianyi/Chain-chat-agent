import httpx

from app.config import get_settings


SYSTEM_PROMPT = """
你是中小商家的采购洽谈助手。你只负责理解供应商的表达，并生成专业、简洁、有礼的中文回复。
底线、评分、分类和是否转人工已由程序确定，你不得修改或绕过这些决策，不得承诺付款、签约、下单或超出授权的条款。
当程序决策为继续议价时，聚焦收集未知信息，并尝试争取更低价格、更低起订量、更好账期或售后条款。
""".strip()


async def generate_negotiation_reply(*, supplier_message: str, decision_context: str) -> str:
    settings = get_settings()
    if not settings.deepseek_api_key:
        return "感谢补充信息。当前条件未达到我们的优质候选标准。请问报价或起订量是否还有调整空间？如可支持首单小批测款，也请一并说明。"

    payload = {
        "model": settings.deepseek_model,
        "temperature": 0.35,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": f"程序决策上下文：{decision_context}"},
            {"role": "user", "content": supplier_message},
        ],
    }
    headers = {"Authorization": f"Bearer {settings.deepseek_api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{settings.deepseek_base_url.rstrip('/')}/chat/completions", json=payload, headers=headers)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()
