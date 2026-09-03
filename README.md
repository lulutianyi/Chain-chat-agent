# 链谈 Agent

面向中小微采购商家的供应商智能接待、分层谈判和筛选系统。

> 核心原则：大模型负责理解和表达，程序负责底线、评分和决策。

## Demo 包含什么

- **采购工作台**：编辑目标价、起订量、账期、资质门槛和转人工阈值，查看供应商分层。
- **AI 实时谈判**：查看对话、底线校验、加权评分和谈判摘要；高质量候选会停止 AI 自动回复并提醒人工接管。
- **供应商入口**：接收报价、起订量、资质、地区、备货周期和配合方案，自动匹配商品需求并返回分类结果。

## 决策流程

```text
供应商提交条件
        │
        ▼
程序硬性底线校验 ─── 不通过 ──▶ 礼貌结束洽谈
        │通过
        ▼
程序加权评分
        ├── 未达阈值 ──▶ AI 继续议价
        └── 达到阈值 ──▶ 停止 AI 回复 ──▶ 人工接管
```

## 本地启动

### 1. 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

后端文档：`http://localhost:8000/docs`

### 2. 前端

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

网页：`http://localhost:3000`

## 大模型配置

在 `backend/.env` 中设置：

```dotenv
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_MODEL=deepseek-chat
```

未配置密钥时，后端会使用可重复演示的本地谈判回复；规则与评分逻辑不受影响。密钥不应写入源码或提交到 Git。

## 数据库

本地 Demo 默认使用 SQLite，首次启动会生成商品、采购规则、供应商、谈判和消息表。切换 PostgreSQL / Supabase 时，只需修改 `backend/.env`：

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/postgres
```

## 评分模型

| 维度 | 权重 |
| --- | ---: |
| 价格竞争力 | 35 |
| 起订量 | 20 |
| 资质完整度 | 25 |
| 地区匹配 | 10 |
| 沟通配合度 | 10 |

硬性规则优先于评分：超过价格上限、起订量上限、交期上限或缺少必备资质时，即使其他项得分较高也会直接淘汰。

## 项目结构

```text
frontend/   Next.js + TypeScript + Tailwind + shadcn/ui 三页工作台
backend/    FastAPI + Pydantic + SQLAlchemy + SSE + DeepSeek 接入
```

本版本用于本地闭环演示。未来公开发布时，建议将互动应用部署在支持 Next.js 与 FastAPI 的服务上；Hexo 可用于官网、产品介绍和帮助文档，不建议承载实时谈判主应用。
