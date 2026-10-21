// HISTOGRAM panel: the language mix drawn like a camera's RGB histogram (left)
// next to a camera-top LCD with an exposure meter for the activity totals (right).
//
// Pure: (snapshot, { theme, assets }) → SVG string. All motion is CSS; the base
// styles are the final frame, so reduced motion shows the finished readout.
import type { GitHubSnapshot, LanguageStat } from "../contract/schema";
import { el, esc, svgDoc } from "./svg";
import { groupThousands as group } from "./text";
import { fontStack, type Theme } from "./theme";
import type { RenderContext } from "./types";

// ---------------------------------------------------------------------------
// Data shaping (pure, unit-tested)
// ---------------------------------------------------------------------------

export const MAX_LANGUAGES = 6;

export interface MixEntry {
  name: string;
  color: string;
  bytes: number;
  /** Fraction of all bytes, 0..1. */
  share: number;
  /** True for the folded "Other" bucket. */
  other: boolean;
}

/** Top languages by bytes; everything after the sixth folds into "Other" (unless only one is left). */
export function languageMix(languages: readonly LanguageStat[], max = MAX_LANGUAGES): MixEntry[] {
  const sorted = languages
    .filter((l) => l.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const total = sorted.reduce((sum, l) => sum + l.bytes, 0);
  if (total === 0) return [];
  const keep = sorted.length <= max + 1 ? sorted : sorted.slice(0, max);
  const entries: MixEntry[] = keep.map((l) => ({ ...l, share: l.bytes / total, other: false }));
  const rest = sorted.slice(keep.length);
  if (rest.length > 0) {
    const bytes = rest.reduce((sum, l) => sum + l.bytes, 0);
    entries.push({ name: "Other", color: "#8b949e", bytes, share: bytes / total, other: true });
  }
  return entries;
}

export function formatShare(share: number): string {
  if (share >= 0.9995) return "100%";
  const pct = Math.round(share * 1000) / 10;
  if (share > 0 && pct < 0.1) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}

export const EV_RANGE = 3;
const EV_WINDOW_DAYS = 28;

/**
 * The meter reading: log2 of the daily pace over the last 28 days relative to
 * the daily pace over the whole calendar, clamped to ±3 EV.
 */
export function exposureValue(contributions: GitHubSnapshot["contributions"]): number {
  const counts = contributions.weeks.flatMap((week) => week.days.map((day) => day.count));
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;
  const recentDays = counts.slice(-EV_WINDOW_DAYS);
  const recent = recentDays.reduce((sum, n) => sum + n, 0) / recentDays.length;
  if (recent === 0) return -EV_RANGE;
  return clamp(Math.log2(recent / (total / counts.length)), -EV_RANGE, EV_RANGE);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// ---------------------------------------------------------------------------
// Color: language colors re-toned in OKLCH so they sit well on either theme
// ---------------------------------------------------------------------------

interface Lch {
  L: number;
  C: number;
  h: number;
}

const TONE: Record<Theme["name"], { L: [number, number]; C: [number, number] }> = {
  dark: { L: [0.7, 0.82], C: [0.11, 0.18] },
  light: { L: [0.5, 0.62], C: [0.11, 0.18] },
};
const MIN_HUE_GAP = 28;

/** Keeps each language's hue, normalizes lightness/chroma per theme and pushes clashing hues apart. */
export function harmonizeColors(colors: readonly string[], theme: Theme): string[] {
  const tone = TONE[theme.name];
  const placed: number[] = [];
  return colors.map((hex) => {
    const c = hexToOklch(hex);
    const L = clamp(c.L, tone.L[0], tone.L[1]);
    if (c.C < 0.03) return oklchToHex({ L, C: c.C, h: c.h });
    let h = c.h;
    for (let pass = 0; pass < 6; pass++) {
      const clash = placed.find((p) => Math.abs(hueDelta(h, p)) < MIN_HUE_GAP);
      if (clash === undefined) break;
      const d = hueDelta(h, clash);
      h = (clash + (d > 0 ? 1 : -1) * MIN_HUE_GAP + 360) % 360;
    }
    placed.push(h);
    return oklchToHex({ L, C: clamp(c.C, tone.C[0], tone.C[1]), h });
  });
}

function hueDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklch(hex: string): Lch {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255)) as [
    number,
    number,
    number,
  ];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToLinear({ L, C, h }: Lch): [number, number, number] {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → sRGB hex, reducing chroma until the color fits the sRGB gamut. */
function oklchToHex(color: Lch): string {
  const inGamut = (c: number) => c >= -1e-4 && c <= 1 + 1e-4;
  let lo = 0;
  let hi = color.C;
  let rgb = oklchToLinear(color);
  if (!rgb.every(inGamut)) {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (oklchToLinear({ ...color, C: mid }).every(inGamut)) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear({ ...color, C: lo });
  }
  return `#${rgb
    .map((c) => Math.round(clamp(fromLinear(clamp(c, 0, 1)), 0, 1) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

// ---------------------------------------------------------------------------
// Deterministic noise for organic hump shapes (seeded by language name)
// ---------------------------------------------------------------------------

function seeded(name: string): () => number {
  let h = 0x811c9dc5;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const W = 1280;
const H = 460;
const PAD = 40;

const PANEL = { y: 66, h: 370, r: 18 };
const LEFT = { x: PAD, w: 732 };
const RIGHT = { x: 796, w: W - PAD - 796 };

const PLOT = { x0: 68, x1: 500, top: 112, base: 378 };
const STRIP = { y: 394, h: 8 };
const LEGEND = { x0: 532, x1: 748, y: 130, pitch: 36 };

/** Hump centers on the tonal axis by rank, chosen so neighbours by size do not stack up. */
const SLOTS = [0.38, 0.73, 0.15, 0.89, 0.56, 0.04, 0.97] as const;
const SAMPLES = 120;
/** Width of the fade at each plot edge (fraction of the axis), so side lobes never run into the clip. */
const EDGE_FADE = 0.06;

const smoothstep = (u: number) => u * u * (3 - 2 * u);
/** 0 at the plot edges, 1 inside, with a smooth ramp over EDGE_FADE. */
const edgeWindow = (t: number) => smoothstep(Math.min(1, t / EDGE_FADE)) * smoothstep(Math.min(1, (1 - t) / EDGE_FADE));

// LCD (right panel)
const LCD = {
  x0: RIGHT.x + 26,
  x1: RIGHT.x + RIGHT.w - 26,
  labelY: 102,
  bigY: 116,
  bigH: 76,
  meterLabelY: 228,
  meterY: 248,
  gridLabelY: 312,
  gridY: 322,
  gridH: 32,
  rowPitch: 64,
};

// ---------------------------------------------------------------------------
// Seven-segment digits (drawn as geometry so the LCD needs no font)
// ---------------------------------------------------------------------------

const DW = 40;
const DH = 72;
const DT = 8.5;
const DG = 1.6;
const DIGIT_PITCH = DW + 12;
const GROUP_GAP = 14;
const SKEW = -7;

const SEGMENT_MAP = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];

function segmentPoints(horizontal: boolean, cx: number, cy: number, len: number): string {
  const t = DT / 2;
  const pts: Array<[number, number]> = horizontal
    ? [
        [cx - len / 2, cy],
        [cx - len / 2 + t, cy - t],
        [cx + len / 2 - t, cy - t],
        [cx + len / 2, cy],
        [cx + len / 2 - t, cy + t],
        [cx - len / 2 + t, cy + t],
      ]
    : [
        [cx, cy - len / 2],
        [cx + t, cy - len / 2 + t],
        [cx + t, cy + len / 2 - t],
        [cx, cy + len / 2],
        [cx - t, cy + len / 2 - t],
        [cx - t, cy - len / 2 + t],
      ];
  return pts.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

function segmentDefs(): string {
  const t = DT / 2;
  const hLen = DW - DT - 2 * DG;
  const vLen = DH / 2 - t - 2 * DG;
  const upper = t + DG + vLen / 2;
  const lower = DH / 2 + DG + vLen / 2;
  const segs: Record<string, string> = {
    a: segmentPoints(true, DW / 2, t, hLen),
    b: segmentPoints(false, DW - t, upper, vLen),
    c: segmentPoints(false, DW - t, lower, vLen),
    d: segmentPoints(true, DW / 2, DH - t, hLen),
    e: segmentPoints(false, t, lower, vLen),
    f: segmentPoints(false, t, upper, vLen),
    g: segmentPoints(true, DW / 2, DH / 2, hLen),
  };
  const polys = Object.entries(segs)
    .map(([id, points]) => el("polygon", { id: `s${id}`, points }))
    .join("");
  const digits = SEGMENT_MAP.map((on, d) =>
    el("g", { id: `d${d}` }, [...on].map((s) => el("use", { href: `#s${s}` })).join("")),
  ).join("");
  return polys + digits;
}

interface DigitCell {
  /** null for an unused leading position (only the ghost "8" shows). */
  digit: number | null;
  transform: string;
}

interface SegField {
  cells: DigitCell[];
}

/** Lays out `value` right-aligned in a fixed LCD field of at least `minDigits` positions. */
function segField(value: number, x: number, y: number, height: number, minDigits: number, maxWidth: number): SegField {
  const text = String(value);
  const count = Math.max(minDigits, text.length);
  const groups = Math.ceil(count / 3);
  const natural = count * DIGIT_PITCH - (DIGIT_PITCH - DW) + (groups - 1) * GROUP_GAP;
  const scale = Math.min(height / DH, maxWidth / natural);
  const cells: DigitCell[] = [];
  for (let i = 0; i < count; i++) {
    const textIndex = i - (count - text.length);
    const group = Math.floor((count - 1 - i) / 3);
    const ux = i * DIGIT_PITCH + (groups - 1 - group) * GROUP_GAP;
    cells.push({
      digit: textIndex >= 0 ? Number(text[textIndex]) : null,
      transform: `translate(${round(x + ux * scale + 4 * scale)} ${round(y)}) skewX(${SKEW}) scale(${round(scale, 4)})`,
    });
  }
  return { cells };
}

// ---------------------------------------------------------------------------
// Histogram geometry
// ---------------------------------------------------------------------------

/** One translucent hump per language; height and width grow with its share (sub-linearly, so small ones stay visible). */
function humpPath(entry: MixEntry, rank: number, maxShare: number): string {
  const rand = seeded(entry.name);
  const rel = entry.share / maxShare;
  const amp = Math.max(0.1, rel ** 0.33);
  const sigma = 0.032 + 0.12 * Math.sqrt(rel);
  const center = clamp(SLOTS[rank] ?? 0.5, 1.7 * sigma, 1 - 1.7 * sigma);
  const lobes = [
    { dx: 0, a: 1, s: sigma },
    { dx: (0.7 + rand() * 0.6) * sigma, a: 0.3 + rand() * 0.35, s: sigma * (0.45 + rand() * 0.3) },
    { dx: -(0.8 + rand() * 0.6) * sigma, a: 0.22 + rand() * 0.3, s: sigma * (0.4 + rand() * 0.3) },
  ];
  const f1 = 15 + rand() * 8;
  const f2 = 33 + rand() * 14;
  const p1 = rand();
  const p2 = rand();

  const raw: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    let v = 0;
    for (const lobe of lobes) v += lobe.a * Math.exp(-((t - center - lobe.dx) ** 2) / (2 * lobe.s ** 2));
    // A little deterministic grain so the edge reads as binned sensor data, not a smooth chart.
    const grain =
      1 +
      0.06 * Math.sin(2 * Math.PI * (f1 * t + p1)) +
      0.035 * Math.sin(2 * Math.PI * (f2 * t + p2)) +
      (rand() - 0.5) * 0.045;
    raw.push(v * grain * edgeWindow(t));
  }
  const peak = Math.max(...raw);
  const usable = PLOT.base - PLOT.top;
  const xs = (i: number) => PLOT.x0 + ((PLOT.x1 - PLOT.x0) * i) / SAMPLES;
  const ys = raw.map((v) => PLOT.base - (v / peak) * amp * usable);

  const visible = (y: number) => PLOT.base - y > 0.6;
  const first = Math.max(0, ys.findIndex(visible) - 1);
  const last = Math.min(SAMPLES, ys.length - [...ys].reverse().findIndex(visible));
  const points: string[] = [`${round(xs(first), 1)},${PLOT.base}`];
  for (let i = first; i <= last; i++) points.push(`${round(xs(i), 1)},${round(ys[i] ?? PLOT.base, 1)}`);
  points.push(`${round(xs(last), 1)},${PLOT.base}`);
  return `M${points.join(" ")}Z`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

interface TextSpec {
  x: number;
  y: number;
  text: string;
  size: number;
  fill: string;
  bold?: boolean;
  anchor?: "start" | "middle" | "end";
  spacing?: number;
  cls?: string;
}

/** A rendered section: markup plus what the shared stylesheet needs to know about it. */
interface Section {
  defs: string;
  body: string;
  texts: TextSpec[];
}

/** Animation timing (seconds). Intro is one-shot; idle loops share one cycle. */
const CYCLE = 4;
const IDLE_AT = 3;

export async function renderStats(github: GitHubSnapshot, ctx: RenderContext): Promise<string> {
  const { theme } = ctx;
  const mix = languageMix(github.languages);
  const ev = exposureValue(github.contributions);
  const evText = `${ev < 0 ? "-" : "+"}${Math.abs(ev).toFixed(1)} EV`;

  const header: TextSpec[] = [
    // The README heading above the panel already says HISTOGRAM.
    { x: PAD, y: 46, text: "LANGUAGE MIX BY BYTES", size: 17, fill: theme.muted, spacing: 1.5 },
    {
      x: W - PAD,
      y: 46,
      text: `UPDATED ${github.fetchedAt.slice(0, 10)}`,
      size: 16,
      fill: theme.muted,
      anchor: "end",
      spacing: 1.5,
    },
  ];
  const histogram = histogramSection(github, mix, theme);
  const lcd = lcdSection(github.totals, ev, evText, theme);

  const texts = [...header, ...histogram.texts, ...lcd.texts];
  const fontCss =
    (await ctx.assets.fontCss("mono", texts.filter((t) => !t.bold).map((t) => t.text).join(""))) +
    (await ctx.assets.fontCss("mono-bold", texts.filter((t) => t.bold).map((t) => t.text).join("")));

  return svgDoc({
    width: W,
    height: H,
    title: `@${github.login} の言語ヒストグラムとアクティビティ`,
    desc: describe(github, mix, evText),
    style: fontCss + stylesheet(theme, mix.length, lcd.fieldCount, lcd.sweep),
    defs: histogram.defs + lcd.defs,
    body: el("rect", { width: W, height: H, fill: theme.bg }) + histogram.body + lcd.body + texts.map(textEl).join(""),
  });
}

function histogramSection(github: GitHubSnapshot, mix: MixEntry[], theme: Theme): Section {
  const texts: TextSpec[] = [];
  const dark = theme.name === "dark";
  const colors = harmonizeColors(
    mix.filter((m) => !m.other).map((m) => m.color),
    theme,
  );
  const tones = mix.map((m, i) => (m.other ? theme.muted : (colors[i] ?? theme.muted)));
  const maxShare = mix[0]?.share ?? 1;
  const plotW = PLOT.x1 - PLOT.x0;
  const screen = { x: PLOT.x0, y: PLOT.top - 20, width: plotW, height: PLOT.base - PLOT.top + 20 };

  const defs = [
    el("clipPath", { id: "pc" }, el("rect", screen)),
    ...mix.map((m, i) =>
      el("path", { id: `h${i}`, d: humpPath(m, i, maxShare) }) +
      el(
        "linearGradient",
        { id: `g${i}`, x1: 0, y1: 0, x2: 0, y2: 1 },
        el("stop", { offset: 0, "stop-color": tones[i], "stop-opacity": dark ? 0.92 : 0.62 }) +
          el("stop", { offset: 1, "stop-color": tones[i], "stop-opacity": dark ? 0.1 : 0.06 }),
      ),
    ),
  ].join("");

  const dashed = { stroke: theme.line, "stroke-dasharray": "2 6" };
  const midY = round((PLOT.top + PLOT.base) / 2, 1);
  const grid =
    [0.2, 0.4, 0.6, 0.8]
      .map((f) => {
        const x = round(PLOT.x0 + plotW * f, 1);
        return el("line", { x1: x, y1: PLOT.top - 12, x2: x, y2: PLOT.base, ...dashed });
      })
      .join("") + el("line", { x1: PLOT.x0, y1: midY, x2: PLOT.x1, y2: midY, ...dashed });

  // Fill, soft glow and crisp edge per hump; blended so overlaps mix like RGB channels.
  const humps = mix
    .map((_, i) => {
      const ref = { href: `#h${i}`, "stroke-linejoin": "round" };
      return el(
        "g",
        { class: `hu r${i}` },
        el(
          "g",
          { class: `hj j${i}` },
          el("use", { href: `#h${i}`, fill: `url(#g${i})`, class: "bl" }) +
            el("use", { ...ref, fill: "none", stroke: tones[i], "stroke-width": 7, "stroke-opacity": dark ? 0.22 : 0.12, class: "bl" }) +
            el("use", { ...ref, fill: "none", stroke: tones[i], "stroke-width": 2.2 }),
        ),
      );
    })
    .join("");

  // Exact shares as a tonal strip under the histogram.
  let sx = PLOT.x0;
  const strip = mix
    .map((m, i) => {
      const w = plotW * m.share;
      const rect = el("rect", { x: round(sx), y: STRIP.y, width: round(Math.max(w, 0.8)), height: STRIP.h, fill: tones[i] });
      sx += w;
      return rect;
    })
    .join("");

  if (mix.length === 0) {
    texts.push({ x: PLOT.x0 + plotW / 2, y: midY + 8, text: "NO DATA", size: 22, fill: theme.muted, anchor: "middle", spacing: 3 });
  }

  const legend = mix
    .map((m, i) => {
      const y = LEGEND.y + i * LEGEND.pitch;
      const cls = `lg l${i}`;
      texts.push({ x: LEGEND.x0 + 22, y, text: truncate(m.name, 10), size: 18, fill: theme.text, cls });
      texts.push({ x: LEGEND.x1, y, text: formatShare(m.share), size: 18, fill: m.other ? theme.muted : theme.text, anchor: "end", cls });
      return el("circle", { cx: LEGEND.x0 + 6, cy: y - 6, r: 6, fill: tones[i], class: cls });
    })
    .join("");
  if (mix.length > 0) {
    const langCount = github.languages.filter((l) => l.bytes > 0).length;
    const footY = STRIP.y + STRIP.h;
    texts.push({ x: LEGEND.x0, y: footY, text: `${langCount} LANGS`, size: 14, fill: theme.muted, spacing: 1 });
    texts.push({
      x: LEGEND.x1,
      y: footY,
      text: formatBytes(mix.reduce((sum, m) => sum + m.bytes, 0)),
      size: 14,
      fill: theme.muted,
      anchor: "end",
      spacing: 1,
    });
  }

  const body = [
    el("rect", { x: LEFT.x, y: PANEL.y, width: LEFT.w, height: PANEL.h, rx: PANEL.r, fill: theme.surface, stroke: theme.line }),
    el("rect", { ...screen, rx: 4, fill: theme.bg }),
    grid,
    cornerBrackets(PLOT.x0 - 12, PLOT.top - 24, PLOT.x1 + 12, STRIP.y + STRIP.h + 12, 14, theme.muted),
    el("g", { class: "iso", "clip-path": "url(#pc)" }, humps),
    el("line", { x1: PLOT.x0, y1: PLOT.base, x2: PLOT.x1, y2: PLOT.base, stroke: theme.muted, "stroke-width": 1.5 }),
    el("g", { class: "st" }, strip),
    legend,
  ].join("");
  return { defs, body, texts };
}

interface LcdSection extends Section {
  fieldCount: number;
  /** Needle offsets (px) relative to its resting place: start of the sweep and the overshoot. */
  sweep: { from: number; overshoot: number };
}

function lcdSection(totals: GitHubSnapshot["totals"], ev: number, evText: string, theme: Theme): LcdSection {
  const texts: TextSpec[] = [
    { x: LCD.x0, y: LCD.labelY, text: "CONTRIBUTIONS", size: 15, fill: theme.muted, spacing: 1.5 },
    { x: LCD.x1, y: LCD.labelY, text: "LAST 365 DAYS", size: 15, fill: theme.muted, anchor: "end", spacing: 1.5 },
  ];

  // digits
  const fields: SegField[] = [segField(totals.contributions, LCD.x0, LCD.bigY, LCD.bigH, 5, LCD.x1 - LCD.x0)];
  const cellW = (LCD.x1 - LCD.x0) / 3;
  const small: Array<[string, number]> = [
    ["COMMITS", totals.commits],
    ["PRS", totals.pullRequests],
    ["REVIEWS", totals.reviews],
    ["REPOS", totals.publicRepos],
    ["STARS", totals.stars],
    ["FOLLOWERS", totals.followers],
  ];
  small.forEach(([label, value], i) => {
    const x = LCD.x0 + (i % 3) * cellW;
    const dy = Math.floor(i / 3) * LCD.rowPitch;
    texts.push({ x, y: LCD.gridLabelY + dy, text: label, size: 13, fill: theme.muted, spacing: 1.5 });
    fields.push(segField(value, x, LCD.gridY + dy, LCD.gridH, 4, cellW - 18));
  });
  const ghost = fields.flatMap((f) => f.cells.map((c) => el("use", { href: "#d8", transform: c.transform }))).join("");
  const lit = fields
    .flatMap((f, n) =>
      f.cells
        .filter((c) => c.digit !== null)
        .map((c) => el("use", { href: `#d${c.digit}`, transform: c.transform, class: `n${n}` })),
    )
    .join("");

  // exposure meter
  const mx0 = LCD.x0 + 10;
  const mx1 = LCD.x1 - 10;
  const evX = (v: number) => mx0 + ((v + EV_RANGE) / (2 * EV_RANGE)) * (mx1 - mx0);
  texts.push({ x: LCD.x0, y: LCD.meterLabelY, text: "28D PACE VS YEAR AVG", size: 13, fill: theme.muted, spacing: 1.5 });
  texts.push({ x: LCD.x1, y: LCD.meterLabelY + 1, text: evText, size: 18, fill: theme.text, bold: true, anchor: "end", spacing: 1 });
  const ticks: string[] = [el("line", { x1: mx0, y1: LCD.meterY, x2: mx1, y2: LCD.meterY, stroke: theme.muted, "stroke-width": 1.2 })];
  for (let k = -EV_RANGE * 3; k <= EV_RANGE * 3; k++) {
    const major = k % 3 === 0;
    const x = round(evX(k / 3), 1);
    const color = k === 0 ? theme.lock : major ? theme.text : theme.muted;
    ticks.push(el("line", { x1: x, y1: LCD.meterY, x2: x, y2: LCD.meterY + (major ? 12 : 6), stroke: color, "stroke-width": major ? 2 : 1.2 }));
    if (major) {
      const v = k / 3;
      const label = v === 0 ? "0" : `${v > 0 ? "+" : "-"}${Math.abs(v)}`;
      texts.push({ x, y: LCD.meterY + 30, text: label, size: 13, fill: v === 0 ? theme.lock : theme.muted, anchor: "middle" });
    }
  }
  const nx = round(evX(ev), 1);
  const needle = el(
    "g",
    { class: "nd" },
    el(
      "g",
      { class: "ni" },
      el("path", { d: `M${nx - 7} ${LCD.meterY - 14}h14l-7 9z`, fill: theme.accent }) +
        el("rect", { x: nx - 1.25, y: LCD.meterY - 6, width: 2.5, height: 20, fill: theme.accent }),
    ),
  );

  const body = [
    el("rect", { x: RIGHT.x, y: PANEL.y, width: RIGHT.w, height: PANEL.h, rx: PANEL.r, fill: theme.surface, stroke: theme.line }),
    el("g", { fill: theme.line, opacity: 0.55 }, ghost),
    el("g", { class: "pw", fill: theme.text }, ghost),
    el("g", { class: "lit", fill: theme.text }, lit),
    ticks.join(""),
    needle,
  ].join("");

  return {
    defs: segmentDefs(),
    body,
    texts,
    fieldCount: fields.length,
    sweep: {
      from: round(evX(-EV_RANGE) - nx, 1),
      overshoot: round(Math.min(evX(EV_RANGE), nx + 34) - nx, 1),
    },
  };
}

/**
 * One stylesheet for the whole panel. Base styles are the final frame; keyframes
 * only describe where things come from, so reduced motion simply drops them.
 */
function stylesheet(theme: Theme, humpCount: number, fieldCount: number, sweep: LcdSection["sweep"]): string {
  const each = (n: number, rule: (i: number) => string) => Array.from({ length: n }, (_, i) => rule(i)).join("");
  return [
    `.m{font-family:${fontStack.mono};font-weight:500}.mb{font-family:${fontStack.mono};font-weight:700}`,
    `.bl{mix-blend-mode:${theme.name === "dark" ? "screen" : "multiply"}}.iso{isolation:isolate}`,
    // histogram: humps rise in rank order, then breathe like a live-view histogram
    `.hu,.hj{transform-box:fill-box;transform-origin:50% 100%}`,
    `.hu{animation:rise 1.3s cubic-bezier(.16,1,.3,1) both}`,
    `.hj{animation:live ${CYCLE}s ease-in-out ${IDLE_AT}s infinite both}`,
    each(humpCount, (i) => `.r${i}{animation-delay:${round(0.25 + i * 0.1)}s}.j${i}{animation-delay:${round(IDLE_AT - (i * CYCLE) / 7)}s}`),
    `.st{transform-box:fill-box;transform-origin:0 50%;animation:wipe 1.2s cubic-bezier(.65,0,.35,1) .3s both}`,
    `.lg{animation:fade .5s ease-out both}`,
    each(humpCount, (i) => `.l${i}{animation-delay:${round(0.4 + i * 0.1)}s}`),
    // LCD: segment test on power-up, then the readings, then the needle sweeps and settles
    `.pw{opacity:0;animation:pwr .7s linear .1s both}`,
    `.lit use{animation:fade .12s steps(1,end) both}`,
    each(fieldCount, (n) => `.n${n}{animation-delay:${round(0.8 + n * 0.07)}s}`),
    `.nd{animation:sweep 1.9s cubic-bezier(.3,0,.2,1) .6s both}`,
    `.ni{animation:tremble ${CYCLE}s ease-in-out ${IDLE_AT}s infinite}`,
    `@keyframes rise{from{transform:scaleY(0)}}`,
    `@keyframes live{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.978)}}`,
    `@keyframes wipe{from{transform:scaleX(0)}}`,
    `@keyframes fade{from{opacity:0}}`,
    `@keyframes pwr{0%{opacity:0}10%,80%{opacity:1}100%{opacity:0}}`,
    `@keyframes sweep{0%{transform:translateX(${sweep.from}px)}55%{transform:translateX(${sweep.overshoot}px)}78%{transform:translateX(${round(-sweep.overshoot * 0.25, 1)}px)}100%{transform:translateX(0)}}`,
    `@keyframes tremble{0%,100%{transform:translateX(0)}35%{transform:translateX(1.2px)}65%{transform:translateX(-.9px)}}`,
    `@media (prefers-reduced-motion: reduce){*{animation:none!important}}`,
  ].join("");
}

function textEl(t: TextSpec): string {
  return el(
    "text",
    {
      x: round(t.x, 1),
      y: round(t.y, 1),
      class: [t.bold ? "mb" : "m", t.cls].filter(Boolean).join(" "),
      "font-size": t.size,
      fill: t.fill,
      "text-anchor": t.anchor && t.anchor !== "start" ? t.anchor : undefined,
      "letter-spacing": t.spacing,
    },
    esc(t.text),
  );
}

function cornerBrackets(x0: number, y0: number, x1: number, y1: number, len: number, color: string): string {
  const d = [
    `M${x0} ${y0 + len}V${y0}H${x0 + len}`,
    `M${x1 - len} ${y0}H${x1}V${y0 + len}`,
    `M${x1} ${y1 - len}V${y1}H${x1 - len}`,
    `M${x0 + len} ${y1}H${x0}V${y1 - len}`,
  ].join("");
  return el("path", { d, fill: "none", stroke: color, "stroke-width": 2 });
}

function describe(github: GitHubSnapshot, mix: MixEntry[], evText: string): string {
  const t = github.totals;
  const langs = mix.length > 0 ? mix.map((m) => `${m.name} ${formatShare(m.share)}`).join("、") : "データなし";
  return [
    `公開リポジトリの使用言語（バイト数）: ${langs}。`,
    `直近365日: コントリビューション ${group(t.contributions)}、コミット ${group(t.commits)}、プルリクエスト ${group(t.pullRequests)}、レビュー ${group(t.reviews)}。`,
    `公開リポジトリ ${group(t.publicRepos)}、スター ${group(t.stars)}、フォロワー ${group(t.followers)}。`,
    `直近28日のペースは年平均比 ${evText}。更新 ${github.fetchedAt.slice(0, 10)}。`,
  ].join("");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
