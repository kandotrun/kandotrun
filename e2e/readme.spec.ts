// Renders README.md through GitHub's own Markdown API (same sanitizer as
// github.com), serves the generated assets locally, and checks the result in
// dark/light at desktop and phone widths. Run `just build` first.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const ROOT = process.cwd();
const ORIGIN = "https://readme.test";
const MARKDOWN_CSS = "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.8.1/github-markdown.min.css";
const BG = { dark: "#0d1117", light: "#ffffff" } as const;

function token(): string {
  return process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
}

let html = "";

test.beforeAll(async () => {
  const text = await readFile(join(ROOT, "README.md"), "utf8");
  const res = await fetch("https://api.github.com/markdown", {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ text, mode: "gfm", context: "kandotrun/kandotrun" }),
  });
  expect(res.ok, `markdown API ${res.status}`).toBe(true);
  html = await res.text();
});

async function open(page: Page, scheme: "dark" | "light", contentWidth: number) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/") {
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${MARKDOWN_CSS}">
<style>*,*::before,*::after{box-sizing:border-box} body{margin:0;background:${BG[scheme]}} .markdown-body{box-sizing:content-box;max-width:${contentWidth}px;margin:0 auto;padding:24px 16px}</style></head>
<body><article class="markdown-body">${html}</article></body></html>`,
      });
    }
    const file = join(ROOT, path);
    if (!file.startsWith(join(ROOT, "assets"))) return route.fulfill({ status: 404 });
    const body = await readFile(file).catch(() => null);
    if (!body) return route.fulfill({ status: 404 });
    return route.fulfill({ body, contentType: path.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream" });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
}

test("GitHub's sanitizer keeps every theme-aware <picture>", () => {
  const sources = html.match(/<source media="\(prefers-color-scheme: dark\)" srcset="assets\/generated\/[^"]+-dark\.svg">/g) ?? [];
  expect(sources.length).toBe(9); // hero + 6 frames + stats + contrib
  expect(html).not.toContain("<script");
});

for (const scheme of ["dark", "light"] as const) {
  for (const [label, width, viewport] of [
    ["desktop", 830, { width: 1280, height: 900 }],
    ["mobile", 358, { width: 390, height: 844 }],
  ] as const) {
    test(`${scheme} ${label}: every image loads and the right theme is shown`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, scheme, width);

      const images = await page.$$eval("img", (imgs) =>
        imgs.map((img) => ({ src: img.currentSrc || img.src, ok: img.complete && img.naturalWidth > 0 })),
      );
      const broken = images.filter((img) => !img.ok).map((img) => img.src);
      expect(broken, "broken images").toEqual([]);

      const local = images.filter((img) => img.src.startsWith(`${ORIGIN}/assets/generated/`));
      expect(local.length).toBe(9);
      for (const img of local) expect(img.src.endsWith(`-${scheme}.svg`), img.src).toBe(true);

      // Let the animations play a little so the screenshot shows a composed frame.
      await page.waitForTimeout(6_000);
      await page.screenshot({ path: `.preview/e2e/readme-${scheme}-${label}.png`, fullPage: true });
    });
  }
}

test("desktop contact sheet shows three frames per row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "dark", 830);
  const tops = await page.$$eval('img[src*="/frames/"]', (imgs) => imgs.map((img) => Math.round(img.getBoundingClientRect().top)));
  expect(tops).toHaveLength(6);
  expect(new Set(tops.slice(0, 3)).size).toBe(1);
  expect(new Set(tops.slice(3, 6)).size).toBe(1);
  expect(tops[3]).toBeGreaterThan(tops[0] ?? 0);
});

for (const [label, width, viewport, perRow] of [
  ["desktop", 830, { width: 1280, height: 900 }, 3],
  ["mobile", 358, { width: 390, height: 844 }, 1],
] as const) {
  test(`${label} YouTube cards: ${perRow} per row, next section below them`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, "dark", width);
    const boxes = await page.$$eval('table[align="left"]', (tables) =>
      tables.map((t) => {
        const r = t.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
      }),
    );
    expect(boxes.length).toBeGreaterThan(0);
    const firstRow = boxes.filter((b) => b.top === boxes[0]?.top);
    expect(firstRow.length).toBe(Math.min(perRow, boxes.length));
    const lastBottom = Math.max(...boxes.map((b) => b.bottom));
    const nextHeading = await page.locator("h3", { hasText: "SENSORS" }).boundingBox();
    expect(nextHeading?.y ?? 0).toBeGreaterThanOrEqual(lastBottom);
  });
}
