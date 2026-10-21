import { describe, expect, it } from "vitest";
import { photos } from "../../data/photos";
import { profile } from "../../data/profile";
import { createFsAssetLoader } from "../../src/assets/loader";
import type { PhotoMeta, Profile } from "../../src/contract/schema";
import {
  type Box,
  CORNER_MARK,
  type HeroInput,
  layoutHero,
  MAX_PHOTO_URI_BYTES,
  MAX_PHOTOS,
  MIN_TEXT_SIZE,
  renderHero,
  SAFE_AREA,
  SEGMENT_SECONDS,
} from "../../src/render/hero";
import { type Theme, themeNames, themes } from "../../src/render/theme";
import type { FontRole, RenderContext } from "../../src/render/types";
import { type FakeAssetLoader, fakeAssets } from "../helpers/fake-assets";
import { expectGithubSafeSvg } from "../helpers/svg-assert";

const input: HeroInput = { profile, photos };
const BUDGET = 900_000;
const W = 1280;
const H = 640;

/** fakeAssets, but each photo gets its own data URI so embeds can be counted. */
function assets(): FakeAssetLoader {
  const base = fakeAssets();
  return {
    ...base,
    async photoDataUri(file: string) {
      return `data:image/jpeg;base64,${Buffer.from(file).toString("base64")}`;
    },
  };
}

const ctx = (theme: Theme = themes.dark, loader: FakeAssetLoader = assets()): RenderContext => ({ theme, assets: loader });
const render = (theme: Theme = themes.dark, data: HeroInput = input) => renderHero(data, ctx(theme));

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m);

const ROLE_CLASSES: Record<string, FontRole> = { fm: "mono", fmb: "mono-bold", fd: "display", fdb: "display-bold" };

interface TextNode {
  role: FontRole;
  text: string;
  attrs: string;
}

/** Every <text> element with the font role named by its class and its visible text. */
function texts(svg: string): TextNode[] {
  const out: TextNode[] = [];
  for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const attrs = m[1] ?? "";
    const classes = /class="([^"]*)"/.exec(attrs)?.[1]?.split(/\s+/) ?? [];
    const roleClass = classes.find((c) => c in ROLE_CLASSES);
    expect(roleClass, `<text> without a font role class: ${m[0].slice(0, 120)}`).toBeDefined();
    out.push({ role: ROLE_CLASSES[roleClass as string] as FontRole, text: decode(m[2] ?? ""), attrs });
  }
  return out;
}

const allText = (svg: string) => texts(svg).map((t) => t.text);

/** The <style> block with embedded fonts removed. */
function css(svg: string): string {
  const style = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? "";
  return style.replace(/@font-face\{[^}]*\}/g, "");
}

