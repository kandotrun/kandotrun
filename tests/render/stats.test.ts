import { describe, expect, it } from "vitest";
import snapshotJson from "../../data/snapshot/github.json";
import { createFsAssetLoader } from "../../src/assets/loader";
import { GitHubSnapshot, type LanguageStat } from "../../src/contract/schema";
import {
  exposureValue,
  formatShare,
  harmonizeColors,
  languageMix,
  renderStats,
} from "../../src/render/stats";
import { themes } from "../../src/render/theme";
import type { RenderContext } from "../../src/render/types";
import { fakeAssets } from "../helpers/fake-assets";
import { expectGithubSafeSvg } from "../helpers/svg-assert";

const BUDGET = 80 * 1024;

const lang = (name: string, bytes: number, color = "#3178c6"): LanguageStat => ({ name, color, bytes });

/** `days` daily counts ending on 2026-10-20, grouped into Sunday-first weeks. */
function weeksOf(counts: number[]): GitHubSnapshot["contributions"]["weeks"] {
  const end = Date.parse("2026-10-20T00:00:00Z");
  const days = counts.map((count, i) => {
    const date = new Date(end - (counts.length - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date, count, level: count === 0 ? 0 : Math.min(4, 1 + Math.floor(count / 10)) };
  });
  const weeks: GitHubSnapshot["contributions"]["weeks"] = [];
  for (const day of days) {
    const sunday = new Date(`${day.date}T00:00:00Z`).getUTCDay() === 0;
    if (sunday || weeks.length === 0) weeks.push({ days: [] });
    weeks.at(-1)!.days.push(day);
  }
  return weeks;
}

function snapshot(overrides: Partial<GitHubSnapshot> = {}): GitHubSnapshot {
  const counts = Array.from({ length: 365 }, (_, i) => (i % 7 === 0 ? 0 : 3 + (i % 5)));
  return GitHubSnapshot.parse({
    fetchedAt: "2026-10-21T03:32:32.767Z",
    login: "kandotrun",
    totals: {
      publicRepos: 70,
      stars: 16,
      followers: 45,
      commits: 3553,
      pullRequests: 227,
      issues: 45,
      reviews: 4,
      contributions: 14019,
    },
    languages: [
      lang("TypeScript", 21_987_182, "#3178c6"),
      lang("Python", 1_020_587, "#3572A5"),
      lang("Swift", 746_855, "#F05138"),
      lang("JavaScript", 368_942, "#f1e05a"),
      lang("CSS", 337_301, "#663399"),
      lang("Rust", 130_644, "#dea584"),
      lang("HTML", 69_297, "#e34c26"),
      lang("C++", 34_290, "#f34b7d"),
      lang("Shell", 14_617, "#89e051"),
    ],
    contributions: { total: counts.reduce((a, b) => a + b, 0), weeks: weeksOf(counts) },
    ...overrides,
  });
}

const ctx = (theme: "dark" | "light" = "dark"): RenderContext & { assets: ReturnType<typeof fakeAssets> } => ({
  theme: themes[theme],
  assets: fakeAssets(),
});

describe("languageMix", () => {
  it("keeps the top six languages and folds the rest into Other", () => {
    const mix = languageMix(snapshot().languages);
    expect(mix.map((m) => m.name)).toEqual(["TypeScript", "Python", "Swift", "JavaScript", "CSS", "Rust", "Other"]);
    const other = mix.at(-1)!;
    expect(other.bytes).toBe(69_297 + 34_290 + 14_617);
    expect(other.other).toBe(true);
  });

  it("does not fold a single leftover language into Other", () => {
    const seven = snapshot().languages.slice(0, 7);
    expect(languageMix(seven).map((m) => m.name)).toEqual(seven.map((l) => l.name));
  });

  it("gives each entry its share of all bytes", () => {
    const mix = languageMix([lang("A", 75), lang("B", 25)]);
    expect(mix.map((m) => m.share)).toEqual([0.75, 0.25]);
    const total = languageMix(snapshot().languages).reduce((sum, m) => sum + m.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("returns nothing when there are no bytes", () => {
    expect(languageMix([])).toEqual([]);
    expect(languageMix([lang("A", 0)])).toEqual([]);
  });
});

describe("formatShare", () => {
  it("formats a share as a percentage with one decimal", () => {
    expect(formatShare(0.8893)).toBe("88.9%");
    expect(formatShare(1)).toBe("100%");
    expect(formatShare(0.0153)).toBe("1.5%");
  });

  it("never shows a non-zero share as 0.0%", () => {
    expect(formatShare(0.0004)).toBe("<0.1%");
  });
});

describe("exposureValue", () => {
  it("is 0 EV when the last 28 days match the yearly average", () => {
    const weeks = weeksOf(Array.from({ length: 364 }, () => 5));
    expect(exposureValue({ total: 5 * 364, weeks })).toBeCloseTo(0, 6);
  });

  it("is +1 EV when the last 28 days are twice the average pace", () => {
    // 336 days at 1/day, then 28 days at 2/day; the yearly average includes the recent days.
    const counts = [...Array.from({ length: 336 }, () => 1), ...Array.from({ length: 28 }, () => 2)];
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const expected = Math.log2(2 / avg);
    expect(exposureValue({ total: 392, weeks: weeksOf(counts) })).toBeCloseTo(expected, 6);
  });

  it("clamps to the -3..+3 scale", () => {
    const quiet = [...Array.from({ length: 336 }, () => 9), ...Array.from({ length: 28 }, () => 0)];
    expect(exposureValue({ total: 9 * 336, weeks: weeksOf(quiet) })).toBe(-3);
    const burst = [...Array.from({ length: 336 }, () => 0), ...Array.from({ length: 28 }, () => 9)];
    expect(exposureValue({ total: 9 * 28, weeks: weeksOf(burst) })).toBe(3);
  });

  it("is 0 EV with no activity at all", () => {
    expect(exposureValue({ total: 0, weeks: weeksOf(Array.from({ length: 30 }, () => 0)) })).toBe(0);
  });
});

describe("harmonizeColors", () => {
  it("returns one valid hex color per input, different per theme", () => {
    const input = ["#3178c6", "#3572A5", "#f1e05a"];
    const dark = harmonizeColors(input, themes.dark);
    const light = harmonizeColors(input, themes.light);
    for (const c of [...dark, ...light]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(dark).toHaveLength(3);
    expect(dark).not.toEqual(light);
  });

  it("pulls near-identical hues apart so neighbours stay distinguishable", () => {
    const [ts, py] = harmonizeColors(["#3178c6", "#3572A5"], themes.dark);
    expect(ts).not.toBe(py);
  });

  it("is lighter on the dark theme than on the light theme", () => {
    const luminance = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    const [dark] = harmonizeColors(["#f1e05a"], themes.dark);
    const [light] = harmonizeColors(["#f1e05a"], themes.light);
    expect(luminance(dark!)).toBeGreaterThan(luminance(light!));
  });
});

describe("renderStats", () => {
  it("is a GitHub-safe SVG within budget, with the real fonts", async () => {
    const svg = await renderStats(GitHubSnapshot.parse(snapshotJson), {
      theme: themes.dark,
      assets: createFsAssetLoader(process.cwd()),
    });
    expectGithubSafeSvg(svg, { maxBytes: BUDGET });
    const light = await renderStats(GitHubSnapshot.parse(snapshotJson), {
      theme: themes.light,
      assets: createFsAssetLoader(process.cwd()),
    });
    expectGithubSafeSvg(light, { maxBytes: BUDGET });
  });

  it("is deterministic", async () => {
    const a = await renderStats(snapshot(), ctx());
    const b = await renderStats(snapshot(), ctx());
    expect(a).toBe(b);
  });

  it("renders both themes from the same structure with different colors", async () => {
    const dark = await renderStats(snapshot(), ctx("dark"));
    const light = await renderStats(snapshot(), ctx("light"));
    expect(dark).not.toBe(light);
    const tags = (svg: string) => svg.match(/<[a-zA-Z]+/g);
    expect(tags(dark)).toEqual(tags(light));
    expect(dark).toContain(themes.dark.bg);
    expect(light).toContain(themes.light.bg);
  });

  it("labels the histogram and every legend entry with its share", async () => {
    const svg = await renderStats(snapshot(), ctx());
    expect(svg).toContain(">HISTOGRAM<");
    for (const m of languageMix(snapshot().languages)) {
      expect(svg).toContain(`>${m.name}<`);
      expect(svg).toContain(`>${formatShare(m.share)}<`);
    }
    expect(svg).not.toContain(">HTML<");
  });

  it("draws the real totals as LCD digits, in reading order", async () => {
    const svg = await renderStats(snapshot(), ctx());
    const lit = svg.match(/<g class="lit"[^>]*>(.*?)<\/g>/)?.[1] ?? "";
    const digits = [...lit.matchAll(/href="#d(\d)"/g)].map((m) => m[1]).join("");
    expect(digits).toBe(["14019", "3553", "227", "4", "70", "16", "45"].join(""));
  });

  it("states the update date from fetchedAt and the exposure reading", async () => {
    const svg = await renderStats(snapshot(), ctx());
    expect(svg).toContain(">UPDATED 2026-10-21<");
    expect(svg).toMatch(/>[+-]\d\.\d EV</);
  });

  it("describes every number in the accessible description", async () => {
    const svg = await renderStats(snapshot(), ctx());
    const desc = svg.match(/<desc[^>]*>([^<]*)<\/desc>/)?.[1] ?? "";
    const top = languageMix(snapshot().languages)[0]!;
    for (const value of ["14,019", "3,553", "227", "70", "16", "45", `TypeScript ${formatShare(top.share)}`]) {
      expect(desc).toContain(value);
    }
  });

  it("requests font subsets covering exactly the glyphs it sets in each role", async () => {
    const c = ctx();
    const svg = await renderStats(snapshot(), c);
    const textIn = (cls: string) =>
      [...svg.matchAll(new RegExp(`<text[^>]*class="${cls}(?: [^"]*)?"[^>]*>([^<]*)</text>`, "g"))]
        .map((m) => m[1]!.replace(/&lt;/g, "<").replace(/&amp;/g, "&"))
        .join("");
    for (const [role, cls] of [
      ["mono", "m"],
      ["mono-bold", "mb"],
    ] as const) {
      const used = new Set(textIn(cls));
      expect(used.size, `${cls} text present`).toBeGreaterThan(0);
      const requested = new Set(c.assets.requested.get(role) ?? "");
      for (const ch of used) expect(requested.has(ch), `glyph ${JSON.stringify(ch)} in ${role}`).toBe(true);
      for (const ch of requested) expect(used.has(ch), `extra glyph ${JSON.stringify(ch)} in ${role}`).toBe(true);
    }
    expect(c.assets.requested.has("display")).toBe(false);
  });

  it("animates on one cycle and stands still for reduced motion", async () => {
    const svg = await renderStats(snapshot(), ctx());
    expect(svg).toMatch(/@keyframes/);
    expect(svg).toMatch(/@media \(prefers-reduced-motion: ?reduce\)\{[^}]*animation:none/);
    expect(svg).toContain("transform-box:fill-box");
  });

  it("still renders without language data", async () => {
    const svg = await renderStats(snapshot({ languages: [] }), ctx());
    expectGithubSafeSvg(svg, { maxBytes: BUDGET });
    expect(svg).toContain(">NO DATA<");
  });
});
