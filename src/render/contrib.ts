// CONTRIBUTION SCAN: the contribution calendar "develops" under a safelight-red
// scan line, then AF brackets hunt across the frame and lock onto the busiest week.
//
// Static state (no animation, or prefers-reduced-motion) = fully developed and locked.
// Every animation shares one cycle; each column gets its own keyframes so the
// develop sweep and the global reset at the end of the loop stay in sync.
import type { GitHubSnapshot } from "../contract/schema";
import { contribStats, type Contributions, type ContribStats, type PeakWeek } from "./contrib-stats";
import { el, esc, svgDoc } from "./svg";
import { fontStack, type Theme } from "./theme";
import type { RenderContext } from "./types";

export const CONTRIB_WIDTH = 1280;
export const CONTRIB_HEIGHT = 360;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const MAX_PITCH = 22;
const CELL_RATIO = 18 / 22;
const SIDE = 59;
const GRID_TOP = 96;
const ROWS = 7;

const TYPE = { hud: 17, month: 15, tab: 22, value: 42, label: 17 } as const;

export interface GridGeometry {
  left: number;
  top: number;
  right: number;
  bottom: number;
  pitch: number;
  cell: number;
  width: number;
  height: number;
}

export interface GridCell {
  week: number;
  /** 0 = Sunday … 6 = Saturday, from the date itself (partial weeks stay aligned). */
  row: number;
  x: number;
  y: number;
  level: number;
  count: number;
  date: string;
}

