import { describe, expect, it } from "vitest";
import { profile } from "../../data/profile";
import { createFsAssetLoader } from "../../src/assets/loader";
import type { Project } from "../../src/contract/schema";
import { EXPOSURE, type FrameInput, layoutFrame, renderFrame } from "../../src/render/frame";
import { fontStack, type Theme, themeNames, themes } from "../../src/render/theme";
import type { FontRole, RenderContext } from "../../src/render/types";
import { fakeAssets } from "../helpers/fake-assets";
import { expectGithubSafeSvg } from "../helpers/svg-assert";

const BUDGET = 60 * 1024;
const featured = profile.featured;

function input(index: number, project: Project = featured[index]!): FrameInput {
  return { project, index, total: featured.length };
}

function ctx(theme: Theme = themes.dark, assets = fakeAssets()): RenderContext & { assets: ReturnType<typeof fakeAssets> } {
  return { theme, assets };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name]!);

/** Text content of every <text>/<tspan> carrying the given class. */
function textsWithClass(svg: string, cls: string): string[] {
  const out: string[] = [];
  const re = /<(text|tspan)\b([^>]*)>([^<]*)<\/\1>/g;
  for (const m of svg.matchAll(re)) {
    const classAttr = /\sclass="([^"]*)"/.exec(m[2]!)?.[1] ?? "";
    if (classAttr.split(/\s+/).includes(cls)) out.push(unescape(m[3]!));
  }
  return out;
}

const ROLE_CLASS: Record<FontRole, string> = { mono: "m", "mono-bold": "mb", display: "d", "display-bold": "db" };
const glyphs = (s: string) => new Set([...s].filter((ch) => ch.trim() !== ""));

function themeColors(theme: Theme): Set<string> {
  const values = Object.values(theme).flatMap((v) => (Array.isArray(v) ? v : [v]));
  return new Set(values.filter((v): v is string => typeof v === "string" && v.startsWith("#")).map((v) => v.toLowerCase()));
}

