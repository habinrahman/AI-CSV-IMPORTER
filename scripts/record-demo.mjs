/**
 * Records a product demo (WebM + GIF) via Playwright.
 * Requires a built stack: npm run build && node scripts/record-demo.mjs
 *
 * Without OPENAI_API_KEY: upload → preview → confirm dialog (still recruiter-worthy).
 * With OPENAI_API_KEY: full journey through results (set env before running).
 */
import { spawn } from "node:child_process";
import { mkdir, rm, readdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SAMPLES = path.join(ROOT, "samples", "leads-messy.csv");
const OUT_DIR = path.join(ROOT, "docs", "screenshots");
const VIDEO_DIR = path.join(OUT_DIR, ".demo-recordings");
const FFMPEG = ffmpegInstaller.path;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: true, ...opts });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function waitForUrl(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startServers() {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: "4000",
    CORS_ORIGIN: "http://localhost:3000",
    LOG_LEVEL: "warn",
  };

  const backend = spawn("npm run start --workspace backend", {
    cwd: ROOT,
    env,
    shell: true,
    stdio: "ignore",
  });
  const frontend = spawn("npm run start --workspace frontend", {
    cwd: ROOT,
    env,
    shell: true,
    stdio: "ignore",
  });

  await waitForUrl("http://localhost:4000/api/health");
  await waitForUrl("http://localhost:3000");

  return () => {
    backend.kill("SIGTERM");
    frontend.kill("SIGTERM");
  };
}

async function webmToGif(webmPath, gifPath) {
  // Palette-based GIF for reasonable size (~1–2 MB target)
  const palette = path.join(VIDEO_DIR, "palette.png");
  await run(FFMPEG, [
    "-y",
    "-i",
    webmPath,
    "-vf",
    "fps=12,scale=1280:-1:flags=lanczos,palettegen=stats_mode=diff",
    palette,
  ]);
  await run(FFMPEG, [
    "-y",
    "-i",
    webmPath,
    "-i",
    palette,
    "-lavfi",
    "fps=12,scale=1280:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3",
    "-loop",
    "0",
    gifPath,
  ]);
}

async function recordDemo() {
  await rm(VIDEO_DIR, { recursive: true, force: true });
  await mkdir(VIDEO_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const stopServers = await startServers();

  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
      colorScheme: "light",
    });
    const page = await context.newPage();

    // Home
    await page.goto("http://localhost:3000/");
    await page.waitForLoadState("networkidle");
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT_DIR, "home.png") });

    await page.getByRole("link", { name: /start importing/i }).click();
    await expectUrl(page, /\/import\/upload/);
    await sleep(600);
    await page.screenshot({ path: path.join(OUT_DIR, "upload.png") });

    await page.locator('input[type="file"]').setInputFiles(SAMPLES);
    await expectVisible(page, "leads-messy.csv");
    await sleep(800);
    await page.getByRole("button", { name: /upload & continue/i }).click();

    await expectUrl(page, /\/import\/preview/, 20_000);
    await expectVisible(page, page.getByRole("columnheader", { name: "Correo" }));
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT_DIR, "preview.png") });

    await page.getByRole("button", { name: /start ai import/i }).click();
    await expectVisible(page, page.getByRole("alertdialog"));
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT_DIR, "confirm-dialog.png") });

    if (process.env["OPENAI_API_KEY"]) {
      await page.getByRole("button", { name: "Start import" }).click();
      await expectUrl(page, /\/import\/progress/);
      await sleep(1000);
      await page.screenshot({ path: path.join(OUT_DIR, "progress.png") });
      await expectUrl(page, /\/import\/result/, 180_000);
      await sleep(2000);
      await page.screenshot({ path: path.join(OUT_DIR, "result.png") });
    } else {
      // End on preview — strongest no-key frame for recruiters
      await page.keyboard.press("Escape");
      await sleep(800);
    }

    await context.close();
    const video = page.video();
    const webmPath = video ? await video.path() : null;

    if (webmPath) {
      const gifPath = path.join(OUT_DIR, "demo.gif");
      console.log("Converting WebM → GIF…");
      await webmToGif(webmPath, gifPath);
      console.log(`Demo GIF: ${gifPath}`);
    }
  } finally {
    if (browser) await browser.close();
    stopServers();
  }
}

async function expectUrl(page, pattern, timeout = 15_000) {
  await page.waitForURL(pattern, { timeout });
}

async function expectVisible(page, target) {
  const locator = typeof target === "string" ? page.getByText(target) : target;
  await locator.waitFor({ state: "visible", timeout: 15_000 });
}

recordDemo().catch((err) => {
  console.error(err);
  process.exit(1);
});
