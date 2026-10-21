// Contact-sheet frame card: one featured project "exposed" on a cut segment of
// 35mm film. The film base, sprocket holes and edge printing frame a viewfinder
// exposure that carries the project's code, title, summary, stack and status,
// with a YOLO-style detection box around the title labelled with its kind.
//
// Pure: (input, { theme, assets }) → SVG string. Layout is computed first as
// plain data (layoutFrame), then turned into markup.
import type { Project } from "../contract/schema";
import { el, esc, svgDoc } from "./svg";
import { fontStack, type Theme } from "./theme";
import type { FontRole, RenderContext } from "./types";

export interface FrameInput {
  project: Project;
  /** 0-based position on the contact sheet. */
  index: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Geometry (viewBox units). 4:3 so three cards sit side by side at ~270 px.
// ---------------------------------------------------------------------------

const W = 640;
const H = 480;
/** Film rebate above and below the exposure: outer margin + perforation + inner margin. */
const BAND = 58;
const EDGE_MARGIN = 20;
/** Unexposed film between neighbouring frames. */
const GAP = 16;
const EXPO = { x: 36, y: BAND, w: 568, h: H - 2 * BAND, r: 6 } as const;
/** The exposed image area of the frame, in viewBox units. */
export const EXPOSURE: Readonly<{ x: number; y: number; w: number; h: number }> = EXPO;
/** 35mm film has eight perforations per frame. */
const PITCH = EXPO.w / 8;
const HOLE = { w: 22, h: 30, r: 3.5 } as const;
const PAD = 34;
const INNER = { left: EXPO.x + PAD, right: EXPO.x + EXPO.w - PAD } as const;

const HUD = { y: EXPO.y + 24, h: 30, size: 18 } as const;
const CHIP_MIN = 14;
const CHIP = { h: 32, sizes: [18, 16, CHIP_MIN], padX: 12, gap: 10, bottom: 24 } as const;
const LABEL = { h: 28, size: 18, padX: 10 } as const;
const BOX = { padX: 16, padY: 14, stroke: 3 } as const;
const SUMMARY = { size: 26, lineHeight: 36, gap: 22 } as const;
const TITLE_SINGLE = [56, 52, 48] as const;
const TITLE_DOUBLE = [56, 52, 48, 44] as const;
/** Last resort for unusually long titles: up to three lines, smaller. */
const TITLE_MIN = 28;
const TITLE_MULTI = [44, 40, 36, 32, TITLE_MIN] as const;
const EDGE = { size: 13, tracking: 0.14 } as const;

/**
 * Motion, in seconds. Every animation shares one CYCLE and starts STAGGER × index
 * late, so the six cards ripple in order: the scan line sweeps the exposure, the
 * REC dot blinks while it records, the AF brackets lock onto the detection as the
 * line crosses it, then the frame rests until the next loop.
 */
const CYCLE = 8;
const STAGGER = 0.5;
const SCAN_SECONDS = 1.8;
const LOCK = { snap: 0.2, hold: 1.8, fade: 0.45 } as const;
const REC_BLINK = 0.3;
const SCAN_TRAIL = 60;

const EDGE_MARK = "KAN-NINOMIYA";

// ---------------------------------------------------------------------------
// Text metrics. Advance widths (1/1000 em) of printable ASCII U+0020..U+007E,
// measured from the bundled LINE Seed JP fonts with HarfBuzz. Japanese glyphs
// are full width (1 em); JetBrains Mono is 0.6 em throughout.
// ---------------------------------------------------------------------------

const ASCII_WIDTHS: Record<"display" | "display-bold", readonly number[]> = {
  display: [
    345, 282, 499, 837, 645, 1009, 782, 292, 427, 427, 534, 650, 292, 504, 292, 455, 725, 466, 667, 669, 715, 669, 660,
    629, 695, 658, 292, 292, 650, 650, 650, 603, 1125, 761, 709, 823, 791, 638, 609, 842, 798, 279, 526, 735, 635, 985,
    791, 875, 672, 890, 703, 622, 689, 771, 753, 1154, 691, 717, 655, 377, 455, 377, 650, 613, 359, 659, 659, 580, 659,
    583, 391, 659, 626, 249, 249, 577, 249, 978, 626, 630, 659, 659, 405, 500, 420, 623, 572, 854, 548, 571, 533, 455,
    327, 455, 634,
  ],
  "display-bold": [
    345, 282, 499, 837, 645, 1009, 782, 292, 427, 427, 534, 650, 292, 504, 292, 455, 725, 466, 667, 669, 715, 669, 660,
    629, 695, 658, 292, 292, 650, 650, 650, 603, 1125, 815, 743, 863, 827, 671, 636, 880, 834, 319, 587, 785, 663, 1027,
    825, 923, 704, 931, 734, 647, 729, 807, 803, 1202, 738, 770, 671, 377, 455, 377, 650, 613, 392, 694, 694, 626, 694,
    621, 435, 694, 665, 288, 288, 643, 288, 1020, 665, 676, 694, 694, 451, 530, 464, 665, 630, 915, 608, 629, 558, 455,
    327, 455, 650,
  ],
};

function advance(ch: string, role: FontRole): number {
  if (role === "mono" || role === "mono-bold") return 0.6;
  const code = ch.codePointAt(0) ?? 0;
  const table = ASCII_WIDTHS[role];
  return code >= 0x20 && code <= 0x7e ? (table[code - 0x20] ?? 600) / 1000 : 1;
}

/** Rendered width of `text` at `size`, with optional letter-spacing in em. */
function textWidth(text: string, role: FontRole, size: number, tracking = 0): number {
  let em = 0;
  for (const ch of text) em += advance(ch, role) + tracking;
  return em * size;
}

// ---------------------------------------------------------------------------
// Line breaking: at spaces and between Japanese characters, never starting a
// line with closing punctuation or small kana.
// ---------------------------------------------------------------------------

const NO_LINE_START = new Set([..."、。，．・ー）」』】〕！？ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ!?.,:;)]}"]);
const isWide = (ch: string) => (ch.codePointAt(0) ?? 0) > 0x2e7f;

/** Unbreakable pieces of `text`; " " marks a breakable space. */
function atoms(text: string): string[] {
  const out: string[] = [];
  let word = "";
  const flush = () => {
    if (word) out.push(word);
    word = "";
  };
  for (const ch of text) {
    if (ch === " ") {
      flush();
      if (out.length > 0 && out[out.length - 1] !== " ") out.push(" ");
    } else if (NO_LINE_START.has(ch)) {
      if (word) word += ch;
      else if (out.length > 0 && out[out.length - 1] !== " ") out[out.length - 1] += ch;
      else word = ch;
    } else if (isWide(ch)) {
      flush();
      word = ch;
      flush();
    } else {
      if (word && isWide([...word].at(-1) ?? "")) flush();
      word += ch;
    }
  }
  flush();
  if (out.at(-1) === " ") out.pop();
  return out;
}

/** Joins atoms back into text; a " " atom becomes a space unless it ends a line. */
const joinAtoms = (parts: readonly string[]) => parts.join("").trim();

/** Greedy wrap into lines no wider than maxWidth (a single atom may overflow). */
function wrapGreedy(text: string, role: FontRole, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current: string[] = [];
  for (const atom of atoms(text)) {
    const candidate = joinAtoms([...current, atom]);
    if (current.length === 0 || atom === " " || textWidth(candidate, role, size) <= maxWidth) {
      if (current.length > 0 || atom !== " ") current.push(atom);
    } else {
      lines.push(joinAtoms(current));
      current = [atom];
    }
  }
  if (current.length > 0) lines.push(joinAtoms(current));
  return lines;
}

/** The two-line split with the narrowest longer line, if both lines fit. */
function splitBalanced(text: string, role: FontRole, size: number, maxWidth: number): [string, string] | null {
  const parts = atoms(text);
  let best: { lines: [string, string]; width: number } | null = null;
  for (let i = 1; i < parts.length; i++) {
    const lines: [string, string] = [joinAtoms(parts.slice(0, i)), joinAtoms(parts.slice(i))];
    if (!lines[0] || !lines[1]) continue;
    const width = Math.max(...lines.map((line) => textWidth(line, role, size)));
    if (width <= maxWidth && (!best || width < best.width)) best = { lines, width };
  }
  return best?.lines ?? null;
}

// ---------------------------------------------------------------------------
// Layout: plain data, no markup.
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TextBlock {
  size: number;
  lines: string[];
  x: number;
  baselines: number[];
}

interface Chip extends Rect {
  text: string;
  size: number;
}

export interface FrameLayout {
  status: Rect & { text: string; dot: { cx: number; cy: number; r: number }; textX: number; baseline: number };
  /** Right-aligned at x; width includes letter-spacing. */
  code: { x: number; baseline: number; size: number; width: number };
  label: Rect & { textX: number; baseline: number };
  box: Rect;
  title: TextBlock;
  summary: TextBlock;
  chips: Chip[];
  /** Where the detection's centre sits in the exposure, 0 (top) to 1 (bottom). */
  focus: number;
}

const TITLE_MAX = INNER.right - INNER.left - 2 * BOX.padX;
const SUMMARY_MAX = INNER.right - INNER.left;

function boxHeight(size: number, lines: number): number {
  return 2 * BOX.padY + size * 1.04 + (lines - 1) * size * 1.1;
}

function summaryHeight(lines: number): number {
  return SUMMARY.size + (lines - 1) * SUMMARY.lineHeight;
}

function groupHeight(titleSize: number, titleLines: number, summaryLines: number): number {
  return LABEL.h + boxHeight(titleSize, titleLines) + SUMMARY.gap + summaryHeight(summaryLines);
}

function wrapSummary(summary: string): string[] {
  const { size } = SUMMARY;
  if (textWidth(summary, "display", size) <= SUMMARY_MAX) return [summary];
  return splitBalanced(summary, "display", size, SUMMARY_MAX) ?? wrapGreedy(summary, "display", size, SUMMARY_MAX);
}

function fitTitle(title: string, zone: number, summaryLines: number): { size: number; lines: string[] } {
  for (const size of TITLE_SINGLE) {
    if (textWidth(title, "display-bold", size) <= TITLE_MAX && groupHeight(size, 1, summaryLines) <= zone) {
      return { size, lines: [title] };
    }
  }
  for (const size of TITLE_DOUBLE) {
    const lines = splitBalanced(title, "display-bold", size, TITLE_MAX);
    if (lines && groupHeight(size, 2, summaryLines) <= zone) return { size, lines };
  }
  for (const size of TITLE_MULTI) {
    const lines = wrapGreedy(title, "display-bold", size, TITLE_MAX);
    if (lines.length <= 3 && groupHeight(size, lines.length, summaryLines) <= zone) return { size, lines };
  }
  return { size: TITLE_MIN, lines: wrapGreedy(title, "display-bold", TITLE_MIN, TITLE_MAX) };
}

const CODE_TRACKING = 0.12;

/** The project code at the HUD size, shrunk only if it would reach the status chip. */
function fitCode(code: string, available: number): { size: number; width: number } {
  const perSize = textWidth(code, "mono", 1, CODE_TRACKING);
  const size = Math.min(HUD.size, Math.floor((available / perSize) * 10) / 10);
  return { size, width: perSize * size };
}

/** One row of stack chips: shrink the type first, then fold what is left into "+N". */
function fitChips(stack: readonly string[], y: number): Chip[] {
  const row = (size: number, items: readonly string[]) => {
    let x = INNER.left;
    return items.map((text) => {
      const chip = { x, y, w: textWidth(text, "mono", size) + 2 * CHIP.padX, h: CHIP.h, text, size };
      x += chip.w + CHIP.gap;
      return chip;
    });
  };
  const fits = (chips: Chip[]) => chips.every((chip) => chip.x + chip.w <= INNER.right);
  for (const size of CHIP.sizes) {
    const chips = row(size, stack);
    if (fits(chips)) return chips;
  }
  for (let shown = stack.length - 1; shown >= 1; shown--) {
    const chips = row(CHIP_MIN, [...stack.slice(0, shown), `+${stack.length - shown}`]);
    if (fits(chips)) return chips;
  }
  return row(CHIP_MIN, stack.slice(0, 1));
}

export function layoutFrame(project: Project): FrameLayout {
  // HUD row: REC status chip on the left, project code on the right.
  const hudBaseline = HUD.y + HUD.h / 2 + HUD.size * 0.36;
  const statusTextX = INNER.left + 30;
  const status = {
    x: INNER.left,
    y: HUD.y,
    w: 30 + textWidth(project.status, "mono-bold", HUD.size, 0.08) + 12,
    h: HUD.h,
    text: project.status,
    dot: { cx: INNER.left + 15, cy: HUD.y + HUD.h / 2, r: 6 },
    textX: statusTextX,
    baseline: hudBaseline,
  };
  const codeRoom = INNER.right - (status.x + status.w + 16);
  const code = { x: INNER.right, baseline: hudBaseline, ...fitCode(project.code, codeRoom) };

  // Stack chips along the bottom of the exposure.
  const chipY = EXPO.y + EXPO.h - CHIP.bottom - CHIP.h;
  const chips = fitChips(project.stack, chipY);

  // Title group (label tab + detection box + summary), centred between HUD and chips.
  const zoneTop = HUD.y + HUD.h + 14;
  const zoneBottom = chipY - 18;
  const zone = zoneBottom - zoneTop;
  const summaryLines = wrapSummary(project.summary);
  const fitted = fitTitle(project.title, zone, summaryLines.length);
  const slack = zone - groupHeight(fitted.size, fitted.lines.length, summaryLines.length);
  const groupTop = zoneTop + Math.max(0, slack / 2);

  const titleWidth = Math.max(...fitted.lines.map((line) => textWidth(line, "display-bold", fitted.size)));
  const box: Rect = {
    x: INNER.left,
    y: groupTop + LABEL.h,
    w: Math.min(titleWidth + 2 * BOX.padX, INNER.right - INNER.left),
    h: boxHeight(fitted.size, fitted.lines.length),
  };
  const firstTitleBaseline = box.y + BOX.padY + fitted.size * 0.86;
  const title: TextBlock = {
    size: fitted.size,
    lines: fitted.lines,
    x: box.x + BOX.padX,
    baselines: fitted.lines.map((_, i) => firstTitleBaseline + i * fitted.size * 1.1),
  };
  const labelW = textWidth(project.kind, "mono-bold", LABEL.size, 0.04) + 2 * LABEL.padX;
  const label = {
    x: box.x - BOX.stroke / 2,
    y: box.y - LABEL.h,
    w: labelW,
    h: LABEL.h,
    textX: box.x - BOX.stroke / 2 + LABEL.padX,
    baseline: box.y - LABEL.h / 2 + LABEL.size * 0.36,
  };
  const summaryTop = box.y + box.h + SUMMARY.gap;
  const summary: TextBlock = {
    size: SUMMARY.size,
    lines: summaryLines,
    x: INNER.left,
    baselines: summaryLines.map((_, i) => summaryTop + SUMMARY.size * 0.86 + i * SUMMARY.lineHeight),
  };

  const focus = (box.y + box.h / 2 - EXPO.y) / EXPO.h;
  return { status, code, label, box, title, summary, chips, focus };
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

const ROLE_CLASS: Record<FontRole, string> = { mono: "m", "mono-bold": "mb", display: "d", "display-bold": "db" };
const ROLES = Object.keys(ROLE_CLASS) as FontRole[];

/** Rounds to 2 decimals so the output stays compact and stable. */
const n = (value: number) => Math.round(value * 100) / 100;
const pct = (value: number) => `${n(value)}%`;
const pad2 = (value: number) => String(value).padStart(2, "0");

/** Records the exact text drawn in each font role so fonts can be subset to it. */
class GlyphSink {
  private readonly byRole = new Map<FontRole, string>();

  text(role: FontRole, cls: string, values: Record<string, string | number>, content: string): string {
    this.byRole.set(role, (this.byRole.get(role) ?? "") + content);
    return el("text", { class: `${ROLE_CLASS[role]} ${cls}`.trim(), ...values }, esc(content));
  }

  async fontCss(ctx: RenderContext): Promise<string> {
    const used = ROLES.filter((role) => this.byRole.has(role));
    const css = await Promise.all(used.map((role) => ctx.assets.fontCss(role, this.byRole.get(role) ?? "")));
    return css.join("");
  }
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** The theme token that reads best when printed on the film base. */
function filmInk(theme: Theme): string {
  const base = luminance(theme.film);
  const contrast = (c: string) => {
    const l = luminance(c);
    return (Math.max(l, base) + 0.05) / (Math.min(l, base) + 0.05);
  };
  return [theme.text, theme.surface, theme.bg].reduce((a, b) => (contrast(b) > contrast(a) ? b : a));
}

const KIND_INDEX: Record<Project["kind"], 0 | 1 | 2> = { product: 0, oss: 1, research: 2 };

function rect(r: Rect, values: Record<string, string | number | undefined> = {}): string {
  return el("rect", { x: n(r.x), y: n(r.y), width: n(r.w), height: n(r.h), ...values });
}

function filmMarkup(theme: Theme): string {
  const holes: string[] = [];
  const firstX = EXPO.x + (PITCH - HOLE.w) / 2;
  for (let k = -1; k <= 8; k++) {
    const x = n(firstX + k * PITCH);
    for (const y of [EDGE_MARGIN, H - EDGE_MARGIN - HOLE.h]) {
      holes.push(el("rect", { class: "hole", x, y, width: HOLE.w, height: HOLE.h, rx: HOLE.r }));
    }
  }
  const neighbour = { y: EXPO.y, w: 40, h: EXPO.h };
  return [
    el("rect", { width: W, height: H, fill: theme.film }),
    // Celluloid sheen so the base reads as film even on a dark page.
    el("rect", { width: W, height: H, fill: "url(#f)" }),
    el("g", { fill: theme.sprocket }, holes.join("")),
    // Slivers of the neighbouring frames: this card is cut from a longer strip.
    el(
      "g",
      { fill: "url(#v)", "fill-opacity": 0.5 },
      rect({ x: EXPO.x - GAP - neighbour.w, ...neighbour }, { rx: EXPO.r }) +
        rect({ x: EXPO.x + EXPO.w + GAP, ...neighbour }, { rx: EXPO.r }),
    ),
  ].join("");
}

/** Deterministic DX-style code blocks: a texture, derived from the frame number. */
function dxBlocks(index: number): Rect[] {
  const blocks: Rect[] = [];
  let seed = Math.imul(index + 1, 0x9e3779b1) | 1;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  let x = EXPO.x;
  for (let i = 0; i < 18; i++) {
    const bits = next();
    const w = bits % 3 === 0 ? 9 : 4;
    if (bits % 5 !== 0) blocks.push({ x, y: H - EDGE_MARGIN + 6, w, h: 8 });
    x += w + 4;
  }
  return blocks;
}

function edgeMarkup(input: FrameInput, theme: Theme, sink: GlyphSink): string {
  const ink = filmInk(theme);
  const frame = pad2(input.index + 1);
  const top = EDGE_MARGIN - 5;
  const bottom = H - 6;
  const common = { "font-size": EDGE.size, "letter-spacing": `${EDGE.tracking}em` };
  return el(
    "g",
    { fill: ink, "fill-opacity": 0.62 },
    [
      sink.text("mono", "edge", { x: EXPO.x, y: top, ...common }, `${EDGE_MARK} ▸ ${frame}A`),
      sink.text("mono", "edge", { x: EXPO.x + EXPO.w, y: top, "text-anchor": "end", ...common }, `${frame}/${pad2(input.total)}`),
      el("g", { "fill-opacity": 0.7 }, dxBlocks(input.index).map((b) => rect(b)).join("")),
      sink.text("mono-bold", "edge", { x: EXPO.x + EXPO.w, y: bottom, "text-anchor": "end", ...common }, `▸ ${frame}`),
    ].join(""),
  );
}

function exposureMarkup(layout: FrameLayout, project: Project, theme: Theme, sink: GlyphSink): string {
  const detect = theme.detect[KIND_INDEX[project.kind]];
  const { status, code, label, box, title, summary, chips } = layout;
  const thirdsX = [1, 2].map((k) => n(EXPO.x + (EXPO.w * k) / 3));
  const thirdsY = [1, 2].map((k) => n(EXPO.y + (EXPO.h * k) / 3));
  const grid = [
    ...thirdsX.map((x) => el("line", { x1: x, y1: EXPO.y, x2: x, y2: EXPO.y + EXPO.h })),
    ...thirdsY.map((y) => el("line", { x1: EXPO.x, y1: y, x2: EXPO.x + EXPO.w, y2: y })),
  ].join("");

  return [
    el("rect", { x: EXPO.x, y: EXPO.y, width: EXPO.w, height: EXPO.h, rx: EXPO.r, fill: "url(#v)" }),
    // A faint colour cast from the detected subject, so each frame reads as its own shot.
    el("rect", { x: EXPO.x, y: EXPO.y, width: EXPO.w, height: EXPO.h, rx: EXPO.r, fill: "url(#c)" }),
    el("g", { stroke: theme.line, "stroke-width": 1, "stroke-opacity": 0.6 }, grid),
    el("rect", {
      x: EXPO.x + 0.75,
      y: EXPO.y + 0.75,
      width: EXPO.w - 1.5,
      height: EXPO.h - 1.5,
      rx: EXPO.r,
      fill: "none",
      stroke: theme.line,
      "stroke-width": 1.5,
    }),
    // HUD: REC-style status chip and project code.
    rect(status, { rx: 4, fill: "none", stroke: theme.accent, "stroke-opacity": 0.55, "stroke-width": 1.5 }),
    el("circle", { class: "rec", cx: n(status.dot.cx), cy: n(status.dot.cy), r: status.dot.r, fill: theme.accent }),
    sink.text(
      "mono-bold",
      "status",
      { x: n(status.textX), y: n(status.baseline), "font-size": HUD.size, "letter-spacing": "0.08em", fill: theme.text },
      status.text,
    ),
    sink.text(
      "mono",
      "code",
      {
        x: code.x,
        y: n(code.baseline),
        "text-anchor": "end",
        "font-size": code.size,
        "letter-spacing": `${CODE_TRACKING}em`,
        fill: theme.muted,
      },
      project.code,
    ),
    // Detection: box around the title, labelled with the project kind.
    rect(box, { class: "det", fill: detect, "fill-opacity": 0.08, stroke: detect, "stroke-width": BOX.stroke }),
    rect(label, { fill: detect }),
    sink.text(
      "mono-bold",
      "kind",
      { x: n(label.textX), y: n(label.baseline), "font-size": LABEL.size, "letter-spacing": "0.04em", fill: theme.surface },
      project.kind,
    ),
    ...title.lines.map((line, i) =>
      sink.text(
        "display-bold",
        "",
        { x: n(title.x), y: n(title.baselines[i] ?? 0), "font-size": title.size, fill: theme.text },
        line,
      ),
    ),
    ...summary.lines.map((line, i) =>
      sink.text(
        "display",
        "",
        { x: n(summary.x), y: n(summary.baselines[i] ?? 0), "font-size": summary.size, fill: theme.text, "fill-opacity": 0.82 },
        line,
      ),
    ),
    // Stack chips.
    ...chips.map(
      (chip) =>
        rect(chip, { rx: 4, fill: "none", stroke: theme.line, "stroke-width": 1.5 }) +
        sink.text(
          "mono",
          "chip",
          { x: n(chip.x + CHIP.padX), y: n(chip.y + chip.h / 2 + chip.size * 0.36), "font-size": chip.size, fill: theme.muted },
          chip.text,
        ),
    ),
  ].join("");
}

/** Hidden at rest: AF lock brackets that snap onto the detection, and the scan line. */
function motionMarkup(layout: FrameLayout, theme: Theme): string {
  const { box, label } = layout;
  const o = 9;
  const len = 18;
  const x0 = n(box.x - o);
  const y0 = n(label.y - o);
  const x1 = n(box.x + box.w + o);
  const y1 = n(box.y + box.h + o);
  const corners = [
    `M${x0} ${y0 + len}V${y0}H${x0 + len}`,
    `M${x1 - len} ${y0}H${x1}V${y0 + len}`,
    `M${x1} ${y1 - len}V${y1}H${x1 - len}`,
    `M${x0 + len} ${y1}H${x0}V${y1 - len}`,
  ].join("");
  const lock = el("path", { class: "lock", d: corners, fill: "none", stroke: theme.lock, "stroke-width": 3 });
  const scan = el(
    "g",
    { "clip-path": "url(#x)" },
    el(
      "g",
      { class: "scan" },
      el("rect", { x: EXPO.x, y: EXPO.y - SCAN_TRAIL, width: EXPO.w, height: SCAN_TRAIL, fill: "url(#s)" }) +
        el("rect", { x: EXPO.x, y: EXPO.y - 1, width: EXPO.w, height: 2, fill: theme.lock }),
    ),
  );
  return lock + scan;
}

function defsMarkup(theme: Theme, layout: FrameLayout, project: Project): string {
  const ink = filmInk(theme);
  const cast = theme.detect[KIND_INDEX[project.kind]];
  const { box } = layout;
  const sheen = [
    [0, 0.03],
    [0.32, 0.09],
    [0.58, 0.035],
    [1, 0.07],
  ].map(([offset, opacity]) => el("stop", { offset, "stop-color": ink, "stop-opacity": opacity }));
  return [
    el("linearGradient", { id: "f", x1: "0", y1: "0", x2: "1", y2: "0.35" }, sheen.join("")),
    el(
      "radialGradient",
      { id: "v", cx: "50%", cy: "46%", r: "70%" },
      el("stop", { offset: "0", "stop-color": theme.surface }) + el("stop", { offset: "1", "stop-color": theme.bg }),
    ),
    el(
      "linearGradient",
      { id: "s", x1: "0", y1: "0", x2: "0", y2: "1" },
      el("stop", { offset: "0", "stop-color": theme.lock, "stop-opacity": 0 }) +
        el("stop", { offset: "1", "stop-color": theme.lock, "stop-opacity": 0.14 }),
    ),
    el(
      "radialGradient",
      { id: "c", gradientUnits: "userSpaceOnUse", cx: n(box.x + box.w / 2), cy: n(box.y + box.h / 2), r: 360 },
      el("stop", { offset: "0", "stop-color": cast, "stop-opacity": 0.13 }) +
        el("stop", { offset: "1", "stop-color": cast, "stop-opacity": 0 }),
    ),
    el("clipPath", { id: "x" }, el("rect", { x: EXPO.x, y: EXPO.y, width: EXPO.w, height: EXPO.h, rx: EXPO.r })),
  ].join("");
}

function styleCss(fonts: string, layout: FrameLayout, index: number): string {
  const delay = `${n(index * STAGGER)}s`;
  const run = (name: string, timing: string) => `animation:${name} ${CYCLE}s ${timing} ${delay} infinite`;
  /** A moment in the cycle as a keyframe selector. */
  const at = (seconds: number) => pct((seconds / CYCLE) * 100);
  const lock = layout.focus * SCAN_SECONDS;
  const hidden = `transform:translateY(${EXPO.h + SCAN_TRAIL}px);opacity:0`;
  const blinks = Array.from({ length: Math.round(SCAN_SECONDS / (2 * REC_BLINK)) }, (_, k) => {
    const on = 2 * k * REC_BLINK;
    return `${at(on)}{opacity:1}${at(on + REC_BLINK)}{opacity:.25}`;
  });
  return [
    fonts,
    `.m{font-family:${fontStack.mono};font-weight:500}`,
    `.mb{font-family:${fontStack.mono};font-weight:700}`,
    `.d{font-family:${fontStack.display};font-weight:400}`,
    `.db{font-family:${fontStack.display};font-weight:700}`,
    `.scan{opacity:0;${run("scan", "linear")}}`,
    `.lock{opacity:0;transform-box:fill-box;transform-origin:center;${run("lock", "ease-out")}}`,
    `.rec{${run("rec", "step-end")}}`,
    `@keyframes scan{0%{transform:translateY(0);opacity:0}${at(0.05)}{opacity:1}${at(SCAN_SECONDS - 0.1)}{opacity:1}` +
      `${at(SCAN_SECONDS)},100%{${hidden}}}`,
    `@keyframes lock{0%,${at(lock)}{opacity:0;transform:scale(1.25)}` +
      `${at(lock + LOCK.snap)},${at(lock + LOCK.snap + LOCK.hold)}{opacity:1;transform:scale(1)}` +
      `${at(lock + LOCK.snap + LOCK.hold + LOCK.fade)},100%{opacity:0;transform:scale(1)}}`,
    `@keyframes rec{${blinks.join("")}${at(SCAN_SECONDS)},100%{opacity:1}}`,
    `@media (prefers-reduced-motion: reduce){.scan,.lock,.rec{animation:none}}`,
  ].join("");
}

export async function renderFrame(input: FrameInput, ctx: RenderContext): Promise<string> {
  const { project, index, total } = input;
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(index) || index < 0 || index >= total) {
    throw new RangeError(`renderFrame: frame ${index} is outside a roll of ${total}`);
  }
  const { theme } = ctx;
  const layout = layoutFrame(project);
  const sink = new GlyphSink();
  const body = [
    filmMarkup(theme),
    edgeMarkup(input, theme, sink),
    exposureMarkup(layout, project, theme, sink),
    motionMarkup(layout, theme),
  ].join("");
  const fonts = await sink.fontCss(ctx);
  const frame = `${pad2(index + 1)}/${pad2(total)}`;
  return svgDoc({
    width: W,
    height: H,
    title: `${project.title} (${project.code})`,
    desc: `${project.summary} — ${project.kind}, ${project.status}, ${project.stack.join(" / ")}. Frame ${frame}.`,
    style: styleCss(fonts, layout, index),
    defs: defsMarkup(theme, layout, project),
    body,
  });
}
