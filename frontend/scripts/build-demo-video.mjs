#!/usr/bin/env node
/**
 * 把首页产品影片渲染成真正的视频文件。
 *
 * 流程：起本地服务 → 无头 Chrome 打开 /demo-stage → 逐帧调用页面的 __demoSeek(t)
 * → CDP 截图 → 直接把 PNG 喂给 ffmpeg → 输出 public/demo/negotiation.mp4 与封面。
 *
 * 为什么用「逐帧截图 + ffmpeg」而不是屏幕录制：
 *   影片的每一帧都是时间的纯函数（见 src/components/negotiation-demo.tsx），
 *   逐帧渲染得到的是**完全确定**的素材——不掉帧、不糊、可重跑，且不会把鼠标
 *   或系统 UI 录进去。屏幕录制做不到这三点。
 *
 * 为什么不需要 npm 依赖：
 *   Node 22+ 自带 WebSocket 与 fetch，CDP 本身就是一个 JSON 协议，直接说话即可，
 *   免得为了一个一次性脚本往 frontend/package.json 里塞 puppeteer。
 *
 * 用法：
 *   node scripts/build-demo-video.mjs                  # 出片
 *   node scripts/build-demo-video.mjs --preview        # 只抓几个关键帧到 .demo-preview/，用来肉眼校对
 *   node scripts/build-demo-video.mjs --help
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = path.resolve(FRONTEND_DIR, "..");

/** 影片参数。时间轴与 src/components/negotiation-demo.tsx 的 DEMO_SECONDS 必须一致。 */
const FILM = {
  width: 1280,
  height: 960,
  scale: 2, // 以 2 倍像素渲染再降采样，文字边缘比直接按 1 倍渲染干净得多
  fps: 30,
  seconds: 16.2,
  /** 封面取「重新校验 62 → 86」那一屏：它是整支片子信息量最大的一帧。
      12.9s 是重算动画（11.7–12.5）与系统消息（12.55–12.9）都落定之后。 */
  posterAt: 12.9,
};

/** --preview 时抓的时刻（秒）。挑的是每一幕最该被检查的一帧。 */
const PREVIEW_AT = [1.4, 2.6, 4.2, 5.9, 7.4, 9.6, 10.8, 12.9, 14.2, 15.8];

/* ---------------------------------- CLI ---------------------------------- */

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.DEMO_BASE_URL || "http://127.0.0.1:3100",
    out: path.join(FRONTEND_DIR, "public", "demo"),
    preview: false,
    keepFrames: false,
    spawnServer: true,
    distDir: process.env.NEXT_DIST_DIR || ".next-film",
    ffmpeg: process.env.FFMPEG || "",
    // 影片语言。zh 出 negotiation.mp4 / negotiation-poster.jpg（沿用既有文件名，
    // 首页在中文下引用的就是它们）；en 出 -en 后缀的两份，供英文界面引用。
    locale: process.env.DEMO_LOCALE || "zh",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--preview") options.preview = true;
    else if (arg === "--keep-frames") options.keepFrames = true;
    else if (arg === "--no-server") options.spawnServer = false;
    else if (arg === "--base-url") options.baseUrl = argv[++i];
    else if (arg === "--out") options.out = path.resolve(argv[++i]);
    else if (arg === "--dist-dir") options.distDir = argv[++i];
    else if (arg === "--ffmpeg") options.ffmpeg = argv[++i];
    else if (arg === "--locale") options.locale = argv[++i];
    else if (arg === "--fps") FILM.fps = positiveNumber(argv[++i], "--fps");
    else if (arg === "--seconds") FILM.seconds = positiveNumber(argv[++i], "--seconds");
    else throw new Error(`未知参数：${arg}`);
  }
  if (options.locale !== "zh" && options.locale !== "en") {
    // 语言拼错必须直接报错：否则会「成功」录出一份中文素材覆盖到英文文件名上。
    throw new Error(`--locale 只支持 zh / en，收到「${options.locale}」`);
  }
  return options;
}

