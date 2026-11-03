# 链谈 Agent

![链谈 Agent：把时间留给真正值得谈的供应商](frontend/public/og.jpg)

> 把时间留给真正值得谈的供应商。

链谈 Agent 是面向中小微采购商家的**供应商智能接待、分层谈判与筛选系统**。它自动接待上门的供应商，先按采购底线做硬性筛选，再按七维权重评分分层；达到标准的才提醒商家接管，其余由 AI 继续议价。

**核心原则：大模型负责理解和表达，底线、评分和决策由程序完成。**

[在线体验](https://chain-chat-agent-frontend-hazel.vercel.app/) · [部署指南](DEPLOY.md) · [问题反馈](https://github.com/Guo-beep112241/Chain-chat-agent/issues)

[![CI](https://github.com/Guo-beep112241/Chain-chat-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Guo-beep112241/Chain-chat-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)

## 目录

- [在线体验](#在线体验)
- [为什么需要链谈 Agent](#为什么需要链谈-agent)
- [核心特性](#核心特性)
- [决策流程](#决策流程)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [配置](#配置)
- [使用流程](#使用流程)
- [评分模型](#评分模型)
- [项目结构](#项目结构)
- [测试与 CI](#测试与-ci)
- [部署](#部署)
- [安全与演示边界](#安全与演示边界)
- [路线图](#路线图)
- [贡献](#贡献)
- [License](#license)

## 在线体验

**https://chain-chat-agent-frontend-hazel.vercel.app/**

建议按下面的动线体验完整闭环：

1. **商家端**：注册或登录后进入采购工作台，维护商品、采购底线与评分权重。
2. **供应商端**：用手机号登录，选择商品并提交报价、起订量、账期和资质。
3. **实时谈判**：供应商提交后自动进入 AI 洽谈；达到转人工阈值时，商家工作台会收到提示。
4. **测评实验室**：回放 1500 条报价用例，或抽样检验 AI 话术。

> 公开实例是演示环境：注册即用，验证码直接显示、不发送短信，**请勿填写真实敏感信息**。
> 免费实例在闲置后冷启动可能需要几十秒；受网络环境影响，`*.vercel.app` 在中国大陆可能较慢或无法访问。

## 为什么需要链谈 Agent

中小微采购商家通常没有专职采购团队，供应商消息散落在微信、电话和表格里。人工逐条核对报价、起订量、账期和资质既耗时，又容易在关键底线上让步；而直接让大模型自由对话，则无法保证价格上限、资质门槛等硬性条件被真正执行。

链谈 Agent 把这件事拆成三段：

- **程序先筛**：硬性底线逐项校验，触线直接礼貌结束，不靠模型“自觉”。
- **程序分层**：通过底线后再做七维加权评分，达到阈值才转人工，把精力留给真正值得谈的供应商。
- **AI 只做它擅长的部分**：理解供应商说了什么、抽取条款、组织谈判措辞、生成摘要，不参与评分和分流决策。

## 核心特性

- **自动接待与分层谈判**：供应商提交报价后立即进入 AI 洽谈，不需要商家在线；谈判中供应商给出新价格、起订量、交期或账期时，程序会重新执行底线校验并更新评分与分类。
- **规则与评分完全由程序执行**：价格上限、最高起订量、最长交期、最低账期、必备资质逐项硬性校验；七维权重可按商品自定义，规则引擎的 1500 条用例可一键回放验证。
- **多商家（多租户）隔离**：商品、供应商、谈判记录与资质文件按 `merchant_id` 隔离，商家只能访问自己名下的数据；新商家可在注册页自助创建账号。
- **两种商家登录方式**：账号 + 密码，或手机号验证码，一键切换；供应商侧同样走手机号验证码登录，并可在「我的洽谈会话」中找回历史洽谈。
- **邮箱找回密码**：登录页提供「忘记密码？」入口；向注册时绑定的邮箱发送 6 位验证码，验证通过后设置新密码，并立即吊销所有旧登录令牌，必须重新登录。
- **商家实时工作台**：多会话列表、供应商评分卡、底线校验明细、AI 谈判摘要、资质文件人工核验；通过 SSE 推送待接管会话与评分变化，顶栏铃铛实时提醒。
- **资质自动初筛**：上传营业执照后由百度 OCR 识别公司名并与填写企业名比对，不一致或无法识别时转人工；资质文件存入数据库，重启不丢失。
- **测评实验室**：内置 1500 条供应商报价用例、200 条 AI 话术用例，以及决策树 / 逻辑回归两种可在线训练与评估的 ML 打分模型。
- **中英双语与工程化**：全站中英文切换、响应式工作台、Alembic 迁移基线校验、后端 81 个自动化测试与 GitHub Actions CI。

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

条款抽取由 AI 完成，评分、分类和分流始终由程序计算。商家也可以对任意会话手动接管，或把普通会话交还 AI 自动谈判。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 前端 | Next.js 15（App Router）、React 19、TypeScript、Tailwind CSS v4、shadcn/ui 风格组件 |
| 后端 | FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、SSE |
| 数据 | SQLite（本地默认）/ PostgreSQL（Supabase） |
| AI 与识别 | DeepSeek Chat（条款抽取、谈判回复、摘要）、百度智能云 OCR（营业执照核验） |
| 机器学习 | scikit-learn（决策树 / 逻辑回归） |
| 测试与 CI | pytest + pytest-cov、ESLint、TypeScript、GitHub Actions |
| 部署 | Vercel（前端）+ Render（后端）+ Supabase（数据库） |

## 快速开始

### 环境要求

- Python 3.12+（CI 使用 3.13）
- Node.js 20+ 与 npm（CI 使用 22）
- 可选：ffmpeg，仅在重新渲染首页演示影片时需要

### 1. 启动后端

以下命令以 macOS / Linux 为准（Windows 将 `.venv/bin/` 换成 `.venv\Scripts\`）。

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

首次启动会自动建表，并写入默认演示商家「小鹿生活馆」和 3 个演示商品。
接口文档：<http://localhost:8000/docs>。

### 2. 启动前端

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

网页：<http://localhost:3000>。前端默认请求 `http://localhost:8000`，可在 `frontend/.env.local` 中修改 `NEXT_PUBLIC_API_URL`。

### 3. 本地演示账号

| 身份 | 进入方式 | 演示凭证 |
| --- | --- | --- |
| 商家（采购方） | 首页「商家登录」 | 账号 `admin` · 密码 `链谈Agent123`；或手机号 `13800138000` + 页面显示的验证码 |
| 供应商 | 首页「我是供应商」→ 手机号登录 | 任意 11 位手机号 + 页面显示的验证码 |
| 新商家 | 登录页底部「立即注册」 | 按规则自助注册，注册成功即登录 |

> 以上是**本地默认值**。公开部署必须修改 `MERCHANT_PASSWORD`，并确保 `ADMIN_TOKEN` 留空。
> 演示模式下验证码不发送短信，而是直接回显在页面和后端日志中。

## 配置

### 后端（`backend/.env`）

完整模板见 [`backend/.env.example`](backend/.env.example)。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 空 | 不填则使用可重复的本地演示回复；规则与评分逻辑不受影响 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | DeepSeek 模型名 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek API 地址 |
| `BAIDU_API_KEY` / `BAIDU_SECRET_KEY` | 空 | 百度智能云 OCR，不填则资质全部转人工核验 |
| `SMTP_HOST` / `SMTP_PORT` | 空 / `587` | 找回密码邮件服务器；不填则找回密码不可用，账号密码登录不受影响 |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | 空 | SMTP 登录凭证 |
| `SMTP_FROM` | 空 | 发件人；留空时回退到 `SMTP_USERNAME` |
| `SMTP_STARTTLS` / `SMTP_SSL` | `true` / `false` | 587 端口用 STARTTLS；465 端口改用 SSL |
| `PASSWORD_RESET_CODE_TTL_MINUTES` / `PASSWORD_RESET_TOKEN_TTL_MINUTES` / `PASSWORD_RESET_MAX_ATTEMPTS` | `10` / `10` / `5` | 验证码与重置令牌有效期、单个验证码最大尝试次数 |
| `DATABASE_URL` | `sqlite:///./liantan.db` | 生产环境改为 `postgresql+psycopg://...` |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS 白名单，公开部署填前端域名 |
| `MERCHANT_ACCOUNT` | `admin` | 默认商家的登录账号 |
| `MERCHANT_PHONE` | `13800138000` | 默认商家绑定的手机号 |
| `MERCHANT_PASSWORD` | `链谈Agent123` | 默认商家密码，公开部署务必改成强密码 |
| `ENVIRONMENT` | `dev` | 设为 `prod` 时启动会执行配置自检，不安全的组合直接拒绝启动 |
| `DEMO_MODE` | `true` | 验证码直接回显；**开启时任何人可用任意手机号登录**，仅限演示 |
| `ADMIN_TOKEN` | 空 | 演示兜底令牌，保持为空即完全禁用 |
| `LOG_FORMAT` | `auto` | `auto` / `json` / `text` |

未配置 DeepSeek 密钥时，Agent 使用本地可重复的演示回复；未配置百度密钥时，资质上传直接进入人工核验。两类密钥都不应写入源码或提交到 Git。

### 前端（`frontend/.env.local`）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | 后端地址；构建时内联，改动后需重新构建 |
| `NEXT_PUBLIC_SHOW_DEBUG_ENTRY` | 空 | 设为 `true` 才显示洽谈页的「模拟供应商」自测入口 |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | 站点公开地址，用于 metadata、`sitemap.xml` 与 `robots.txt` |

前端不携带任何管理员令牌，商家的受保护接口使用登录后获得的 token。

## 使用流程

前后端启动后访问 <http://localhost:3000>，推荐完整走一遍「商家录入 → 供应商报价 → 分层分流 → 转人工」闭环。

### 第 0 步：商家登录 / 注册

首页点「商家登录」，用账号密码或手机验证码登录；没有账号时在登录页底部点「立即注册」，填写账号、密码、商家名称、手机号和邮箱，并勾选平台须知。忘记密码时，点密码输入框下方的「忘记密码？」，用绑定邮箱接收验证码后设置新密码。

### 第 1 步：配置采购底线（`/dashboard`）

在「商品库管理」中新增或编辑商品，填写目标采购价、硬性价格上限、最高起订量、最长交期、最低账期、转人工分数、必备资质、优先地区，以及七维评分权重（也可切换到 ML 打分）。点击「添加并启用」后，商品会立即出现在供应商入口。

### 第 2 步：供应商上门报价（`/supplier`）

供应商用手机号登录后，依次完成：选择供货商品 → 填写企业信息 → 填写报价、起订量、账期与配合方案 → 勾选资质并上传至少一份文件。右侧「提交前预评估」会实时显示与后端同一套公式的预估分数，触线时直接列出未通过项。

### 第 3 步：按分层结果分流

| 结果 | 发生什么 |
| --- | --- |
| 淘汰 | 提示条件不匹配（附触线原因），后续由系统礼貌收尾，不再打扰商家 |
| AI 拉锯 | 进入谈判页，AI 自动议价并索取可核验信息 |
| 转人工 | AI 自动回复停止，谈判页出现接管提醒，等待商家处理 |

### 第 4 步：商家处理洽谈（`/negotiate`）

左侧是多会话列表（含实时评分），右侧是供应商评分卡、底线校验明细、AI 谈判摘要和资质文件核验区。达到转人工条件的会话点击「接管」即可人工回复；普通会话可点「恢复 AI 自动谈判」交还给 AI。顶栏铃铛会实时提示待接管的优质候选。

### 第 5 步：查看经营统计（`/dashboard`）

「今日接待 / AI 自动谈判中 / 优质候选 / 为您节省」四张指标卡由真实记录自动生成，仅统计当前登录商家的数据。

### 第 6 步（可选）：验证引擎质量（`/evaluation`）

- **规则引擎测评**：回放全部 1500 条报价用例（不调用大模型），输出总体准确率、混淆矩阵、分组准确率与误判明细。
- **AI 话术抽样测评**：选择话术类型和抽样数量，真实调用大模型生成回复，并用「策略命中 + 越权红线」双闸打分。
- **ML 打分**：在线训练 / 评估决策树、逻辑回归模型，返回混淆矩阵、特征重要度等指标。

## 评分模型

默认七维满分（可在商品规则中按商家自定义）：

| 维度 | 默认满分 |
| --- | ---: |
| 价格竞争力 | 30 |
| 起订量 | 15 |
| 资质完整度 | 20 |
| 交期 | 10 |
| 账期 | 10 |
| 区域匹配 | 5 |
| 沟通配合度 | 10 |

硬性规则优先于评分：超过价格上限、起订量上限、交期上限、账期下限或缺少必备资质时，即使其他项得分较高也会直接淘汰。商品可切换为 `ML` 打分模式（决策树 / 逻辑回归），硬性底线规则仍然生效。

## 项目结构

```text
Chain-chat-agent/
├── backend/                     FastAPI 后端
│   ├── app/
│   │   ├── main.py              路由、鉴权入口、SSE 状态流
│   │   ├── models.py            SQLAlchemy 模型
│   │   ├── services/
│   │   │   ├── rules.py         硬性底线校验
│   │   │   ├── scoring.py       七维加权评分与分类
│   │   │   ├── llm.py           DeepSeek 谈判回复与摘要
│   │   │   ├── term_extraction.py  AI 条款抽取
│   │   │   ├── qualification_check.py  百度 OCR 资质核验
│   │   │   ├── evaluation.py    规则 / 话术测评
│   │   │   ├── mailer.py        找回密码 SMTP 邮件
│   │   │   └── ml_scoring.py    决策树 / 逻辑回归打分
│   │   ├── security.py          密码哈希、令牌与鉴权
│   │   ├── ratelimit.py         取码等入口限流
│   │   ├── startup_checks.py    生产环境配置自检
│   │   └── seed.py              默认商家与演示商品
│   ├── alembic/                数据库迁移
│   ├── tests/                  81 个后端自动化测试
│   └── requirements*.txt
├── frontend/                    Next.js 前端
│   ├── src/app/                 页面路由（商家端 / 供应商端 / 登录注册）
│   ├── src/components/          业务组件与基础 UI
│   ├── src/lib/                 API 客户端、SSE、i18n、常量
│   ├── public/demo/             首页产品影片与封面
│   └── scripts/                 影片逐帧渲染脚本
├── json_output/                 测评数据集（1500 + 200 + 5 组规则）
├── .github/workflows/ci.yml     后端测试 + 前端类型 / Lint / 构建
├── render.yaml                  Render 后端 Blueprint
├── DEPLOY.md                    公开部署指南
└── README.md
```

## 测试与 CI

后端目前有 **81 个自动化测试**，当前行覆盖率约 **76%**（CI 门槛 70%）。测试全部使用临时 / 内存数据库并 mock 外部服务，不会写入开发数据，也不会真实调用大模型或百度接口。覆盖范围包括硬规则与评分、谈判中重新评分与条款抽取、上传 / 下载安全校验、鉴权与令牌生命周期、限流、提交幂等、邮箱找回密码、Alembic 基线一致性以及存量库补列。

```bash
cd backend
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests/ -q
```

生成覆盖率报告：

```bash
.venv/bin/python -m pytest tests/ -q --cov=app --cov-report=term-missing
```

> 目标是 80%。当前差距主要在 `app/services/ml_scoring.py`（30%）以及 `app/main.py` 的部分路由分支，这两块是后续补测试的首选。

前端目前没有单元测试，CI 负责静态检查与生产构建：

```bash
cd frontend
npx tsc --noEmit   # 类型检查
npm run lint       # ESLint
npm run build      # 生产构建
```

GitHub Actions 在每次 push 到 `main` 和每个 Pull Request 上运行：

| Job | 内容 |
| --- | --- |
| 后端（pytest） | 安装依赖并运行 pytest，覆盖率低于 70% 时失败 |
| 前端（类型 / Lint / 构建） | `tsc --noEmit`、`eslint`、`next build` |

## 部署

```text
浏览器 ──► Vercel（Next.js 前端） ──API / SSE──► Render（FastAPI 后端） ──► Supabase（PostgreSQL）
```

公开实例：**https://chain-chat-agent-frontend-hazel.vercel.app/**

完整的免费部署步骤、环境变量清单和常见问题见 [DEPLOY.md](DEPLOY.md)；后端一键部署配置见 [render.yaml](render.yaml)。

几个部署要点：

- 前端在 Vercel 配置 `NEXT_PUBLIC_API_URL` 指向 Render 后端，后端把 `FRONTEND_ORIGIN` 设为前端域名。
- 生产数据库使用 Supabase PostgreSQL，`DATABASE_URL` 写成 `postgresql+psycopg://...`。
- 公开演示必须保持 `ADMIN_TOKEN` 为空，并修改默认商家密码。
- 免费实例闲置约 15 分钟后休眠，首次访问需要等待冷启动。

## 安全与演示边界

- **管理员令牌**：前端与后端都不再携带默认令牌。`NEXT_PUBLIC_ADMIN_TOKEN` 已彻底移除；后端 `ADMIN_TOKEN` 默认值为空，即完全禁用该兜底鉴权，公开部署必须留空。
- **多商家隔离**：商家凭登录 token 只能访问自己名下的商品、规则、谈判与资质文件；供应商凭登录手机号只能访问本人会话。供应商入口仍是一个跨商家的演示目录，按所选商品归属到对应商家。
- **验证码**：由 `DEMO_MODE` 控制。开启时验证码直接回显（不发送短信），**任意手机号都可被他人登录**，仅适用于公开演示；接入短信服务后必须设 `DEMO_MODE=false`。
  演示模式下商家端手机号验证码登录对**任何手机号**都发演示码：号码没注册过时，用该码登录会为它开一个独立的演示工作台（含 3 个演示商品），不会串到别人的数据。`DEMO_MODE=false` 时恢复严格口径：取码只对已绑定的商家手机号，登录时手机号未绑定直接拒绝。
- **生产自检**：`ENVIRONMENT=prod` 时，启动会强制校验 `DEMO_MODE` 已关闭、数据库不是 SQLite、`ADMIN_TOKEN` 为空、商家密码不是默认值、前端地址为 https，任一不满足直接拒绝启动。
- **邮箱与找回密码**：注册时仅校验邮箱格式与唯一性；找回密码通过 SMTP 发送 6 位验证码（默认 10 分钟有效、最多尝试 5 次），验证通过后签发一次性重置令牌。重置成功会清空当前 `access_token`，所有设备上的旧会话立即失效，必须重新登录。未配置 SMTP 时该接口返回 503，不会把验证码回显给前端。
- **资质识别**：采用「自动初筛 + 人工兜底」——百度 OCR 提取执照字段并与填写企业名比对，不一致或无法识别时转人工；图像防伪鉴别不在当前范围内。
- **测评与 ML 接口**：会真实调用大模型或训练模型，全部要求商家登录后才能访问，匿名请求返回 401。
- **密钥与本地数据**：`.env`、SQLite 数据库、上传文件和 ML 模型文件均已加入 `.gitignore`，不应提交到仓库。

## 路线图

- [x] 多商家隔离、商家注册 / 登录、供应商手机号登录
- [x] 硬性底线规则、七维加权评分、AI 谈判与转人工
- [x] SSE 实时状态流、资质 OCR 初筛与人工核验
- [x] 规则 / 话术测评实验室、ML 打分模型
- [x] 中英文双语切换与响应式界面
- [ ] 接入真实短信服务，默认关闭 `DEMO_MODE`
- [ ] 将后端总覆盖率提升到 80%，重点补 `ml_scoring` 与路由层测试
- [ ] 资质图像防伪与更多 OCR 字段核验
- [ ] 前端端到端（E2E）测试

## 贡献

欢迎通过 [Issues](https://github.com/Guo-beep112241/Chain-chat-agent/issues) 反馈问题或提出建议，也欢迎直接提交 Pull Request。

1. 从 `main` 切出功能分支：`git switch -c feat/your-feature`。
2. 完成改动并补充测试；提交前至少运行后端 `pytest`、前端 `tsc --noEmit` 和 `npm run lint`。
3. 提交信息遵循 `type(scope): 描述` 的约定，例如 `fix(auth): 令牌失效时清理登录态`、`feat(evaluation): 新增话术抽样测评`。
4. 在 PR 中说明改动动机、行为变化和验证方式。

几个约定：

- 修改数据库模型时，请同步新增 Alembic 迁移，并保证 `tests/test_migrations.py` 与 `tests/test_schema_patch.py` 通过。
- 修改用户可见文案时，中英文词典必须同时补齐；`tsc` 会检查两侧结构是否一致。
- 不要提交 `.env`、密钥、本地数据库、上传文件或 ML 模型产物。
- 代码注释保持中文；接口与数据结构变更需同步更新 README 或 DEPLOY.md。

## License

本项目采用 [MIT License](LICENSE)。

## 致谢

感谢 [FastAPI](https://fastapi.tiangolo.com/)、[Next.js](https://nextjs.org/)、[DeepSeek](https://www.deepseek.com/)、[百度智能云](https://cloud.baidu.com/)、[Supabase](https://supabase.com/)、[Render](https://render.com/) 与 [Vercel](https://vercel.com/) 提供的开源项目和服务。
