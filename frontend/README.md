# 链谈 Agent · 前端

Next.js 15（App Router）+ TypeScript + Tailwind v4 + shadcn/ui 风格基础组件。

## 本地开发

```bash
npm install
cp .env.example .env.local   # 按需修改 NEXT_PUBLIC_API_URL
npm run dev                  # http://localhost:3000
```

后端需要同时在 `../backend` 启动（默认 http://localhost:8000），
否则页面会在控制台报 401/连接失败并显示「服务暂时不可用」。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | 后端地址。构建时内联，改动后必须重新 build |
| `NEXT_PUBLIC_SHOW_DEBUG_ENTRY` | 设为 `true` 才显示洽谈页的「模拟供应商」自测视角，默认关闭 |

前端不携带任何管理员令牌，一律使用登录后拿到的商家 token。

## 目录结构

```text
src/app/                路由
  (merchant)/           商家端（工作台 / 实时谈判 / 测评 / 账号安全），共用 AppShell
  supplier/             供应商端（登录 / 提交方案 / 洽谈），共用 SupplierShell
  login, register, terms
  demo-stage/           首页影片的「摄影棚」，只给录制脚本用（noindex，不面向用户）
src/components/         业务组件（车壳、消息、商品库抽屉、认证页外壳、滚动入场容器、语言切换/转接页）
src/components/ui/      基础组件（button / card / input / dialog / toast …）
src/lib/                api 客户端、SSE 订阅、常量与设计令牌
src/lib/i18n/           语言与词典（config / types / dict / enums / server / client）
src/components/negotiation-demo.tsx  影片源：每一帧都是时间的纯函数
scripts/build-demo-video.mjs         逐帧截图 + ffmpeg 编码，产出 public/demo/
```

## 动效规范

- 时长/缓动令牌集中在 `src/app/globals.css` 的 `:root`（`--dur-*` / `--ease-*`）。
  位移 ≤ 12px、缩放 ≤ 1.02、时长 ≤ 620ms，只用 ease 系曲线——不用弹跳、粒子、多色渐变。
- 滚动入场用 `<Reveal>`；首屏/分栏入场用 `anim-rise`、`anim-slide-right` 加 `anim-d1..d8` 排队。
- 所有入场隐藏态都写在 `html.motion` 之下，`layout.tsx` 的内联脚本只在
  「支持 IntersectionObserver 且系统未要求减少动态」时才挂这个类。JS 挂掉时页面
  直接呈现最终状态，不会白屏。
- 系统开启「减少动态效果」时：入场动画不落地、无限装饰动画停用、首页影片换成静态帧。

## 国际化（中 / 英）

语言存在 cookie `liantan_lang` 里：服务端 `layout.tsx` 读它决定 `<html lang>` 与首屏文案，
客户端切换时同步写它再 `router.refresh()`。**不做 `/en/...` 路径前缀**——工作台、洽谈、
测评、供应商端都已带自己的查询参数，再套一层语言前缀等于给每条链接都加一次拼接，
收益不抵改动面。代价是整站变成动态渲染，对本站这种「打开就要拉数据」的应用没有实际损失。

```text
src/lib/i18n/
  config.ts       语言常量、cookie 名、<html lang>、按钮标签
  types.ts        defineDict（en 必须与 zh 同构，漏翻即 tsc 报错）、format 插值
  dict/<ns>.ts    一个命名空间一个文件，一个文件里同时放 zh / en
  dict/index.ts   词典总表（命名空间：home / auth / merchant / supplier / film / legal / system / common）
  enums.ts        资质名、评分维度、打分模型：值是中文（要提交给后端），只翻显示名
  locale-store.ts 非 React 模块（api.ts）取当前语言的方式
  server.ts       getI18n()：服务端组件
  client.tsx      LanguageProvider / useI18n()：客户端组件
```

```tsx
// 服务端组件
const { d } = await getI18n();
// 客户端组件
const { locale, d } = useI18n();
```

