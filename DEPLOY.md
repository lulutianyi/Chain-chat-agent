# 公开部署指南（免费方案：Vercel + Render + Supabase）

把「链谈 Agent」从本地跑改成别人可通过网址直接访问。零成本，三个平台各管一段：

```
浏览器 ──► Vercel（前端 Next.js） ──API──► Render（后端 FastAPI） ──► Supabase（PostgreSQL 数据库）
```

## 0. 准备工作

1. 注册账号（都用 GitHub 登录最方便）：[Vercel](https://vercel.com)、[Render](https://render.com)、[Supabase](https://supabase.com)。
2. 把最新代码推到 GitHub 的 `main` 分支（Render 与 Vercel 都是从仓库拉取部署的）：

```bash
git switch main          # 若当前在别的分支
git status               # 确认没有未提交的改动
git push origin main
```

> 说明：`render.yaml` 与本次代码改动需先推送到 GitHub，Render/Vercel 都是从仓库拉取部署的。

## 1. Supabase：建数据库（免费 PostgreSQL）

1. 进入 [supabase.com](https://supabase.com) → **New project** → 起名（如 `liantan`）→ 区域选 **Singapore / Tokyo**（离大陆较近）→ 设置一个数据库密码（记下来）。
2. 项目创建后：**Settings → Database → Connection string → URI**，复制形如 `postgresql://postgres.xxx:[PASSWORD]@aws-...pooler.supabase.com:5432/postgres` 的串。
3. 把开头 `postgresql://` 改成 **`postgresql+psycopg://`**，并把 `[PASSWORD]` 换成你第 1 步设的密码。**这就是你的 `DATABASE_URL`**，先存好。

## 2. Render：部署后端

1. 进入 [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → 连接你的 GitHub 仓库。Render 会自动读取仓库根目录的 `render.yaml`。
2. 弹出的环境变量输入框逐项填写：

   | 变量 | 填什么 |
   | --- | --- |
   | `FRONTEND_ORIGIN` | 先随便填 `https://example.com`，第 3 步拿到 Vercel 网址后再回来改 |
   | `DATABASE_URL` | 第 1 步做好的 Supabase 连接串 |
   | `MERCHANT_PASSWORD` | 商家后台登录密码，**设个强密码** |
   | `ADMIN_TOKEN` | **留空**（禁用演示令牌兜底，改走密码登录） |
   | `ENVIRONMENT` | `dev`（公开演示）或 `prod`（正式运营，启动会做配置自检） |
   | `DEMO_MODE` | `true`=验证码直接回显（无短信服务时必需）；接入短信后改 `false` |
   | `DEEPSEEK_API_KEY` | 可选，留空则用可重复演示回复 |
   | `BAIDU_API_KEY` / `BAIDU_SECRET_KEY` | 可选，留空则资质上传转人工核验 |
   | `SMTP_HOST` / `SMTP_PORT` | 可选，找回密码邮件服务器；不填则找回密码不可用 |
   | `SMTP_USERNAME` / `SMTP_PASSWORD` | 可选，SMTP 登录凭证 |
   | `SMTP_FROM` / `SMTP_SSL` / `SMTP_STARTTLS` | 可选，发件人与加密方式（587 用 STARTTLS，465 用 SSL） |

3. 等部署完成，记下后端网址，形如 `https://liantan-backend.onrender.com`。

> 免费实例闲置约 15 分钟后会休眠，第一次访问要等几十秒冷启动，属正常现象。

## 3. Vercel：部署前端

1. 进入 [vercel.com](https://vercel.com) → **Add New… → Project** → 导入同一个仓库，框架会自动识别为 Next.js。
2. 在 **Environment Variables** 里加：

   | 变量 | 值 |
   | --- | --- |
   | `NEXT_PUBLIC_API_URL` | `https://liantan-backend.onrender.com`（第 2 步的后端网址） |
   | `NEXT_PUBLIC_ADMIN_TOKEN` | 留空 |

3. **Deploy**，完成后拿到前端网址 `https://xxx.vercel.app`。

## 4. 回头改 CORS，然后验证

1. 回 Render → 你的后端服务 → **Environment** → 把 `FRONTEND_ORIGIN` 改成前端网址（`https://xxx.vercel.app`）→ **Save & Deploy**（会重新部署一次）。
2. 打开 `https://xxx.vercel.app` 验证：
   - **商家后台**：右上角登录，密码用第 2 步设的 `MERCHANT_PASSWORD`；
   - **供应商入口**：手机号登录，演示模式下验证码直接显示在页面上；
   - 上传一张资质图片，确认能上传、在谈判页能查看（现在文件存在数据库里，重启不会丢）。

## 上线后必做

- 到「账号安全」页把商家密码再改一次（第一版密码可能已在你填环境变量时截图/复制过）。
- 浏览器按 F12 看不到管理员令牌了（已禁用 `NEXT_PUBLIC_ADMIN_TOKEN` 与后端 `ADMIN_TOKEN` 兜底）。
- ⚠️ **公开演示站请勿把 `ENVIRONMENT` 设为 `prod`**：当前没有接入短信服务，必须依赖 `DEMO_MODE=true`，
  而 prod 自检会拒绝这个组合导致服务起不来。接入短信服务后：`DEMO_MODE=false` + `ENVIRONMENT=prod` + 商家强密码。

## 关于中国大陆访问（重要）

- 免费平台的默认域名 `*.vercel.app`、`*.onrender.com` 在大陆**经常被墙或很慢**，海外访问则正常。
- 如果大陆访问是硬需求，两个低成本兜底：
  1. 买个便宜域名（约 ¥50/年）绑到 Vercel（可配合 Cloudflare 免费加速）；
  2. 或换成 **$5/月左右的香港 VPS**，用 Docker 把前后端一起跑（我可帮你写配置）。

## 常见问题

- **前端提示「后端服务可达（版本 未知），但没有 /api/xxx 这个接口」**：后端没有跟着 `main` 更新。去 Render 服务的 **Settings → Build & Deploy → Branch** 确认是 `main`（不是某个版本分支），再点 **Manual Deploy → Deploy latest commit**。只在 GitHub 推 `main` 时，跟踪版本分支的服务不会触发部署，表现就是前端已更新、后端还是旧接口。
  部署成功的判据：打开 `https://<后端域名>/api/health` 能看到 `"version":"0.1.0"`，`/api/health/ready` 返回 JSON 而不是 404。
- **上传的文件会丢吗？** 不会，已改为存进数据库（本次改动），不再依赖云主机的临时磁盘。
- **ML 打分模式能用吗？** 默认是 `custom_rule` 规则打分。`ml_models/` 模型文件被 `.gitignore` 忽略、未入库，首次用 ML 模式会在服务器在线训练。
- **找回密码邮件发不出去？** 检查 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USERNAME`、`SMTP_PASSWORD`、`SMTP_FROM` 是否都填了。587 端口保持 `SMTP_STARTTLS=true`、`SMTP_SSL=false`；465 端口反过来。企业邮箱/QQ 邮箱通常要填「客户端授权码」而不是登录密码。未配置 SMTP 时接口返回 503 属于预期，账号密码登录不受影响。
- **为什么第一次打开很慢？** Render 免费实例休眠后的冷启动，等几十秒即可；也可以后续升级成付费（$7/月起）保持常驻。
