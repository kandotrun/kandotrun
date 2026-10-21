// Renders README.md through GitHub's own Markdown API (same sanitizer as
// github.com), serves the generated assets locally, and checks the result in
// dark/light at the README column widths github.com uses. Run `just build` first.
//
// The harness follows the profile page (github.com/kandotrun), measured live:
// - README column: 846 px in wide windows, 766 px in a ~1200 px window (laptops,
//   half of a 1920 px screen), 311 px on an iPhone. The article carries the
//   profile's `f5` class, which sets 14 px text (github-markdown-css alone is 16 px).
// - Assets come back with raw.githubusercontent.com's CSP and nosniff headers.
// - The API's "gfm" mode renders soft line breaks as <br>, like comments;
//   github.com's README rendering does not, so the README must not contain any.
// playwright.config.ts runs every test in Chromium and WebKit (Safari, iOS).
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { profile } from "../data/profile";

const ROOT = process.cwd();
const ORIGIN = "https://readme.test";
const MARKDOWN_CSS = "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.8.1/github-markdown.min.css";
const BG = { dark: "#0d1117", light: "#ffffff" } as const;
const RAW_HEADERS = {
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "x-content-type-options": "nosniff",
};
// hero + one frame per featured project + stats + contrib
const GENERATED_PICTURES = 3 + profile.featured.length;

const WIDTHS = [
  { label: "desktop", column: 846, viewport: { width: 1280, height: 900 }, framesPerRow: 3, cardsPerRow: 3 },
  { label: "mid", column: 766, viewport: { width: 1200, height: 900 }, framesPerRow: 2, cardsPerRow: 3 },
  { label: "phone", column: 311, viewport: { width: 393, height: 852 }, framesPerRow: 1, cardsPerRow: 1 },
] as const;

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

async function open(page: Page, scheme: "dark" | "light", column: number) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/") {
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="${MARKDOWN_CSS}">
<style>*,*::before,*::after{box-sizing:border-box} body{margin:0;background:${BG[scheme]}} .markdown-body{box-sizing:content-box;max-width:${column}px;margin:0 auto;padding:24px 16px} .f5{font-size:14px!important}</style></head>
<body><article class="markdown-body entry-content container-lg f5">${html}</article></body></html>`,
      });
    }
    const file = join(ROOT, path);
    if (!file.startsWith(join(ROOT, "assets"))) return route.fulfill({ status: 404 });
    const body = await readFile(file).catch(() => null);
    if (!body) return route.fulfill({ status: 404 });
    const contentType = path.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
    return route.fulfill({ body, headers: { "content-type": contentType, ...RAW_HEADERS } });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
}

/** Groups element tops into rows (tops within 2 px are one row) and returns the count per row. */
function perRow(tops: number[]): number[] {
  const rows: number[][] = [];
  for (const top of tops) {
    const row = rows.find((r) => Math.abs((r[0] ?? 0) - top) <= 2);
    if (row) row.push(top);
    else rows.push([top]);
  }
  return rows.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)).map((r) => r.length);
}

test("GitHub's sanitizer keeps every theme-aware <picture>", () => {
  const sources = html.match(/<source media="\(prefers-color-scheme: dark\)" srcset="assets\/generated\/[^"]+-dark\.svg">/g) ?? [];
  expect(sources.length).toBe(GENERATED_PICTURES);
  expect(html).not.toContain("<script");
});

test("no soft line breaks: the API renders them as <br>, github.com's README view does not", () => {
  // Every <br> the README means is inside a YouTube card cell or the float clear.
  const outsideCells = html.replace(/<td[\s\S]*?<\/td>/g, "").match(/<br(?![^>]*clear)[^>]*>/g) ?? [];
  expect(outsideCells).toEqual([]);
});

for (const scheme of ["dark", "light"] as const) {
  for (const { label, column, viewport } of WIDTHS) {
    test(`${scheme} ${label}: every image loads and the right theme is shown`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await open(page, scheme, column);

      const images = await page.$$eval("img", (imgs) =>
        imgs.map((img) => ({ src: img.currentSrc || img.src, ok: img.complete && img.naturalWidth > 0 })),
      );
      const broken = images.filter((img) => !img.ok).map((img) => img.src);
      expect(broken, "broken images").toEqual([]);

      const local = images.filter((img) => img.src.startsWith(`${ORIGIN}/assets/generated/`));
      expect(local.length).toBe(GENERATED_PICTURES);
      for (const img of local) expect(img.src.endsWith(`-${scheme}.svg`), img.src).toBe(true);

      const overflow = await page.$$eval("article img", (imgs) => {
        const right = document.querySelector("article")?.getBoundingClientRect().right ?? 0;
        return imgs.filter((img) => img.getBoundingClientRect().right > right + 1).map((img) => img.getAttribute("src"));
      });
      expect(overflow, "images wider than the column").toEqual([]);

      // Let the animations play a little so the screenshot shows a composed frame.
      await page.waitForTimeout(6_000);
      await page.screenshot({ path: `.preview/e2e/readme-${info.project.name}-${scheme}-${label}.png`, fullPage: true });
    });
  }
}

for (const { label, column, viewport, framesPerRow, cardsPerRow } of WIDTHS) {
  test(`${label} contact sheet: ${framesPerRow} per row, only the last row may be short`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, "dark", column);
    const tops = await page.$$eval('img[src*="/frames/"]', (imgs) => imgs.map((img) => img.getBoundingClientRect().top));
    expect(tops).toHaveLength(profile.featured.length);
    const rows = perRow(tops);
    expect(rows.slice(0, -1).every((n) => n === framesPerRow), `frames per row: ${rows.join(",")}`).toBe(true);
    expect(rows.at(-1) ?? 0).toBeLessThanOrEqual(framesPerRow);
  });

  test(`${label} YouTube cards: ${cardsPerRow} per row, next section below them`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, "dark", column);
    const boxes = await page.$$eval('table[align="left"]', (tables) =>
      tables.map((t) => {
        const r = t.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
    expect(boxes.length).toBeGreaterThan(0);
    expect(perRow(boxes.map((b) => b.top))[0]).toBe(Math.min(cardsPerRow, boxes.length));
    const lastBottom = Math.max(...boxes.map((b) => b.bottom));
    const nextHeading = await page.locator("h3", { hasText: "SENSORS" }).boundingBox();
    expect(nextHeading?.y ?? 0).toBeGreaterThanOrEqual(lastBottom);
  });
}