/** 帧率/时长这类参数必须校验：传 0 或 abc 会让 totalFrames 变成 0/NaN，
 *  脚本会「成功」产出一个空视频，比直接报错难查得多。 */
function positiveNumber(raw, flag) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} 需要一个正数，收到「${raw}」`);
  return value;
}

const HELP = `
把首页产品影片渲染成 mp4。

  --preview        只抓 ${PREVIEW_AT.length} 个关键帧 PNG 到 .demo-preview/，不编码视频
  --keep-frames    把逐帧 PNG 留在 .demo-frames/ 里（默认直接管道喂给 ffmpeg，不落盘）
  --base-url URL   页面地址，默认 ${"http://127.0.0.1:3100"}
  --out DIR        输出目录，默认 public/demo
  --fps N          帧率，默认 ${FILM.fps}
  --seconds N      影片时长，默认 ${FILM.seconds}
  --no-server      不要自动起 next dev（假定 --base-url 已经能访问）
  --dist-dir DIR   自动起服务时用的构建产物目录，默认 ${".next-film"}（避免和本地 npm run dev 互相覆盖）
  --locale zh|en   出哪一种语言的片子，默认 zh。en 走 /demo-stage?lang=en，
                   产物为 negotiation-en.mp4 / negotiation-poster-en.jpg
  --ffmpeg PATH    ffmpeg 可执行文件，默认查 PATH，再退回 <repo>/.tools/ffmpeg
`;

/* ------------------------------- 小工具 ------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function resolveFfmpeg(explicit) {
  if (explicit) return explicit;
  // 项目没有引入 ffmpeg 依赖：先查系统 PATH，其次用仓库根的 .tools/ffmpeg
  // （本地自带一份静态构建放这里，免得为了录一次视频去污染全局环境）
  const local = path.join(REPO_DIR, ".tools", "ffmpeg");
  if (existsSync(local)) return local;
  return "ffmpeg";
}

/* --------------------------- 极简 CDP 客户端 --------------------------- */

class Cdp {
  static async connect(wsUrl, timeoutMs = 15000) {
    const socket = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`WebSocket 连接超时：${wsUrl}`)), timeoutMs);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error(`WebSocket 连接失败：${wsUrl}`));
        },
        { once: true },
      );
    });
    return new Cdp(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.waiters = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${JSON.stringify(message.error.data ?? "")})`));
        else resolve(message.result);
        return;
      }
      for (const waiter of [...this.waiters]) {
        if (waiter.method === message.method) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve(message.params);
        }
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const waiter = { method, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
          reject(new Error(`等待 ${method} 超时`));
        }
      }, timeoutMs);
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`页面内求值失败：${result.exceptionDetails.text}`);
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

/* ------------------------------- 主流程 ------------------------------- */

/**
 * 所有派生进程都登记在这里。为什么必须这样：
 * 「起服务」与「起 Chrome」的中途失败（端口没出来、找不到页面目标）会在函数 return
 * **之前**抛错，此时主流程里的变量还是 null，finally 拿不到 child —— 而这两个子进程
 * 都是 detached 的，会直接变成孤儿。更糟的是 next dev 会继续往构建目录里写，
 * 把下一次 build 的产物冲掉（我第一版就踩了这个坑）。
 * 登记 + 信号处理，才能保证任何退出路径都收干净。
 */
const SPAWNED = new Set();

function track(child) {
  SPAWNED.add(child);
  child.on("exit", () => SPAWNED.delete(child));
  return child;
}

/** 杀掉整棵进程树。只 kill 直接子进程会漏掉派生的孙进程。 */
function killTree(child) {
  if (!child?.pid) return;
  SPAWNED.delete(child);
  try {
    process.kill(-child.pid, "SIGKILL"); // 负数 = 整个进程组
  } catch {
    // 进程组已经不在了就用兜底：先杀掉它的直接子进程，再杀它自己
    try { spawnSync("pkill", ["-P", String(child.pid)]); } catch { /* pkill 不可用就算了 */ }
    try { child.kill("SIGKILL"); } catch { /* 已经退出 */ }
  }
}