规矩：

- 只翻译**用户可见文案**；中文代码注释保持原样。
- 加文案先加 `dict/<命名空间>.ts` 的 zh 与 en 两侧，少一侧 tsc 就报错。
- 提交给后端的值（资质名、维度 key、模型 value）不要翻译，展示时走 `enums.ts`。
- 后端返回的内容（对话正文、接口 `detail` 原文、供应商/商品名）由后端决定，前端不翻。

切换体验：`<LanguageSwitcher>` 写 cookie → 先换本地文案（感知上即时）→ `router.refresh()`
重渲染服务端内容；期间显示 `<LanguageTransition>` 转接页，说明「正在切到哪种语言、
可能要几秒、别刷新」并给一条不确定进度条。文案用**切换前**的语言书写。

按钮形态按宽度自适应：≥lg(1024px) 是「中文 | EN」分段控件（桌面空间充裕，一眼看出当前语言），
更窄收成「地球 + 目标语言」的单按钮，<360px 只留地球图标。省下来的 30–50px 是留给业务入口的。

首页顶栏右侧的排布（`app/page.tsx`）：业务动作保持原序 `[我是供应商] [商家登录]`，
语言切换作为站点级工具放到最外侧角落、用一条细分割线隔开。供应商快捷入口的显隐按实测宽度定：
**<460px 收起**（英文界面下「品牌 + 语言 + Supplier + Sign in」正好 451px，再窄只能靠整页缩小）、
**460–767px 显示**、**768–1023px 收起**（顶栏最挤，而导航里已有「供应商入口」）、
**≥1024px 显示**。收起时正文与页脚仍有入口。改这几个断点前请重新量一遍，别凭感觉调。

## 首页产品影片

`src/components/negotiation-demo.tsx` 是影片唯一的一份源（1280×960 定尺舞台），
片中没有任何 CSS 动画——位移、透明度、进度条、数字全部由 `time` 算出，因此同一个
时间点永远渲染出同一帧，可以逐帧录制：

```bash
npm run film:preview   # 只抓 10 个关键帧到 .demo-preview/，改片子时用这个快速校对
npm run film           # 全片渲染，产出 public/demo/negotiation.mp4 与封面 jpg
npm run film:preview:en  # 英文版预览帧 → .demo-preview-en/
npm run film:en          # 英文版全片 → public/demo/negotiation-en.mp4 + 封面
```

影片文字同样走词典（`film` 命名空间），但 `negotiation-demo.tsx` **不能读 cookie 或调用
`useI18n`**：它的每一帧必须是 `(time, locale)` 的纯函数，语言只能由 props 显式传入。
录制脚本用 `--locale en` 打开 `/demo-stage?lang=en` 拿英文素材，中英各出一份文件，
首页按当前语言引用对应的一份。

脚本会自己起一个 `next dev`（构建产物目录 `.next-film`，不会和本地 `npm run dev`
互相覆盖），用无头 Chrome 打开 `/demo-stage`，逐帧调 `window.__demoSeek(t)` 后截图，
PNG 直接管道喂给 ffmpeg 编码。需要 ffmpeg：优先用 PATH 里的，其次用仓库根的
`.tools/ffmpeg`，也可以用 `FFMPEG=/path/to/ffmpeg` 指定。

> 注意 `NEXT_DIST_DIR` 是 **build 与 start 两侧都读**的：手动构建时若用了
> `NEXT_DIST_DIR=.next-film npm run build`，启动也必须带上同一个变量，否则
> `next start` 会在 `.next` 里找不到 `BUILD_ID`。脚本自己管理这一对，不用管。

改完影片记得重新 `npm run film` 并把 `public/demo/` 下的产物一起提交——
页面用的是视频文件，不是实时渲染的组件。

## 检查命令

```bash
npx tsc --noEmit    # 类型检查
npm run lint        # ESLint
npm run build       # 生产构建
```
