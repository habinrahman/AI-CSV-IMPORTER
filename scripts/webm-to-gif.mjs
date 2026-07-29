/**
 * Converts the latest Playwright demo WebM to docs/screenshots/demo.gif
 * Run after: npm run build && npm run record:demo --workspace frontend
 */
import { readdir, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEST_RESULTS = path.join(ROOT, "frontend", "test-results");
const OUT_DIR = path.join(ROOT, "docs", "screenshots");
const FFMPEG = ffmpegInstaller.path;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function findLatestWebm(dir) {
  let newest = null;
  let newestTime = 0;

  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".webm")) {
        const { mtimeMs } = await stat(full);
        if (mtimeMs > newestTime) {
          newestTime = mtimeMs;
          newest = full;
        }
      }
    }
  }

  await walk(dir);
  return newest;
}

async function main() {
  const webm = await findLatestWebm(TEST_RESULTS);
  if (!webm) {
    console.error("No WebM found in frontend/test-results — run the demo spec first.");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const palette = path.join(OUT_DIR, ".palette.png");
  const gifPath = path.join(OUT_DIR, "demo.gif");

  console.log(`Converting ${webm} → ${gifPath}`);
  await run(FFMPEG, [
    "-y",
    "-i",
    webm,
    "-vf",
    "fps=12,scale=1280:-1:flags=lanczos,palettegen=stats_mode=diff",
    palette,
  ]);
  await run(FFMPEG, [
    "-y",
    "-i",
    webm,
    "-i",
    palette,
    "-lavfi",
    "fps=12,scale=1280:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3",
    "-loop",
    "0",
    gifPath,
  ]);
  console.log(`Demo GIF written to ${gifPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
