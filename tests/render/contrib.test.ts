import { describe, expect, it } from "vitest";
import { GitHubSnapshot } from "../../src/contract/schema";
import { gridCells, renderContrib } from "../../src/render/contrib";
import { themes } from "../../src/render/theme";
import { fakeAssets } from "../helpers/fake-assets";
import { expectGithubSafeSvg } from "../helpers/svg-assert";
import fixture from "../fixtures/contrib-snapshot.json";

const snapshot = GitHubSnapshot.parse(fixture);
const BUDGET = 150_000;

async function render(theme: "dark" | "light" = "dark", data: GitHubSnapshot = snapshot) {
  const assets = fakeAssets();
  const svg = await renderContrib(data, { theme: themes[theme], assets });
  return { svg, assets };
}

/** Text of every <text> element (tspans flattened), one element per line. */
function textContent(svg: string): string {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => (m[1] ?? "").replace(/<[^>]+>/g, ""))
    .join("\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function styleOf(svg: string): string {
  return /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? "";
}

/** Small synthetic snapshot: starts on a Wednesday, ends on a Monday. */
function tinySnapshot(counts: number[]): GitHubSnapshot {
  const start = Date.parse("2026-03-04T00:00:00Z");
  const weeks: GitHubSnapshot["contributions"]["weeks"] = [];
  counts.forEach((count, i) => {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    if (weeks.length === 0 || new Date(`${date}T00:00:00Z`).getUTCDay() === 0) weeks.push({ days: [] });
    weeks.at(-1)?.days.push({ date, count, level: Math.min(4, count) });
  });
  const total = counts.reduce((a, b) => a + b, 0);
  return GitHubSnapshot.parse({
    ...snapshot,
    totals: { ...snapshot.totals, contributions: total },
    contributions: { total, weeks },
  });
}

describe("gridCells", () => {
  it("places one cell per day, column = week, row = weekday", () => {
    const cells = gridCells(snapshot.contributions);
    const dayCount = snapshot.contributions.weeks.reduce((n, w) => n + w.days.length, 0);
    expect(cells).toHaveLength(dayCount);
    const first = cells[0];
    expect(first).toMatchObject({ week: 0, row: 0, level: snapshot.contributions.weeks[0]?.days[0]?.level });
  });

  it("puts the first day of a partial week on its weekday row", () => {
    const cells = gridCells(tinySnapshot([1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2]).contributions);
    const [wed, , , sat, sun] = cells;
    expect(wed).toMatchObject({ week: 0, row: 3 });
    expect(sat).toMatchObject({ week: 0, row: 6 });
    expect(sun).toMatchObject({ week: 1, row: 0 });
    expect(sun!.x - wed!.x).toBeGreaterThan(0);
    expect(sun!.y).toBeLessThan(wed!.y);
    expect(sat!.y - wed!.y).toBeCloseTo(3 * (cells[1]!.y - wed!.y));
  });
});

describe("renderContrib", () => {
  it("produces a GitHub-safe SVG within the 150 KB budget in both themes", async () => {
    for (const theme of ["dark", "light"] as const) {
      const { svg } = await render(theme);
      expectGithubSafeSvg(svg, { maxBytes: BUDGET });
      expect(svg).toContain(`viewBox="0 0 1280 `);
    }
  });

  it("is deterministic", async () => {
    const a = await render("dark");
    const b = await render("dark");
    expect(a.svg).toBe(b.svg);
  });

  it("renders both themes from the same structure with different tokens", async () => {
    const dark = (await render("dark")).svg;
    const light = (await render("light")).svg;
    expect(dark).not.toBe(light);
    const shape = (svg: string) => svg.replace(/<style>[\s\S]*?<\/style>/, "").replace(/#[0-9a-fA-F]{6}/g, "#");
    expect(shape(dark)).toBe(shape(light));
  });

  it("takes its colours from the theme", async () => {
    for (const name of ["dark", "light"] as const) {
      const { svg } = await render(name);
      const t = themes[name];
      for (const color of [t.bg, t.lock, t.accent, ...t.levels]) {
        expect(svg, `${name} uses ${color}`).toContain(color);
      }
    }
  });

  it("locks onto the peak week and prints the stats line", async () => {
    const text = textContent((await render()).svg);
    expect(text).toContain("PEAK WEEK · 2026-05-31 · 1,825");
    expect(text).toContain("14,030");
    expect(text).toContain("CONTRIBUTIONS");
    expect(text).toMatch(/LONGEST STREAK\s*69/);
    expect(text).toMatch(/CURRENT\s*2/);
    expect(text).toContain("2025-10-19");
    expect(text).toContain("2026-10-21");
  });

  it("describes the result in Japanese for screen readers", async () => {
    const { svg } = await render();
    const desc = /<desc[^>]*>([^<]*)<\/desc>/.exec(svg)?.[1] ?? "";
    expect(desc).toContain("14,030");
    expect(desc).toContain("2026-05-31");
    expect(desc).toMatch(/[ぁ-んァ-ン一-龠]/);
  });

  it("subsets the mono fonts to exactly the rendered glyphs and uses no display font", async () => {
    const { svg, assets } = await render();
    const requested = [...assets.requested.keys()].sort();
    expect(requested).toEqual(["mono", "mono-bold"]);
    const covered = new Set([...(assets.requested.get("mono") ?? ""), ...(assets.requested.get("mono-bold") ?? "")]);
    const rendered = textContent(svg).replace(/\n/g, "");
    for (const ch of new Set(rendered)) {
      expect(covered.has(ch), `glyph ${JSON.stringify(ch)} is subset`).toBe(true);
    }
    for (const ch of covered) {
      expect(rendered.includes(ch), `glyph ${JSON.stringify(ch)} is rendered`).toBe(true);
    }
  });

  describe("animation", () => {
    it("runs every animation on one shared, infinite cycle", async () => {
      const css = styleOf((await render()).svg);
      const durations = new Set([...css.matchAll(/animation(?:-duration)?:[^;}]*?\b([\d.]+)s\b/g)].map((m) => m[1]));
      expect(durations.size).toBe(1);
      expect(css).toMatch(/infinite/);
      expect(css).not.toMatch(/animation-delay/);
    });

    it("defines keyframes per column at most, never per cell", async () => {
      const css = styleOf((await render()).svg);
      const keyframes = css.match(/@keyframes/g) ?? [];
      expect(keyframes.length).toBeLessThanOrEqual(snapshot.contributions.weeks.length + 12);
    });

    it("turns motion off for prefers-reduced-motion", async () => {
      const css = styleOf((await render()).svg);
      expect(css).toMatch(/@media \(prefers-reduced-motion: ?reduce\)\{[^}]*animation:none/);
    });

    it("leaves the fully developed, locked frame as the static (un-animated) state", async () => {
      const css = styleOf((await render()).svg);
      const outsideKeyframes = css.replace(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
      const hidden = [...outsideKeyframes.matchAll(/([^{}]+)\{(?:[^{}]*;)?opacity:0[;}]/g)].map((m) => m[1]?.trim());
      // Only the scan line, the hunting brackets and the "developing" label start hidden.
      expect(hidden.sort()).toEqual([".fx-hunt", ".fx-scan", ".fx-wip"]);
    });
  });

  it("handles a short calendar with a partial first week and an all-empty calendar", async () => {
    for (const data of [tinySnapshot([1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2]), tinySnapshot(Array(10).fill(0))]) {
      const { svg } = await render("dark", data);
      expectGithubSafeSvg(svg, { maxBytes: BUDGET });
      expect(textContent(svg)).toContain("PEAK WEEK");
    }
  });
});