function killAll() {
  for (const child of [...SPAWNED]) killTree(child);
}

// Ctrl+C 也要收干净：渲染 400+ 帧要几分钟，中途中断时 detached 的子进程
// 收不到终端的 SIGINT，会全部活下来。
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    killAll();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

async function startServer(port, distDir) {
  // 直接调本地 next 可执行文件而不是 npx：少一层包装，Ctrl+C / 组 kill 更容易收干净，
  // 也不会在依赖缺失时被 npx 拉去联网装一个。
  const nextBin = path.join(FRONTEND_DIR, "node_modules", ".bin", "next");
  const child = track(spawn(nextBin, ["dev", "-p", String(port)], {
    cwd: FRONTEND_DIR,
    // 关键：让这次服务用独立的构建产物目录。默认跟本地 `npm run dev` 共用 .next 的话，
    // 两边会互相覆盖 chunk —— 录出来的页面会 500、JS 全部加载失败，而且会把别人
    // 正在跑的开发服务器弄坏。
    env: { ...process.env, NEXT_DIST_DIR: distDir },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  }));
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  child.on("exit", (code) => logs.push(`[next start exited ${code}]`));
  return { child, logs };
}

async function launchChrome() {
  const chromePath =
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(chromePath)) {
    throw new Error(`找不到 Chrome：${chromePath}（可用 CHROME_PATH 环境变量指定）`);
  }
  const userDataDir = await mkdtemp(path.join(tmpdir(), "liantan-film-"));
  const child = track(spawn(
    chromePath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      `--window-size=${FILM.width},${FILM.height}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--hide-scrollbars",
      // 在没有 GUI 会话/受限沙箱的环境里（CI、容器、沙箱化的终端），Chrome 自己的
      // 沙箱会初始化失败并让主进程中途退出——表现成「CDP 刚连上就断开、脚本静默结束」。
      // 这是一次性的本地截图任务，页面只有本机的 /demo-stage，因此关掉它。
      "--no-sandbox",
      "--disable-crash-reporter",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      // 固定色彩与字形渲染：否则同一帧在不同次运行里文字灰度会变，视频会「呼吸」
      "--force-color-profile=srgb",
      "--disable-lcd-text",
      "--font-render-hinting=none",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"], detached: true },
  ));
  // 两个输出流都必须排空：管道写满会让 Chrome 在启动中途阻塞，
  // 表现成「脚本卡住、既没报错也没有端口文件」。
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});

  // Chrome 在 --remote-debugging-port=0 时把真正选中的端口写进这个文件
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(portFile)) {
      const [port] = (await readFile(portFile, "utf8")).split("\n");
      if (port) return { child, port: Number(port), userDataDir };
    }
    await sleep(100);
  }
  // 起不来就自己收干净：这时候主流程还没拿到返回值，指望不上它的 finally
  killTree(child);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  throw new Error("Chrome 没有在 10s 内暴露调试端口");
}

async function findPageTarget(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (page) return page;
    await sleep(100);
  }
  throw new Error("找不到可用的页面目标");
}

/** 把舞台定格到 t 秒并等它真正画出来。 */
async function seek(cdp, time) {
  await cdp.evaluate(`window.__demoSeek(${time})`, true);
}

async function capturePng(cdp) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  return Buffer.from(data, "base64");
}

function runFfmpeg(binary, args, { pipeInput = false } = {}) {
  const child = spawn(binary, args, {
    stdio: [pipeInput ? "pipe" : "ignore", "inherit", "inherit"],
  });
  return child;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const ffmpeg = resolveFfmpeg(options.ffmpeg);
  // 语言通过查询参数传给舞台页（而不是 cookie）：录制必须与浏览器里当前的
  // 语言偏好无关，同一条命令永远录出同一份素材。
  const pageUrl = new URL(options.locale === "zh" ? "/demo-stage" : `/demo-stage?lang=${options.locale}`, options.baseUrl).href;
  /** 文件后缀：中文沿用既有名字，英文加 -en。 */
  const suffix = options.locale === "zh" ? "" : `-${options.locale}`;
  const previewDir = path.join(FRONTEND_DIR, `.demo-preview${suffix}`);
  const framesDir = path.join(FRONTEND_DIR, ".demo-frames");

  let server = null;
  let chrome = null;
  let cdp = null;
  try {
    if (!(await reachable(pageUrl))) {
      if (!options.spawnServer) throw new Error(`${pageUrl} 打不开，且指定了 --no-server`);
      const port = Number(new URL(options.baseUrl).port || 3100);
      process.stdout.write(`· 起本地服务：next dev -p ${port}（产物目录 ${options.distDir}）\n`);
      server = await startServer(port, options.distDir);
      for (let attempt = 0; attempt < 240; attempt += 1) {
        if (await reachable(pageUrl)) break;
        if (attempt === 239) throw new Error(`服务 120s 内没起来：\n${server.logs.join("")}`);
        await sleep(500);
      }
    }
    process.stdout.write(`· 页面就绪：${pageUrl}\n`);

    chrome = await launchChrome();
    process.stdout.write(`· Chrome 调试端口：${chrome.port}\n`);
    const target = await findPageTarget(chrome.port);
    process.stdout.write(`· 页面目标：${target.id}\n`);
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    process.stdout.write("· CDP 已连接\n");
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: FILM.width,
      height: FILM.height,
      deviceScaleFactor: FILM.scale,
      mobile: false,
    });

    const loaded = cdp.once("Page.loadEventFired").catch(() => {});
    await cdp.send("Page.navigate", { url: pageUrl });
    await loaded;

    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (await cdp.evaluate("typeof window.__demoSeek === 'function'")) break;
      if (attempt === 299) throw new Error("页面 30s 内没有挂上 __demoSeek（水合失败？）");
      await sleep(100);
    }
    await sleep(400); // 字体落地

    // 先抓一帧确认舞台尺寸没被别的东西（滚动条、缩放）改掉
    await seek(cdp, 0);
    const metrics = await cdp.evaluate(
      "JSON.stringify({w: document.documentElement.clientWidth, h: document.documentElement.clientHeight, dpr: window.devicePixelRatio})",
    );
    process.stdout.write(`· 舞台：${metrics}\n`);

    if (options.preview) {
      await rm(previewDir, { recursive: true, force: true });
      await mkdir(previewDir, { recursive: true });
      for (const time of PREVIEW_AT) {
        await seek(cdp, time);
        const png = await capturePng(cdp);
        const file = path.join(previewDir, `t${String(time).replace(".", "_")}.png`);
        await writeFile(file, png);
        process.stdout.write(`  预览帧 t=${time}s → ${path.relative(FRONTEND_DIR, file)}\n`);
      }
      process.stdout.write("· 预览完毕（未编码视频）\n");
      return;
    }

    await mkdir(options.out, { recursive: true });
    const totalFrames = Math.round(FILM.seconds * FILM.fps);
    const outputFile = path.join(options.out, `negotiation${suffix}.mp4`);

    if (options.keepFrames) {
      await rm(framesDir, { recursive: true, force: true });
      await mkdir(framesDir, { recursive: true });
    }

    // 逐帧 PNG 直接管道喂给 ffmpeg：500 张 2560×1920 的 PNG 落盘要 1GB 以上，
    // 而且没有任何好处——这些帧不会再被用第二次。
    const encoder = runFfmpeg(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-f", "image2pipe",
        "-framerate", String(FILM.fps),
        "-i", "-",
        "-vf", `scale=${FILM.width}:${FILM.height}:flags=lanczos`,
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "21",
        "-pix_fmt", "yuv420p",
        "-profile:v", "high",
        "-movflags", "+faststart",
        "-an",
        outputFile,
      ],
      { pipeInput: true },
    );
    const encoderDone = new Promise((resolve, reject) => {
      encoder.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 退出码 ${code}`))));
      encoder.on("error", reject);
    });
    // ffmpeg 中途死掉时，下面等待 drain 的分支可能先拿到这个 rejection；
    // 先挂一个空 catch，避免它变成 unhandledRejection 把脚本崩掉。
    encoderDone.catch(() => {});

    // stdin 的错误必须有人接：ffmpeg 不存在（ENOENT）或中途退出（EPIPE）时，
    // 没有监听就是一个未捕获异常，直接崩溃。
    const encoderDied = new Promise((_, reject) => {
      encoder.on("error", (error) => reject(new Error(`ffmpeg 启动失败：${error.message}`)));
      encoder.stdin.on("error", (error) => reject(new Error(`写入 ffmpeg 失败：${error.message}`)));
    });
    encoderDied.catch(() => {});

    /** 写入一帧并在 ffmpeg 吃不下时等它消费完。
     *  必须带上 ffmpeg 的存活与超时：它一旦死掉，drain 永远不会来，
     *  裸等会把这个脚本永久挂住。 */
    async function writeFrame(buffer) {
      if (encoder.exitCode !== null) throw new Error(`ffmpeg 已退出（code ${encoder.exitCode}）`);
      if (encoder.stdin.write(buffer)) return;
      await Promise.race([
        new Promise((resolve) => encoder.stdin.once("drain", resolve)),
        encoderDied,
        new Promise((_, reject) => setTimeout(() => reject(new Error("等待 ffmpeg 消费帧超过 60s")), 60_000)),
      ]);
    }

    process.stdout.write(`· 渲染 ${totalFrames} 帧（${FILM.fps}fps × ${FILM.seconds}s）\n`);
    const startedAt = Date.now();
    for (let index = 0; index < totalFrames; index += 1) {
      const time = index / FILM.fps;
      await seek(cdp, time);
      const png = await capturePng(cdp);
      if (options.keepFrames) {
        await writeFile(path.join(framesDir, `f${String(index).padStart(5, "0")}.png`), png);
      }
      await writeFrame(png);
      if (index % 60 === 0 && index > 0) {
        const rate = index / ((Date.now() - startedAt) / 1000);
        process.stdout.write(`  ${index}/${totalFrames} 帧 · ${rate.toFixed(1)} 帧/秒\n`);
      }
    }
    encoder.stdin.end();
    await encoderDone;
    process.stdout.write(`· 视频完成：${path.relative(FRONTEND_DIR, outputFile)}\n`);

    // 封面：与视频同一帧，所以 poster 与视频首屏不会「两张脸」
    await seek(cdp, FILM.posterAt);
    const posterPng = path.join(tmpdir(), `liantan-poster-${Date.now()}.png`);
    await writeFile(posterPng, await capturePng(cdp));
    try {
      const posterJpg = path.join(options.out, `negotiation-poster${suffix}.jpg`);
      await new Promise((resolve, reject) => {
        const converter = runFfmpeg(ffmpeg, [
          "-y", "-hide_banner", "-loglevel", "error",
          "-i", posterPng,
          "-vf", `scale=${FILM.width}:${FILM.height}:flags=lanczos`,
          "-q:v", "3",
          posterJpg,
        ]);
        converter.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`封面 ffmpeg 退出码 ${code}`))));
        converter.on("error", reject);
      });
      process.stdout.write(`· 封面完成：${path.relative(FRONTEND_DIR, posterJpg)}\n`);
    } finally {
      // 放在 finally 里：中途报错也不会在系统临时目录里留一张 3MB 的 PNG
      await rm(posterPng, { force: true });
    }
  } finally {
    cdp?.close();
    if (chrome?.userDataDir) await rm(chrome.userDataDir, { recursive: true, force: true }).catch(() => {});
    // 用登记表而不是 chrome/server 两个变量：中途抛错时它们可能还是 null，
    // 而进程早就起来了。
    killAll();
  }
}

main().catch((error) => {
  killAll();
  process.stderr.write(`\n出错了：${error.message}\n`);
  process.exitCode = 1;
});
