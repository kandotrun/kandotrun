// Screenshot an SVG the way GitHub shows it (as an <img> on the README background)
// at several moments of its animation.
//
//   pnpm exec tsx src/cli/shoot.ts <file.svg> [--width 830] [--times 0,1.5,4] \
//     [--scheme dark|light] [--out .preview/shots] [--reduced]
//
// --reduced opens the SVG as its own document with prefers-reduced-motion, since
// Chromium's emulation does not reach SVGs inside <img>.
//
// Writes <out>/<name>-<scheme>-<width>w-t<seconds>.png and prints the paths.
import { mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const GITHUB_BG = { dark: "#0d1117", light: "#ffffff" } as const;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: "string", default: "830" },
    times: { type: "string", default: "0.3,2,5" },
    scheme: { type: "string", default: "dark" },
    out: { type: "string", default: ".preview/shots" },
    reduced: { type: "boolean", default: false },
  },
});

const file = positionals[0];
if (!file) {
  console.error("usage: tsx src/cli/shoot.ts <file.svg> [--width 830] [--times 0,2,5] [--scheme dark|light]");
  process.exit(1);
}
const scheme = values.scheme === "light" ? "light" : "dark";
const width = Number(values.width);
const times = values.times.split(",").map(Number);
const outDir = resolve(values.out);
await mkdir(outDir, { recursive: true });

const svg = await readFile(resolve(file));
const src = `data:image/svg+xml;base64,${svg.toString("base64")}`;
const html = `<!doctype html><html><body style="margin:0;padding:16px;background:${GITHUB_BG[scheme]}">
<img id="i" src="${src}" style="display:block;width:${width}px;max-width:none"></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: width + 32, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    reducedMotion: values.reduced ? "reduce" : "no-preference",
  });
  const name = basename(file, ".svg");
  if (values.reduced) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(pathToFileURL(resolve(file)).href);
    const out = join(outDir, `${name}-${scheme}-${width}w-reduced.png`);
    await page.locator("svg").first().screenshot({ path: out });
    console.log(out);
    times.length = 0;
  }
  for (const t of times) {
    await page.setContent(html);
    await page.waitForFunction(() => (document.getElementById("i") as HTMLImageElement).complete);
    await page.waitForTimeout(t * 1000);
    const out = join(outDir, `${name}-${scheme}-${width}w-t${t}.png`);
    await page.locator("#i").screenshot({ path: out });
    console.log(out);
  }
} finally {
  await browser.close();
}