export function gridGeometry(weekCount: number): GridGeometry {
  const gutter = MAX_PITCH * (1 - CELL_RATIO);
  const pitch = Math.min(MAX_PITCH, (CONTRIB_WIDTH - 2 * SIDE + gutter) / weekCount);
  const cell = pitch * CELL_RATIO;
  const width = weekCount * pitch - (pitch - cell);
  const height = ROWS * pitch - (pitch - cell);
  const left = (CONTRIB_WIDTH - width) / 2;
  return { left, top: GRID_TOP, right: left + width, bottom: GRID_TOP + height, pitch, cell, width, height };
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function gridCells(c: Contributions): GridCell[] {
  const g = gridGeometry(c.weeks.length);
  return c.weeks.flatMap((week, w) =>
    week.days.map((day) => {
      const row = weekday(day.date);
      return { week: w, row, x: g.left + w * g.pitch, y: g.top + row * g.pitch, level: day.level, count: day.count, date: day.date };
    }),
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

interface MonthLabel {
  x: number;
  text: string;
}

function monthLabels(c: Contributions, g: GridGeometry): MonthLabel[] {
  const labels: MonthLabel[] = [];
  let prevMonth = -1;
  c.weeks.forEach((week, w) => {
    const first = week.days[0];
    if (!first) return;
    const month = Number(first.date.slice(5, 7)) - 1;
    if (month !== prevMonth) labels.push({ x: g.left + w * g.pitch, text: MONTHS[month] ?? "" });
    prevMonth = month;
  });
  // Drop a leading label that would collide with the next one (partial first month).
  const [a, b] = labels;
  if (a && b && b.x - a.x < 3 * g.pitch) labels.shift();
  return labels;
}

// ---------------------------------------------------------------------------
// Timeline: seconds within one shared cycle
// ---------------------------------------------------------------------------

const CYCLE = 14;
const T = {
  scanIn: 0.2,
  scanStart: 0.4,
  scanEnd: 3.8,
  scanOut: 4.0,
  developFade: 0.5,
  huntIn: 3.75,
  huntShown: 3.9,
  region: 4.3,
  regionHold: 4.42,
  overshoot: 4.68,
  settle: 4.85,
  lock: 4.9,
  labelIn: 5.05,
  labelShown: 5.35,
  resetStart: 13.1,
  resetEnd: 13.65,
} as const;

function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Seconds → keyframe offset. */
function at(seconds: number): string {
  return `${num((seconds / CYCLE) * 100)}%`;
}

function anim(name: string, timing = ""): string {
  return `animation:${name} ${CYCLE}s ${timing ? `${timing} ` : ""}infinite`;
}

/** Fades in at `from`→`to` and holds until the global reset at the end of the cycle. */
function holdKeyframes(name: string, from: number, to: number): string {
  return `@keyframes ${name}{0%,${at(from)}{opacity:0}${at(to)},${at(T.resetStart)}{opacity:1}${at(T.resetEnd)},to{opacity:0}}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** JetBrains Mono advance width is 0.6em. */
function monoWidth(text: string, size: number, tracking = 0): number {
  return text.length * size * (0.6 + tracking);
}

function squares(cells: readonly GridCell[], size: number): string {
  const s = num(size);
  return cells.map((c) => `M${num(c.x)} ${num(c.y)}h${s}v${s}h-${s}z`).join("");
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function inflate(box: Box, dx: number, dy: number): Box {
  return { x: box.x - dx, y: box.y - dy, w: box.w + 2 * dx, h: box.h + 2 * dy };
}

type Point = readonly [number, number];

/** AF corner positions: top-left, top-right, bottom-left, bottom-right. */
function cornerPoints(box: Box): Point[] {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  return [
    [box.x, box.y],
    [right, box.y],
    [box.x, bottom],
    [right, bottom],
  ];
}

/** Bracket shapes drawn relative to their corner point, same order as cornerPoints. */
const BRACKETS = (() => {
  const h = 7;
  const v = 18;
  return [`M0 ${v}V0H${h}`, `M-${h} 0H0V${v}`, `M0 -${v}V0H${h}`, `M-${h} 0H0V-${v}`];
})();

function translate([x, y]: Point): string {
  return `transform:translate(${num(x)}px,${num(y)}px)`;
}

/** Markup plus the CSS that animates it. */
interface Layer {
  markup: string;
  css: string;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

interface Copy {
  wip: string;
  done: string;
  range: string;
  months: MonthLabel[];
  tab: string;
  total: { value: string; label: string };
  streaks: { label: string; value: string }[];
}

function copyFor(stats: ContribStats, months: MonthLabel[]): Copy {
  return {
    wip: "DEVELOPING",
    done: "DEVELOPED",
    range: `${stats.firstDate} — ${stats.lastDate}`,
    months,
    tab: `PEAK WEEK · ${stats.peak.start} · ${group(stats.peak.total)}`,
    // The calendar spans a little over 365 days (it starts on a Sunday), so say "past year" as GitHub does.
    total: { value: group(stats.total), label: "CONTRIBUTIONS · PAST YEAR" },
    streaks: [
      { label: "LONGEST STREAK", value: String(stats.longestStreak) },
      { label: "CURRENT", value: String(stats.currentStreak) },
    ],
  };
}

function glyphs(copy: Copy): { mono: string; bold: string } {
  return {
    mono: [copy.wip, copy.done, copy.range, ...copy.months.map((m) => m.text), copy.total.label, ...copy.streaks.map((s) => s.label)].join(""),
    bold: [copy.tab, copy.total.value, ...copy.streaks.map((s) => s.value)].join(""),
  };
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

interface Sweep {
  from: number;
  to: number;
}

function sweepFor(g: GridGeometry): Sweep {
  return { from: g.left - 30, to: g.right + 30 };
}

/** When the scan line crosses x. */
function sweepTime(sweep: Sweep, x: number): number {
  return T.scanStart + ((x - sweep.from) / (sweep.to - sweep.from)) * (T.scanEnd - T.scanStart);
}

/** Latent frame (every day in level 0) plus one developing group per week. */
function developLayer(c: Contributions, cells: readonly GridCell[], g: GridGeometry, sweep: Sweep): Layer {
  const latent = el("path", { class: "l0", d: squares(cells, g.cell) });
  let halos = "";
  let developed = "";
  let css = "";
  c.weeks.forEach((_, w) => {
    const column = cells.filter((cell) => cell.week === w && cell.level > 0);
    if (column.length === 0) return;
    const t = sweepTime(sweep, g.left + w * g.pitch + g.cell / 2);
    css += `.c${w}{${anim(`c${w}`)}}${holdKeyframes(`c${w}`, Math.max(0, t - 0.06), t + T.developFade)}`;
    developed += el(
      "g",
      { class: `c${w}` },
      [1, 2, 3, 4]
        .map((level) => column.filter((cell) => cell.level === level))
        .map((list, i) => (list.length ? el("path", { class: `l${i + 1}`, d: squares(list, g.cell) }) : ""))
        .join(""),
    );
    // Bright days bloom a little, like highlights on a sensor.
    const bright = column.filter((cell) => cell.level >= 3);
    if (bright.length) {
      const r = num(g.cell * 1.6);
      halos += el(
        "g",
        { class: `c${w}` },
        bright.map((cell) => el("circle", { cx: num(cell.x + g.cell / 2), cy: num(cell.y + g.cell / 2), r, fill: "url(#halo)" })).join(""),
      );
    }
  });
  return { markup: latent + halos + developed, css };
}

function scanLayer(g: GridGeometry, sweep: Sweep, theme: Theme): Layer {
  const top = g.top - 16;
  const h = g.height + 32;
  const fill = theme.accent;
  const markup = el(
    "g",
    { "clip-path": "url(#scanclip)" },
    el(
      "g",
      { class: "fx-scan" },
      el(
        "g",
        { class: "fx-sweep" },
        [
          el("rect", { x: -150, y: top, width: 150, height: h, fill: "url(#trail)" }),
          el("rect", { x: -1.5, y: top, width: 3, height: h, fill }),
          el("rect", { x: -8, y: top, width: 16, height: 3, fill }),
          el("rect", { x: -8, y: top + h - 3, width: 16, height: 3, fill }),
        ].join(""),
      ),
    ),
  );
  const css =
    `.fx-scan{${anim("scan")}}` +
    `@keyframes scan{0%,${at(T.scanIn)}{opacity:0}${at(T.scanStart)},${at(T.scanEnd)}{opacity:1}${at(T.scanOut)},to{opacity:0}}` +
    `.fx-sweep{${anim("sweep", "linear")}}` +
    `@keyframes sweep{0%,${at(T.scanStart)}{transform:translateX(${num(sweep.from)}px)}${at(T.scanEnd)},to{transform:translateX(${num(sweep.to)}px)}}`;
  return { markup, css };
}

function scanDefs(g: GridGeometry, theme: Theme): string {
  return [
    el(
      "clipPath",
      { id: "scanclip" },
      el("rect", { x: num(g.left - 12), y: g.top - 20, width: num(g.width + 24), height: g.height + 40 }),
    ),
    el(
      "linearGradient",
      { id: "trail", x1: 0, x2: 1, y1: 0, y2: 0 },
      el("stop", { offset: 0, "stop-color": theme.accent, "stop-opacity": 0 }) +
        el("stop", { offset: 1, "stop-color": theme.accent, "stop-opacity": 0.32 }),
    ),
    el("radialGradient", { id: "halo" }, el("stop", { offset: 0, class: "halo0" }) + el("stop", { offset: 1, class: "halo1" })),
  ].join("");
}

/** AF brackets hunt (whole frame → neighbourhood → slightly too tight) and lock; a YOLO tag names the week. */
function focusLayer(peak: PeakWeek, g: GridGeometry, theme: Theme, tab: string): Layer {
  const peakX = g.left + peak.index * g.pitch;
  // The locked box sits exactly in the gutters around the peak column.
  const lock = inflate({ x: peakX, y: g.top, w: g.cell, h: g.height }, (g.pitch - g.cell) / 2, 9);
  const wide = inflate({ x: g.left, y: g.top, w: g.width, h: g.height }, 16, 13);
  const regionLeft = Math.max(g.left, peakX - 3 * g.pitch);
  const regionRight = Math.min(g.right, peakX + g.cell + 3 * g.pitch);
  const region = inflate({ x: regionLeft, y: g.top, w: regionRight - regionLeft, h: g.height }, 10, 15);
  const tight = inflate(lock, -2, -5);

  const [wideAt, regionAt, tightAt, lockAt] = [wide, region, tight, lock].map(cornerPoints);
  let css = "";
  let brackets = "";
  BRACKETS.forEach((d, i) => {
    const p = (points: Point[] | undefined): Point => points?.[i] ?? [0, 0];
    const final = p(lockAt);
    css +=
      `.af${i}{${anim(`af${i}`)}}@keyframes af${i}{` +
      `0%,${at(T.huntShown)}{${translate(p(wideAt))}}` +
      `${at(T.region)},${at(T.regionHold)}{${translate(p(regionAt))}}` +
      `${at(T.overshoot)}{${translate(p(tightAt))}}` +
      `${at(T.settle)},to{${translate(final)}}}`;
    brackets += el(
      "g",
      { class: `af af${i}`, transform: `translate(${num(final[0])} ${num(final[1])})` },
      el("path", { class: "fx-hunt", d }) + el("path", { class: "fx-lock", d }),
    );
  });
  css +=
    `.fx-hunt{${anim("hunt")}}` +
    `@keyframes hunt{0%,${at(T.huntIn)}{opacity:0}${at(T.huntShown)},${at(T.settle)}{opacity:1}${at(T.lock)},to{opacity:0}}` +
    `.fx-lock{${anim("lock")}}` +
    `@keyframes lock{0%,${at(T.settle)}{opacity:0}${at(T.lock)}{opacity:1}${at(T.lock + 0.12)}{opacity:.2}${at(T.lock + 0.24)},${at(T.resetStart)}{opacity:1}${at(T.resetEnd)},to{opacity:0}}`;

  const tabH = 34;
  const tabPad = 12;
  const tabW = monoWidth(tab, TYPE.tab, 0.04) + 2 * tabPad;
  const fitsRight = lock.x + tabW <= CONTRIB_WIDTH - SIDE;
  const tabX = fitsRight ? lock.x : lock.x + lock.w - tabW;
  const tabY = lock.y - tabH;
  const tag = el(
    "g",
    { class: "fx-tag" },
    [
      el("rect", {
        x: num(lock.x),
        y: num(lock.y),
        width: num(lock.w),
        height: num(lock.h),
        fill: "none",
        stroke: theme.lock,
        "stroke-width": 1.5,
        "stroke-opacity": 0.6,
      }),
      el("rect", { x: num(tabX), y: num(tabY), width: num(tabW), height: tabH, fill: theme.lock }),
      el("text", { class: "b tab", x: num(tabX + tabPad), y: num(tabY + tabH / 2 + TYPE.tab * 0.36) }, esc(tab)),
    ].join(""),
  );
  css +=
    `.fx-tag{${anim("tag")}}` +
    `@keyframes tag{0%,${at(T.labelIn)}{opacity:0;transform:translateY(6px)}${at(T.labelShown)},${at(T.resetStart)}{opacity:1;transform:translateY(0)}${at(T.resetEnd)},to{opacity:0;transform:translateY(0)}}`;

  return { markup: tag + brackets, css };
}

/** State on the left (DEVELOPING → DEVELOPED), date range on the right. */
function hudLayer(copy: Copy, g: GridGeometry, theme: Theme): Layer {
  const y = 40;
  const state = (cls: string, fill: string, text: string) =>
    el("g", { class: cls }, el("rect", { x: g.left, y: y - 11, width: 10, height: 10, fill }) + el("text", { class: "m hud", x: g.left + 20, y }, esc(text)));
  const markup =
    state("fx-wip", theme.accent, copy.wip) +
    state("fx-done", theme.lock, copy.done) +
    el("text", { class: "m hud", x: num(g.right), y, "text-anchor": "end" }, esc(copy.range));
  const blinkOn = [0.5, 1.3, 2.1, 2.9].map(at).join(",");
  const blinkOff = [0.9, 1.7, 2.5].map(at).join(",");
  const css =
    `.fx-wip{${anim("wip")}}` +
    `@keyframes wip{0%,${blinkOn}{opacity:1}${blinkOff}{opacity:.3}${at(T.scanEnd)},${at(T.resetEnd)}{opacity:0}to{opacity:1}}` +
    `.fx-done{${anim("done")}}${holdKeyframes("done", T.scanEnd, T.scanOut)}`;
  return { markup, css };
}

function monthScale(months: readonly MonthLabel[], g: GridGeometry): string {
  return months.map((m) => el("text", { class: "m mo", x: num(m.x), y: g.bottom + 30 }, esc(m.text))).join("");
}

/** Exposure-readout style: big values and small labels on one baseline. */
function statsLine(copy: Copy, g: GridGeometry): string {
  const y = CONTRIB_HEIGHT - 30;
  const total = el(
    "text",
    { x: num(g.left), y },
    el("tspan", { class: "b val" }, esc(copy.total.value)) + el("tspan", { class: "m lab", dx: 14 }, esc(copy.total.label)),
  );
  const streaks = el(
    "text",
    { x: num(g.right), y, "text-anchor": "end" },
    copy.streaks
      .map((s, i) => el("tspan", { class: "m lab", dx: i === 0 ? 0 : 34 }, esc(s.label)) + el("tspan", { class: "b val", dx: 12 }, esc(s.value)))
      .join(""),
  );
  return total + streaks;
}

function viewfinderCorners(theme: Theme): string {
  const inset = 14;
  const arm = 26;
  const W = CONTRIB_WIDTH;
  const H = CONTRIB_HEIGHT;
  return el("path", {
    d: [
      `M${inset} ${inset + arm}V${inset}H${inset + arm}`,
      `M${W - inset - arm} ${inset}H${W - inset}V${inset + arm}`,
      `M${inset} ${H - inset - arm}V${H - inset}H${inset + arm}`,
      `M${W - inset - arm} ${H - inset}H${W - inset}V${H - inset - arm}`,
    ].join(""),
    fill: "none",
    stroke: theme.line,
    "stroke-width": 2,
  });
}

function baseCss(t: Theme): string {
  return [
    `.m{font-family:${fontStack.mono};font-weight:500}`,
    `.b{font-family:${fontStack.mono};font-weight:700}`,
    `.hud{font-size:${TYPE.hud}px;letter-spacing:.08em;fill:${t.muted}}`,
    `.mo{font-size:${TYPE.month}px;letter-spacing:.08em;fill:${t.muted}}`,
    `.val{font-size:${TYPE.value}px;fill:${t.text}}`,
    `.lab{font-size:${TYPE.label}px;letter-spacing:.06em;fill:${t.muted}}`,
    `.tab{font-size:${TYPE.tab}px;letter-spacing:.04em;fill:${t.bg}}`,
    t.levels.map((color, i) => `.l${i}{fill:${color}}`).join(""),
    `.halo0{stop-color:${t.lock};stop-opacity:${t.name === "dark" ? 0.32 : 0.16}}.halo1{stop-color:${t.lock};stop-opacity:0}`,
    `.af path{fill:none;stroke-width:3;stroke-linecap:square}`,
    `.fx-hunt{stroke:${t.text}}.fx-lock{stroke:${t.lock}}`,
    // The static frame is the final one: only these start hidden, everything else is visible.
    `.fx-scan{opacity:0}.fx-hunt{opacity:0}.fx-wip{opacity:0}`,
  ].join("");
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export async function renderContrib(github: GitHubSnapshot, ctx: RenderContext): Promise<string> {
  const { theme, assets } = ctx;
  const c = github.contributions;
  const stats = contribStats(c);
  const g = gridGeometry(c.weeks.length);
  const cells = gridCells(c);
  const copy = copyFor(stats, monthLabels(c, g));
  const sweep = sweepFor(g);

  const text = glyphs(copy);
  const fonts = (await assets.fontCss("mono", text.mono)) + (await assets.fontCss("mono-bold", text.bold));

  const develop = developLayer(c, cells, g, sweep);
  const scan = scanLayer(g, sweep, theme);
  const focus = focusLayer(stats.peak, g, theme, copy.tab);
  const hud = hudLayer(copy, g, theme);

  const body = [
    el("rect", { width: CONTRIB_WIDTH, height: CONTRIB_HEIGHT, rx: 16, fill: theme.bg }),
    viewfinderCorners(theme),
    hud.markup,
    develop.markup,
    scan.markup,
    monthScale(copy.months, g),
    focus.markup,
    statsLine(copy, g),
  ].join("");

  const style = [
    fonts,
    baseCss(theme),
    scan.css,
    hud.css,
    focus.css,
    develop.css,
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`,
  ].join("");

  return svgDoc({
    width: CONTRIB_WIDTH,
    height: CONTRIB_HEIGHT,
    title: `${github.login} のコントリビューション`,
    desc:
      `過去 1 年（${stats.firstDate}〜${stats.lastDate}）のコントリビューションは ${group(stats.total)} 件。` +
      `最も多かった週は ${stats.peak.start} からの週で ${group(stats.peak.total)} 件。` +
      `最長連続記録は ${stats.longestStreak} 日、現在 ${stats.currentStreak} 日連続。`,
    style,
    defs: scanDefs(g, theme),
    body,
  });
}