/** @keyframes name → list of [selector, declarations]. */
function keyframes(svg: string): Map<string, Array<[string, string]>> {
  const out = new Map<string, Array<[string, string]>>();
  for (const m of css(svg).matchAll(/@keyframes ([\w-]+)\{((?:[^{}]*\{[^{}]*\})*)\}/g)) {
    const stops = [...(m[2] ?? "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((s): [string, string] => [(s[1] ?? "").trim(), s[2] ?? ""]);
    out.set(m[1] ?? "", stops);
  }
  return out;
}

/** Every `animation:` shorthand in the stylesheet (not animation-delay etc.). */
function animations(svg: string): Array<{ name: string; decl: string }> {
  return [...css(svg).matchAll(/(?<![\w-])animation:\s*([^;}]+)/g)]
    .map((m) => ({ decl: (m[1] ?? "").trim(), name: (m[1] ?? "").trim().split(/\s+/)[0] ?? "" }))
    .filter((a) => !a.name.startsWith("none"));
}

/** Opening tag of the first element whose class list contains `cls`. */
function tagWithClass(svg: string, cls: string): string {
  const re = new RegExp(`<[a-z]+\\b[^>]*\\bclass="(?:[^"]* )?${cls}(?: [^"]*)?"[^>]*>`);
  const tag = re.exec(svg)?.[0];
  expect(tag, `element with class ${cls}`).toBeDefined();
  return tag as string;
}

const hidden = (tag: string) => /\sopacity="0"/.test(tag);

function themeColors(theme: Theme): Set<string> {
  const { name: _name, detect, levels, ...flat } = theme;
  return new Set([...Object.values(flat), ...detect, ...levels].map((c) => c.toLowerCase()));
}

const overlaps = (a: Box, b: Box, gap = 0) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
const inside = (a: Box, b: Box) => a.x0 >= b.x0 && a.y0 >= b.y0 && a.x1 <= b.x1 && a.y1 <= b.y1;

// ---------------------------------------------------------------------------

describe("renderHero: GitHub contract", () => {
  it("is a GitHub-safe 1280x640 SVG within the hero budget in both themes", async () => {
    for (const name of themeNames) {
      const svg = await render(themes[name]);
      expectGithubSafeSvg(svg, { maxBytes: BUDGET });
      expect(svg).toContain(`viewBox="0 0 1280 640"`);
    }
  });

  it("stays within budget with the real photos and font subsets", async () => {
    const loader = createFsAssetLoader(process.cwd());
    for (const name of themeNames) {
      const svg = await renderHero(input, { theme: themes[name], assets: loader });
      expectGithubSafeSvg(svg, { maxBytes: BUDGET });
    }
  }, 60_000);

  it("is deterministic", async () => {
    expect(await render()).toBe(await render());
  });

  it("renders the two themes differently, only with each theme's colors, from the same structure", async () => {
    const dark = await render(themes.dark);
    const light = await render(themes.light);
    expect(dark).not.toBe(light);
    for (const [svg, theme] of [
      [dark, themes.dark],
      [light, themes.light],
    ] as const) {
      const allowed = themeColors(theme);
      const used = svg.replace(/data:[^"')]+/g, "").match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      expect(used.length).toBeGreaterThan(0);
      for (const color of used) expect(allowed, `${color} is not a ${theme.name} theme color`).toContain(color.toLowerCase());
      expect(svg).not.toMatch(/\b(?:rgb|hsl)a?\(/);
    }
    // Same copy in the same order and the same choreography in both themes.
    expect(allText(light)).toEqual(allText(dark));
    expect([...keyframes(light).keys()]).toEqual([...keyframes(dark).keys()]);
  });

  it("embeds every photo exactly once and places it with <use>", async () => {
    const svg = await render();
    expect(svg.match(/data:image\/jpeg/g)).toHaveLength(photos.length);
    for (const photo of photos) {
      const uri = `data:image/jpeg;base64,${Buffer.from(photo.file).toString("base64")}`;
      expect(svg.split(uri)).toHaveLength(2);
      const id = new RegExp(`<image[^>]*id="([^"]+)"[^>]*href="${uri}"`).exec(svg)?.[1];
      expect(id, `photo ${photo.id} has an id`).toBeDefined();
      expect(svg).toContain(`<use href="#${id}"`);
    }
  });
});

describe("renderHero: content", () => {
  it("labels every profile detection and every photo subject", async () => {
    const shown = allText(await render());
    for (const d of profile.detections) expect(shown).toContain(`${d.label} ${d.confidence.toFixed(2)}`);
    for (const photo of photos) expect(shown).toContain(photo.subject);
  });

  it("colors the profile detections with theme.detect in order", async () => {
    const svg = await render(themes.light);
    profile.detections.forEach((d, i) => {
      const chip = new RegExp(`<rect[^>]*fill="(#[0-9a-f]{6})"[^>]*/><text[^>]*>${d.label} `).exec(svg)?.[1];
      expect(chip, `${d.label} chip`).toBe(themes.light.detect[i]);
    });
  });

  it("reads out EXIF per photo under column headers, with — for unknown values, and the Japanese caption", async () => {
    const shown = allText(await render());
    for (const header of ["FOCAL", "APERTURE", "SHUTTER", "ISO"]) expect(shown).toContain(header);
    for (const photo of photos) {
      expect(shown.some((t) => t.includes(photo.camera))).toBe(true);
      expect(shown).toContain(photo.focalLength);
      expect(shown).toContain(photo.aperture ?? "—");
      expect(shown).toContain(photo.shutter ?? "—");
      expect(shown).toContain(photo.iso === null ? "—" : String(photo.iso));
      expect(shown).toContain(photo.alt);
    }
    // A photo without exposure data reads "—" in all three exposure columns, no stray unit prefixes.
    const unknown: PhotoMeta = { ...(photos[0] as PhotoMeta), aperture: null, shutter: null, iso: null };
    const blank = allText(await render(themes.dark, { profile, photos: [unknown] }));
    expect(blank.filter((t) => t === "—")).toHaveLength(3);
    expect(blank.some((t) => /ISO —|f\/—/.test(t))).toBe(false);
  });

  it("shows a frame counter for the photo sequence", async () => {
    const shown = allText(await render());
    photos.forEach((_, i) => expect(shown).toContain(String(i + 1).padStart(2, "0")));
    expect(shown).toContain(`/${String(photos.length).padStart(2, "0")}`);
  });

  it("types the name in display-bold and shows the Japanese name, role, location and handle", async () => {
    const svg = await render();
    expect(svg).toMatch(new RegExp(`<title[^>]*>[^<]*${profile.name}`));
    const typed = texts(svg)
      .filter((t) => t.role === "display-bold")
      .map((t) => t.text)
      .join("");
    expect(typed).toBe(profile.name.toUpperCase().replace(/\s+/g, ""));
    const shown = allText(svg);
    expect(shown).toContain(profile.roleLine);
    expect(shown).toContain(profile.nameJa);
    expect(shown).toContain(profile.location);
    expect(shown).toContain(`@${profile.handle}`);
    expect(svg).toContain(`class="caret`);
  });

  it("requests exactly the glyphs it renders, per font role", async () => {
    const loader = assets();
    const svg = await renderHero(input, ctx(themes.dark, loader));
    const rendered = texts(svg);
    expect(rendered.length).toBeGreaterThan(20);
    for (const { role, text } of rendered) {
      const requested = loader.requested.get(role) ?? "";
      for (const ch of text.replace(/\s/g, "")) expect(requested, `${role} subset is missing "${ch}"`).toContain(ch);
    }
    for (const [role, requested] of loader.requested) {
      const used = rendered
        .filter((t) => t.role === role)
        .map((t) => t.text)
        .join("");
      for (const ch of requested.replace(/\s/g, "")) expect(used, `${role} requests unused "${ch}"`).toContain(ch);
    }
    const roles = new Set(rendered.map((t) => t.role));
    expect(new Set(loader.requested.keys())).toEqual(roles);
    expect(svg.match(/@font-face/g)).toHaveLength(roles.size);
  });

  it("never sets text smaller than the legibility floor", async () => {
    const svg = await render();
    const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(10);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);
    // Profile labels stay legible at 360 px: about 20% larger than the old 18-unit chips.
    expect(layoutHero(profile, photos).name.chipSize).toBeGreaterThanOrEqual(21);
  });

  it("handles a single photo", async () => {
    const svg = await render(themes.light, { profile, photos: [photos[1] as PhotoMeta] });
    expectGithubSafeSvg(svg, { maxBytes: BUDGET });
    expect(allText(svg)).toContain((photos[1] as PhotoMeta).subject);
  });
});

describe("renderHero: animation", () => {
  it("keeps every looping animation on one shared cycle of 15-21 s", async () => {
    const svg = await render();
    const cycle = SEGMENT_SECONDS * photos.length;
    expect(cycle).toBeGreaterThanOrEqual(15);
    expect(cycle).toBeLessThanOrEqual(21);
    const loops = animations(svg).filter((a) => a.decl.includes("infinite"));
    expect(loops.length).toBeGreaterThan(10);
    for (const { decl } of loops) {
      const seconds = Number(/(\d+(?:\.\d+)?)s/.exec(decl)?.[1]);
      expect(Number.isFinite(seconds), decl).toBe(true);
      expect((cycle * 1000) % Math.round(seconds * 1000), `${decl} does not divide the ${cycle}s cycle`).toBe(0);
    }
  });

  it("has no seam: every looping track ends where it starts", async () => {
    const svg = await render();
    const frames = keyframes(svg);
    for (const { name, decl } of animations(svg).filter((a) => a.decl.includes("infinite"))) {
      // Blinks and stepped counters hold their own 0% state on purpose.
      if (/step/.test(decl)) continue;
      const stops = frames.get(name);
      expect(stops, `@keyframes ${name}`).toBeDefined();
      const at = (sel: string) => stops?.find(([s]) => s.split(",").map((x) => x.trim()).includes(sel))?.[1];
      expect(at("0%"), `${name} 0%`).toBeDefined();
      expect(at("100%"), `${name} 100% must equal 0%`).toBe(at("0%"));
    }
  });

  it("never repeats a keyframe offset inside one @keyframes", async () => {
    for (const svg of [await render(), await render(themes.dark, { profile, photos: [photos[0] as PhotoMeta] })]) {
      for (const [name, stops] of keyframes(svg)) {
        const offsets = stops.flatMap(([sel]) => sel.split(",").map((s) => s.trim()));
        expect(new Set(offsets).size, `${name} has duplicate offsets: ${offsets.join(" ")}`).toBe(offsets.length);
      }
    }
  });

  it("animates only transform and opacity", async () => {
    const svg = await render();
    for (const [name, stops] of keyframes(svg)) {
      for (const [, decls] of stops) {
        for (const decl of decls.split(";").filter(Boolean)) {
          const prop = decl.split(":")[0]?.trim();
          expect(["transform", "opacity", "animation-timing-function"], `${name} animates ${prop}`).toContain(prop);
        }
      }
    }
    expect(css(svg)).not.toMatch(/mix-blend-mode/);
  });

  it("opens on photo 1 with the shutter open and locks focus within the first second", async () => {
    const svg = await render();
    const frames = keyframes(svg);
    const cycle = SEGMENT_SECONDS * photos.length;
    const animOf = (marker: string) => {
      const classes = /class="([^"]*)"/.exec(tagWithClass(svg, marker))?.[1]?.split(" ") ?? [];
      const name = classes.find((c) => frames.has(c));
      expect(name, `${marker} is animated`).toBeDefined();
      return frames.get(name as string) ?? [];
    };
    for (const curtain of ["curtain-top", "curtain-bottom"]) expect(animOf(curtain)[0]).toEqual(["0%", "transform:translateY(0px)"]);
    const lockedAt = animOf("af-lock").find(([, decl]) => decl === "opacity:1")?.[0] ?? "100%";
    expect((Number.parseFloat(lockedAt) / 100) * cycle).toBeLessThanOrEqual(1);
    // Whole-second stills (t = 3, 6, 9 ...) never catch the shutter closed.
    const top = animOf("curtain-top");
    const closed = top.filter(([, decl]) => decl !== "transform:translateY(0px)").map(([sel]) => (Number.parseFloat(sel) / 100) * cycle);
    for (const t of closed) expect(Math.abs(t - Math.round(t)), `curtain moving at ${t}s`).toBeGreaterThan(0.25);
  });

  it("switches animation off for reduced motion", async () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\{([\s\S]*?\})\}/.exec(css(await render()))?.[1] ?? "";
    expect(block).toMatch(/animation:\s*none/);
  });

  it("has a complete static (reduced-motion) frame: photo 1 with AF locked and its box, name typed, boxes shown", async () => {
    const svg = await render();
    // Photo 1 is on screen; the others wait hidden.
    expect(hidden(tagWithClass(svg, "photo-0"))).toBe(false);
    photos.slice(1).forEach((_, i) => expect(hidden(tagWithClass(svg, `photo-${i + 1}`))).toBe(true));
    // The subject box rides with its photo: same static Ken Burns transform.
    photos.forEach((_, k) => {
      const moves = [...svg.matchAll(new RegExp(`<g[^>]*class="kb kb-${k}\\b[^"]*"[^>]*transform="([^"]+)"`, "g"))].map((m) => m[1]);
      expect(moves.length, `photo ${k} and its detections share a Ken Burns group`).toBeGreaterThanOrEqual(2);
      expect(new Set(moves).size).toBe(1);
    });
    expect(hidden(tagWithClass(svg, "subject-0"))).toBe(false);
    photos.slice(1).forEach((_, i) => expect(hidden(tagWithClass(svg, `subject-${i + 1}`))).toBe(true));
    // AF locked, not hunting; transient effects off; shutter curtains open.
    expect(hidden(tagWithClass(svg, "af-lock"))).toBe(false);
    expect(hidden(tagWithClass(svg, "af-hunt"))).toBe(true);
    expect(hidden(tagWithClass(svg, "flash"))).toBe(true);
    photos.forEach((_, k) => expect(hidden(tagWithClass(svg, `scan-${k}`))).toBe(true));
    for (const curtain of ["curtain-top", "curtain-bottom"]) expect(tagWithClass(svg, curtain)).not.toMatch(/\stransform=/);
    // Photo 1's readout and counter; the first progress segment filled.
    expect(hidden(tagWithClass(svg, "counter-0"))).toBe(false);
    photos.slice(1).forEach((_, i) => expect(hidden(tagWithClass(svg, `counter-${i + 1}`))).toBe(true));
    expect(tagWithClass(svg, "progress-0")).not.toMatch(/\stransform=/);
    photos.slice(1).forEach((_, i) => expect(tagWithClass(svg, `progress-${i + 1}`)).toMatch(/\stransform="scale\(0 1\)"/));
    for (const t of texts(svg).filter((x) => x.attrs.includes("exif-0"))) expect(t.attrs).not.toMatch(/\sopacity="0"/);
    const later = texts(svg).filter((x) => /exif-[1-9]/.test(x.attrs));
    expect(later.length).toBeGreaterThan(0);
    for (const t of later) expect(t.attrs, t.text).toMatch(/\sopacity="0"/);
    // Name fully typed and every profile box visible.
    for (const t of texts(svg).filter((x) => x.role === "display-bold")) expect(t.attrs).not.toMatch(/opacity/);
    for (const m of svg.matchAll(/<g[^>]*class="pd pd\d[^"]*"[^>]*>/g)) expect(hidden(m[0])).toBe(false);
  });
});

