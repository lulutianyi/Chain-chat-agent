import pytest

from app.ratelimit import limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """每个用例前后清空限流计数。

    限流器是进程内共享状态，用例之间会互相影响
    （例如多个用例都向同一个手机号要验证码，会撞上 1 次/60 秒的限制）。
    """
    limiter.reset()
    yield
    limiter.reset()