describe("renderFrame", () => {
  it(
    "renders every featured project as a GitHub-safe SVG within 60 KB in both themes (real fonts)",
    async () => {
      const assets = createFsAssetLoader(process.cwd());
      for (const name of themeNames) {
        for (const [index] of featured.entries()) {
          const svg = await renderFrame(input(index), { theme: themes[name], assets });
          expectGithubSafeSvg(svg, { maxBytes: BUDGET });
        }
      }
    },
    120_000,
  );

  it("is a 4:3 card", async () => {
    const svg = await renderFrame(input(0), ctx());
    expect(svg).toContain(`viewBox="0 0 640 480"`);
  });

  it("is deterministic", async () => {
    const a = await renderFrame(input(2), ctx());
    const b = await renderFrame(input(2), ctx());
    expect(a).toBe(b);
  });

  it("renders dark and light from the same structure", async () => {
    const dark = await renderFrame(input(1), ctx(themes.dark));
    const light = await renderFrame(input(1), ctx(themes.light));
    expect(dark).not.toBe(light);
    const strip = (svg: string) => svg.replace(/#[0-9a-fA-F]{6}\b/g, "#");
    expect(strip(dark)).toBe(strip(light));
  });

  it("takes every color from the theme", async () => {
    for (const name of themeNames) {
      const svg = await renderFrame(input(3), ctx(themes[name]));
      const allowed = themeColors(themes[name]);
      const used = [...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase());
      expect(used.length).toBeGreaterThan(0);
      for (const color of used) expect(allowed, `${color} is not a ${name} theme token`).toContain(color);
      // Paint values are theme hex colors, fragment references or none: no named colors or rgb().
      for (const m of svg.matchAll(/(?:fill|stroke|stop-color|color)\s*[=:]\s*"?([^";}\s]+)/g)) {
        expect(m[1]).toMatch(/^(#[0-9a-fA-F]{6}|none|url\(#\w+\))$/);
      }
    }
  });

  it("prints the project's code, title, summary, stack, status and kind", async () => {
    const project = featured[0]!;
    const svg = await renderFrame(input(0), ctx());
    const allText = ["m", "mb", "d", "db"].flatMap((cls) => textsWithClass(svg, cls)).join("\n");
    expect(allText).toContain(project.code);
    expect(textsWithClass(svg, "db").join("")).toBe(project.title);
    expect(textsWithClass(svg, "d").join("")).toBe(project.summary);
    for (const item of project.stack) expect(textsWithClass(svg, "chip")).toContain(item);
    expect(textsWithClass(svg, "status")).toEqual([project.status]);
    expect(textsWithClass(svg, "kind")).toEqual([project.kind]);
  });

  it("labels the detection box with the kind only, without confidence numbers", async () => {
    for (const [index] of featured.entries()) {
      const svg = await renderFrame(input(index), ctx());
      // The status chip may carry a version (v1.0.0); everything else must not look like a score.
      const status = new Set(textsWithClass(svg, "status"));
      const allText = ["m", "mb", "d", "db"]
        .flatMap((cls) => textsWithClass(svg, cls))
        .filter((t) => !status.has(t))
        .join(" ");
      expect(allText).not.toMatch(/\b0\.\d+\b/);
      expect(allText).not.toMatch(/\d+(\.\d+)?%/);
    }
  });

  it("prints film edge markings with the frame number", async () => {
    const svg = await renderFrame(input(2), ctx());
    const edge = textsWithClass(svg, "edge").join(" ");
    expect(edge).toContain("KAN-NINOMIYA");
    expect(edge).toContain("03A");
    expect(edge).toContain(`03/${String(featured.length).padStart(2, "0")}`);
  });

  it("draws sprocket holes on both edges of the film", async () => {
    const svg = await renderFrame(input(0), ctx());
    const holes = [...svg.matchAll(/<rect\b[^>]*class="hole"[^>]*>/g)].map((m) => Number(/\sy="([\d.]+)"/.exec(m[0])?.[1]));
    expect(holes.filter((y) => y < 240).length).toBeGreaterThanOrEqual(8);
    expect(holes.filter((y) => y > 240).length).toBeGreaterThanOrEqual(8);
  });

  it("subsets each font role to exactly the glyphs it renders", async () => {
    for (const [index] of featured.entries()) {
      const c = ctx();
      const svg = await renderFrame(input(index), c);
      for (const [role, cls] of Object.entries(ROLE_CLASS) as [FontRole, string][]) {
        const rendered = glyphs(textsWithClass(svg, cls).join(""));
        const requested = glyphs(c.assets.requested.get(role) ?? "");
        expect([...requested].sort(), `${role} subset for ${featured[index]!.id}`).toEqual([...rendered].sort());
      }
    }
  });

  it("pairs each font role with its family and weight", async () => {
    const svg = await renderFrame(input(0), ctx());
    expect(svg).toContain(`.m{font-family:${fontStack.mono};font-weight:500`);
    expect(svg).toContain(`.mb{font-family:${fontStack.mono};font-weight:700`);
    expect(svg).toContain(`.d{font-family:${fontStack.display};font-weight:400`);
    expect(svg).toContain(`.db{font-family:${fontStack.display};font-weight:700`);
  });

  it("keeps a two-line title at 44 units or more, inside the exposure", async () => {
    const project: Project = { ...featured[0]!, title: "Hermes Video Understanding" };
    const svg = await renderFrame(input(0, project), ctx());
    const titles = [...svg.matchAll(/<text\b[^>]*class="db"[^>]*>/g)].map((m) => m[0]);
    expect(titles).toHaveLength(2);
    for (const t of titles) expect(Number(/font-size="([\d.]+)"/.exec(t)?.[1])).toBeGreaterThanOrEqual(44);
    const box = /<rect\b[^>]*class="det"[^>]*>/.exec(svg)?.[0] ?? "";
    const x = Number(/\sx="([\d.]+)"/.exec(box)?.[1]);
    const w = Number(/\swidth="([\d.]+)"/.exec(box)?.[1]);
    expect(x).toBeGreaterThanOrEqual(EXPOSURE.x);
    expect(x + w).toBeLessThanOrEqual(EXPOSURE.x + EXPOSURE.w);
  });

  it("wraps a long Latin title at a space", async () => {
    const project: Project = { ...featured[0]!, title: "Hermes Video Understanding" };
    const svg = await renderFrame(input(0, project), ctx());
    expect(textsWithClass(svg, "db")).toEqual(["Hermes Video", "Understanding"]);
  });

  it("animates on one shared cycle, staggered by index, and holds still for reduced motion", async () => {
    const delays: number[] = [];
    for (const index of [0, 1, 5]) {
      const svg = await renderFrame(input(index), ctx());
      const anims = [...svg.matchAll(/animation:\s*\w+\s+([\d.]+)s[^;}]*?\s(-?[\d.]+)s/g)];
      expect(anims.length).toBeGreaterThanOrEqual(2);
      expect(new Set(anims.map((m) => m[1])).size, "one shared cycle").toBe(1);
      expect(new Set(anims.map((m) => m[2])).size, "one shared delay").toBe(1);
      delays.push(Number(anims[0]![2]));
      expect(svg).toMatch(/@media \(prefers-reduced-motion: reduce\)\{[^}]*animation:none/);
    }
    expect(delays[0]).toBeLessThan(delays[1]!);
    expect(delays[1]).toBeLessThan(delays[2]!);
  });

  it("escapes XML special characters in project text", async () => {
    const project: Project = { ...featured[0]!, title: "A & B <C>", summary: `"引用" & 'それ'`, stack: ["C<T>"] };
    const svg = await renderFrame(input(0, project), ctx());
    expectGithubSafeSvg(svg, { maxBytes: BUDGET });
    expect(textsWithClass(svg, "db").join(" ")).toBe("A & B <C>");
  });

  it("keeps a long title inside the frame and above the stack chips", async () => {
    const project: Project = { ...featured[0]!, title: "とても長いプロジェクトの名前がここに入るときの折り返しテスト用タイトル" };
    const layout = layoutFrame(project);
    const bottom = layout.box.y + layout.box.h;
    expect(layout.label.y).toBeGreaterThanOrEqual(layout.status.y + layout.status.h);
    expect(layout.summary.baselines.at(-1)!).toBeLessThan(layout.chips[0]!.y);
    expect(bottom).toBeLessThan(layout.summary.baselines[0]! - layout.summary.size);
    expect(layout.box.x + layout.box.w).toBeLessThanOrEqual(EXPOSURE.x + EXPOSURE.w);
  });

  it("fits a long stack on one row, folding the rest into a +N chip", async () => {
    const project: Project = { ...featured[0]!, stack: ["TypeScript", "Cloudflare Workers", "PostgreSQL", "Playwright"] };
    const layout = layoutFrame(project);
    const last = layout.chips.at(-1)!;
    expect(last.x + last.w).toBeLessThanOrEqual(EXPOSURE.x + EXPOSURE.w - 24);
    expect(layout.chips[0]!.text).toBe("TypeScript");
    const shown = layout.chips.filter((c) => !c.text.startsWith("+")).length;
    if (shown < project.stack.length) expect(last.text).toBe(`+${project.stack.length - shown}`);
  });

  it("refuses a title that cannot fit the frame, naming the field", () => {
    const title = "とても長いプロジェクトの名前がここに入るときの折り返しテスト用タイトルとても長いプロジェクトの名前がここに入るさらに長くなった場合のテストです";
    expect(() => layoutFrame({ ...featured[0]!, title })).toThrow(/project\.title .*too long.*shorten it/);
  });

  it("refuses a project code that would shrink below the legible size, naming the field", () => {
    expect(() => layoutFrame({ ...featured[0]!, code: "A".repeat(44) })).toThrow(/project\.code .*too long.*shorten it/);
  });

  it("keeps a long project code clear of the status chip", async () => {
    const project: Project = { ...featured[0]!, code: "A VERY LONG PROJECT CODE NAME", status: "v10.20.300" };
    const layout = layoutFrame(project);
    expect(layout.code.x - layout.code.width).toBeGreaterThanOrEqual(layout.status.x + layout.status.w + 16);
  });

  it("rejects a frame index outside the roll", async () => {
    await expect(renderFrame({ project: featured[0]!, index: 6, total: 6 }, ctx())).rejects.toThrow(RangeError);
    await expect(renderFrame({ project: featured[0]!, index: -1, total: 6 }, ctx())).rejects.toThrow(RangeError);
  });
});

// Checks on the hand-edited data rather than on renderer behaviour: when one of
// these fails, edit data/profile.ts, not the renderer.
describe("data/profile.ts fits the contact sheet", () => {
  it("keeps every featured title at 44 units or more in at most two lines (readable at 270 px)", () => {
    featured.forEach((project, i) => {
      const { title } = layoutFrame(project);
      const what = `featured[${i}].title "${project.title}" sets in ${title.lines.length} line(s) at ${title.size} units`;
      expect(title.lines.length, `${what}; shorten it to fit two lines`).toBeLessThanOrEqual(2);
      expect(title.size, `${what}; shorten it to keep 44 units`).toBeGreaterThanOrEqual(44);
    });
  });
});