describe("layoutHero", () => {
  const layout = layoutHero(profile, photos);

  it("uses the hand-placed framing for every photo in data/photos.ts (and covers the frame)", () => {
    layout.framings.forEach((f, k) => {
      const photo = photos[k] as PhotoMeta;
      expect(f.source, `${photo.id} fell back to the automatic framing`).toBe("hand");
      expect(f.ox).toBeLessThanOrEqual(0);
      expect(f.oy).toBeLessThanOrEqual(0);
      expect(f.ox + photo.width * f.scale).toBeGreaterThanOrEqual(W);
      expect(f.oy + photo.height * f.scale).toBeGreaterThanOrEqual(H);
    });
    const unknown = { ...(photos[1] as PhotoMeta), id: "somewhere-new" };
    expect(layoutHero(profile, [unknown]).framings[0]?.source).toBe("auto");
  });

  it("keeps the caption zones apart and inside the canvas", () => {
    const [name, exif] = layout.zones as [Box, Box];
    expect(name.x1).toBeLessThanOrEqual(exif.x0);
    expect(overlaps(name, exif)).toBe(false);
    for (const z of layout.zones) expect(inside(z, { x0: 0, y0: 0, x1: W, y1: H })).toBe(true);
    for (const line of layout.name.lines) expect(line.x + line.width).toBeLessThanOrEqual(name.x1);
    for (const line of layout.exif.lines) expect(line.x).toBeGreaterThanOrEqual(exif.x0);
  });

  it("puts every subject box fully inside the open photo area while it is shown", () => {
    expect(layout.subjects).toHaveLength(photos.length);
    layout.subjects.forEach((s, k) => {
      for (const [what, box] of [
        ["box when shown", s.shown],
        ["box settled", s.settled],
        ["label when shown", s.labelShown],
        ["label settled", s.labelSettled],
      ] as const) {
        expect(inside(box, SAFE_AREA), `${photos[k]?.id} ${what} inside the safe area`).toBe(true);
        for (const z of layout.zones) expect(overlaps(box, z, 8), `${photos[k]?.id} ${what} clear of the captions`).toBe(false);
      }
      // A real box, not a sliver, with the AF point on it.
      expect(s.shown.x1 - s.shown.x0).toBeGreaterThan(60);
      expect(s.shown.y1 - s.shown.y0).toBeGreaterThan(80);
      const [ax, ay] = s.af;
      expect(ax > s.shown.x0 && ax < s.shown.x1 && ay > s.shown.y0 && ay < s.shown.y1, `${photos[k]?.id} AF point on the subject`).toBe(true);
    });
  });

  it("keeps the profile boxes clear of the frame corners and the caret clear of its box", () => {
    const outer = layout.name.boxes[layout.name.boxes.length - 1] as Box;
    const { inset, arm } = CORNER_MARK;
    const corner: Box = { x0: inset, y0: H - inset - arm, x1: inset + arm, y1: H - inset };
    expect(overlaps(outer, corner, 4)).toBe(false);
    expect(H - inset - outer.y1).toBeGreaterThanOrEqual(10);
    const inner = layout.name.boxes[0] as Box;
    expect(inner.x1 - layout.name.caret.x1).toBeGreaterThanOrEqual(20);
    // Labels sit side by side, each on its own box's top edge.
    layout.name.chips.forEach((chip, i) => {
      const box = layout.name.boxes[i] as Box;
      expect(chip.y + chip.h).toBeCloseTo(box.y0, 5);
      expect(chip.x).toBeGreaterThanOrEqual(box.x0);
      expect(chip.x + chip.w).toBeLessThanOrEqual(box.x1);
      const prev = layout.name.chips[i - 1];
      if (prev) expect(chip.x).toBeGreaterThanOrEqual(prev.x + prev.w);
    });
  });

  it("fits longer hand-edited copy by shrinking it, never by overlapping", () => {
    const long: Profile = {
      ...profile,
      name: "Kanichiro Ninomiya",
      roleLine: "software engineer, product builder & photographer",
      location: "Higashi-Hiroshima, Hiroshima, JP",
      handle: "kandotrun-photography",
    };
    const longPhotos = photos.map((p) => ({ ...p, alt: `${p.alt}を少し長めに説明したキャプション` }));
    const fitted = layoutHero(long, longPhotos);
    const [name, exif] = fitted.zones as [Box, Box];
    expect(name.x1).toBeLessThanOrEqual(exif.x0);
    for (const line of fitted.name.lines) expect(line.x + line.width).toBeLessThanOrEqual(name.x1);
    for (const line of fitted.exif.lines) {
      expect(line.x).toBeGreaterThanOrEqual(exif.x0);
      expect(line.size).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);
    }
    expect(fitted.name.size).toBeLessThan(layout.name.size);
    expect(fitted.name.size).toBeGreaterThanOrEqual(40);
  });

  it("refuses copy that cannot fit, naming the field", () => {
    expect(() => layoutHero({ ...profile, roleLine: "software engineer ".repeat(8) }, photos)).toThrow(/roleLine/);
  });
});

describe("renderHero: photo budget", () => {
  it(`refuses more than ${MAX_PHOTOS} photos with a clear message`, async () => {
    const many = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => ({ ...(photos[i % photos.length] as PhotoMeta), id: `p${i}` }));
    await expect(render(themes.dark, { profile, photos: many })).rejects.toThrow(/at most 4 photos/);
  });

  it("refuses a photo too large for the hero budget", async () => {
    const loader = assets();
    loader.photoDataUri = async () => `data:image/jpeg;base64,${"A".repeat(MAX_PHOTO_URI_BYTES)}`;
    await expect(renderHero(input, ctx(themes.dark, loader))).rejects.toThrow(/architecture.*KB/);
  });
});
