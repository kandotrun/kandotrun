// Hero — "Viewfinder".
//
// A mirrorless EVF over Kan's own Leica Q3 photos. The photo fills the frame and
// changes behind a quick shutter blink; each one settles with a short Ken Burns
// move while the AF brackets hunt, then lock with a capture flash. A detector
// scan line sweeps the subject and its YOLO box pops in. Bottom-left the name
// types in inside three nested profile detections whose labels sit side by side
// on their own box edges; bottom-right a playback readout (Japanese caption,
// camera, FOCAL / APERTURE / SHUTTER / ISO) swaps per photo, column by column.
//
// Dark = the live viewfinder, full bleed with cinematic scrims.
// Light = the same frame as a print: inset photo with crop marks, the caption
//         areas cut out of the print as paper, HUD in ink.
//
// All geometry comes from the pure, exported layoutHero() so its invariants
// (subject boxes inside the open photo area, captions apart, copy that fits)
// are unit tested; the drawing code only turns the layout into SVG and CSS.
// Every looping animation shares one cycle of SEGMENT_SECONDS per photo. The
// one-shot intro (typing, profile boxes) ends in its final state, which is also
// the static reduced-motion frame: photo 1 with AF locked and its box.
import type { PhotoMeta, Profile } from "../contract/schema";
import { el, esc, svgDoc } from "./svg";
import { fontStack, type Theme } from "./theme";
import type { FontRole, RenderContext } from "./types";

export interface HeroInput {
  profile: Profile;
  photos: PhotoMeta[];
}

const W = 1280;
const H = 640;

/** Seconds each photo is on screen. All loops share SEGMENT_SECONDS * photos. */
export const SEGMENT_SECONDS = 6;
const SEG = SEGMENT_SECONDS;
/** Step width for instant changes inside a keyframe track. */
const EPS = 0.02;
/**
 * The page opens this far into photo 1, so the viewfinder is already open at
 * load, focus locks within the first second, and the photo changes (shutter
 * blinks) fall at 5.6 s, 11.6 s, 17.6 s instead of on whole seconds.
 */
const PHASE = 0.4;

/** Each Leica JPEG adds ~190 KB as base64; four of them still fit the 900 KB budget. */
export const MAX_PHOTOS = 4;
/** Largest data URI a single photo may add. */
export const MAX_PHOTO_URI_BYTES = 300_000;
/** All photos together, leaving room for fonts and markup under 900 KB. */
const MAX_PHOTOS_URI_BYTES = 800_000;
/** No text below this (viewBox units): ~10 px at the 830 px README width. */
export const MIN_TEXT_SIZE = 15;

// ---------------------------------------------------------------------------
// Font metrics (LINE Seed JP, 1/1000 em), measured offline with HarfBuzz so the
// renderer can place typed glyphs and fit copy without reading font files.
// Index = char code - 32 (printable ASCII). CJK and anything else: 1000.
// ---------------------------------------------------------------------------

const DISPLAY_BOLD_ADVANCE =
  "345,282,499,837,645,1009,782,292,427,427,534,650,292,504,292,455,725,466,667,669,715,669,660,629,695,658,292,292,650,650,650,603,1125,815,743,863,827,671,636,880,834,319,587,785,663,1027,825,923,704,931,734,647,729,807,803,1202,738,770,671,377,455,377,650,613,392,694,694,626,694,621,435,694,665,288,288,643,288,1020,665,676,694,694,451,530,464,665,630,915,608,629,558,455,327,455,650"
    .split(",")
    .map(Number);
const DISPLAY_ADVANCE =
  "345,282,499,837,645,1009,782,292,427,427,534,650,292,504,292,455,725,466,667,669,715,669,660,629,695,658,292,292,650,650,650,603,1125,761,709,823,791,638,609,842,798,279,526,735,635,985,791,875,672,890,703,622,689,771,753,1154,691,717,655,377,455,377,650,613,359,659,659,580,659,583,391,659,626,249,249,577,249,978,626,630,659,659,405,500,420,623,572,854,548,571,533,455,327,455,634"
    .split(",")
    .map(Number);
/** Uppercase kerning pairs of LINE Seed JP Bold. */
const DISPLAY_BOLD_KERN: Record<string, number> = Object.fromEntries(
  "AC-43 AG-43 AO-43 AQ-43 AS-22 AT-119 AU-43 AV-108 AW-97 AY-119 BA-32 BC-22 BG-22 BO-22 BQ-22 BT-32 BV-43 BW-43 BX-11 BY-49 CA-43 CC-22 CG-22 CO-22 CQ-22 CS-11 CT-32 CV-43 CW-43 CX-43 CY-54 CZ-11 DA-43 DJ-16 DS-11 DT-43 DU-11 DV-43 DW-43 DX-43 DY-65 DZ-11 FA-87 FC-11 FG-11 FJ-22 FO-11 FQ-11 GA-43 GJ-16 GS-11 GT-43 GU-11 GV-43 GW-43 GX-43 GY-65 GZ-11 JA-22 KC-54 KG-54 KJ-22 KO-54 KQ-54 KS-32 KT-22 KU-16 LC-54 LG-54 LO-54 LQ-54 LS-22 LT-119 LU-32 LV-108 LW-108 LY-141 OA-43 OJ-16 OS-11 OT-43 OU-11 OV-43 OW-43 OX-43 OY-65 OZ-11 PA-87 PC-11 PG-11 PJ-54 PO-11 PQ-11 PT-11 PV-22 PW-22 PX-43 PY-43 PZ-22 QA-11 QC-22 QG-22 QO-22 QQ-22 QS-11 QT-43 QU-22 QV-65 QW-76 QX-22 QY-97 RC-11 RG-11 RJ-11 RO-11 RQ-11 RS-11 RT-22 RU-16 RV-43 RW-32 RY-54 SA-22 SC-11 SG-11 SO-11 SQ-11 ST-11 SV-22 SW-11 SX-22 SY-22 TA-119 TC-43 TG-43 TJ-54 TO-43 TQ-43 TS-11 UA-43 UC-11 UG-11 UO-11 UQ-11 VA-108 VC-43 VG-43 VJ-54 VO-43 VQ-43 VS-22 WA-97 WC-43 WG-43 WJ-54 WO-43 WQ-43 WS-11 XC-43 XG-43 XJ-11 XO-43 XQ-43 XS-22 YA-119 YC-65 YG-65 YJ-65 YO-65 YQ-65 YS-22 ZC-11 ZG-11 ZO-11 ZQ-11"
    .split(" ")
    .map((pair) => [pair.slice(0, 2), Number(pair.slice(2))]),
);
/** Cap height of LINE Seed JP Bold, in em. */
const DISPLAY_CAP = 0.75;
/** JetBrains Mono advance and cap height, in em. */
const MONO_ADVANCE = 0.6;
const MONO_CAP = 0.73;

function displayAdvance(ch: string, bold: boolean): number {
  const code = ch.codePointAt(0) ?? 0;
  const table = bold ? DISPLAY_BOLD_ADVANCE : DISPLAY_ADVANCE;
  return (code >= 32 && code <= 126 ? table[code - 32] : undefined) ?? 1000;
}

function displayWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of text) units += displayAdvance(ch, bold);
  return (units * size) / 1000;
}

const monoWidth = (text: string, size: number) => [...text].length * MONO_ADVANCE * size;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Rounds to 2 decimals so the output stays compact and stable. */
const n = (v: number) => String(Math.round(v * 100) / 100);
/** Scale factors need more precision than coordinates. */
const ratio = (v: number) => String(Math.round(v * 10000) / 10000);
const px = (v: number) => `${n(v)}px`;
const mod = (v: number, m: number) => ((v % m) + m) % m;
const pct = (v: number) => `${Math.round(v * 100000) / 1000}%`;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rectOf = (b: Box) => ({ x: n(b.x0), y: n(b.y0), width: n(b.x1 - b.x0), height: n(b.y1 - b.y0) });

// ---------------------------------------------------------------------------
// Timeline. Local times are seconds after a photo change; 0 is the change.
// ---------------------------------------------------------------------------

const T = {
  // One-shot intro, seconds after load: the name is typed by ~0.9 s and the
  // first profile box pops at ~1 s, together with the first AF lock.
  typeStart: 0.25,
  typeStep: 0.055,
  detectStart: 0.95,
  detectStep: 0.2,
  // Shutter blink around each photo change.
  blinkClose: -0.16,
  blinkShut: -0.03,
  blinkOpen: 0.05,
  blinkClear: 0.24,
  // Per photo.
  hunt: 0.22,
  lock: 1.0,
  scan: 1.08,
  subject: 1.55,
  hudOut: 5.45,
  hudGone: 5.7,
  redetect: 0.3,
  exifIn: 0.14,
  exifStagger: 0.06,
  exifOut: 5.6,
} as const;

/** Ken Burns progress over one photo: most of the move happens before AF lock, then it settles. */
const KB_CURVE: Array<[number, number]> = [
  [0, 0],
  [0.5, 0.4],
  [1, 0.68],
  [T.subject, 0.85],
  [2.5, 0.94],
  [4, 0.985],
  [SEG - EPS, 1],
];

function kbProgressAt(t: number): number {
  let prev = KB_CURVE[0] ?? [0, 0];
  for (const point of KB_CURVE) {
    if (point[0] >= t) {
      const span = point[0] - prev[0];
      return span <= 0 ? point[1] : prev[1] + ((point[1] - prev[1]) * (t - prev[0])) / span;
    }
    prev = point;
  }
  return 1;
}

/** Progress when the subject box appears; the box must fit from here to the settled state. */
const SHOWN_P = kbProgressAt(T.subject);

// ---------------------------------------------------------------------------
// Photo framing: where each photo sits, its subject and its move. Picked by
// looking at assets/photos/*.jpg. Unknown photos get a centred cover framing.
// ---------------------------------------------------------------------------

type Motion = { kind: "tilt"; dy: number } | { kind: "push"; zoom: number };

export interface Framing {
  /** Photo pixels → canvas units. */
  scale: number;
  /** Canvas position of the photo's top-left corner in the settled state. */
  ox: number;
  oy: number;
  /** Subject bounds in photo pixels. */
  subject: [number, number, number, number];
  /** Where the AF brackets lock, in canvas units. Push moves zoom around it. */
  af: [number, number];
  motion: Motion;
  /** "hand": placed by eye for this photo. "auto": centred fallback for a photo nobody framed yet. */
  source: "hand" | "auto";
}

const FRAMINGS: Record<string, Omit<Framing, "source">> = {
  // Portrait tower: tilt up from the shaft to the cantilevered top.
  architecture: {
    scale: W / 932,
    ox: 0,
    oy: -400,
    subject: [213, 380, 728, 1105],
    af: [640, 240],
    motion: { kind: "tilt", dy: 200 },
  },
  // The sticker on the white pole.
  sticker: {
    scale: 1.15,
    ox: -126,
    oy: -321,
    subject: [668, 376, 768, 566],
    af: [700, 222],
    motion: { kind: "push", zoom: 0.06 },
  },
  // Roast-beef donburi, focused on the yolk.
  donburi: {
    scale: 0.96,
    ox: -40,
    oy: -254,
    subject: [535, 334, 910, 668],
    af: [649, 189],
    motion: { kind: "push", zoom: 0.03 },
  },
};

function covers(f: Omit<Framing, "source">, photo: PhotoMeta): boolean {
  const w = photo.width * f.scale;
  const h = photo.height * f.scale;
  const lift = f.motion.kind === "tilt" ? f.motion.dy : 0;
  return f.ox <= 0 && f.oy <= 0 && f.ox + w >= W && f.oy - lift + h >= H;
}

function framingFor(photo: PhotoMeta): Framing {
  const known = FRAMINGS[photo.id];
  if (known && covers(known, photo)) return { ...known, source: "hand" };
  const scale = Math.max(W / photo.width, H / photo.height);
  const ox = (W - photo.width * scale) / 2;
  const oy = (H - photo.height * scale) / 2;
  const subject: Framing["subject"] = [photo.width * 0.35, photo.height * 0.2, photo.width * 0.65, photo.height * 0.55];
  const af: [number, number] = [ox + ((subject[0] + subject[2]) / 2) * scale, oy + ((subject[1] + subject[3]) / 2) * scale];
  return { scale, ox, oy, subject, af, motion: { kind: "push", zoom: 0.05 }, source: "auto" };
}

/** Ken Burns state at progress p: canvas = translate(tx,ty) scale(s) translate(-cx,-cy) · placed. */
function kenBurns(f: Framing, p: number): { tx: number; ty: number; s: number; cx: number; cy: number } {
  if (f.motion.kind === "tilt") return { tx: 0, ty: -f.motion.dy * (1 - p), s: 1, cx: 0, cy: 0 };
  const [cx, cy] = f.af;
  return { tx: cx, ty: cy, s: 1 + f.motion.zoom * p, cx, cy };
}

const mapX = (f: Framing, p: number, x: number) => {
  const k = kenBurns(f, p);
  return k.tx + k.s * (x - k.cx);
};
const mapY = (f: Framing, p: number, y: number) => {
  const k = kenBurns(f, p);
  return k.ty + k.s * (y - k.cy);
};
const unmapX = (f: Framing, p: number, x: number) => {
  const k = kenBurns(f, p);
  return k.cx + (x - k.tx) / k.s;
};
const unmapY = (f: Framing, p: number, y: number) => {
  const k = kenBurns(f, p);
  return k.cy + (y - k.ty) / k.s;
};
const mapBox = (f: Framing, p: number, b: Box): Box => ({ x0: mapX(f, p, b.x0), y0: mapY(f, p, b.y0), x1: mapX(f, p, b.x1), y1: mapY(f, p, b.y1) });

// ---------------------------------------------------------------------------
// Layout (pure, exported for tests)
// ---------------------------------------------------------------------------

/** Where photo-space HUD may draw: the same in both themes, inside the print's photo window too. */
export const SAFE_AREA: Box = { x0: 36, y0: 62, x1: W - 36, y1: H - 24 };
/** The viewfinder frame corners (dark theme), inset and arm length. */
export const CORNER_MARK = { inset: 16, arm: 24 } as const;
/** Clearance between subject boxes and the caption zones. */
const SUBJECT_GAP = 10;

const NAME = {
  /** Left edge of the outermost profile box, clear of the bottom-left frame corner. */
  outerLeft: 46,
  baseline: 524,
  max: 84,
  min: 40,
  tracking: -1,
  roleBaseline: 566,
  roleMax: 28,
  roleMin: 18,
  roleGap: 16,
  locBaseline: 602,
  locMax: 20,
  locMin: MIN_TEXT_SIZE,
  locIndent: 24,
  handleGap: 30,
  padX: 12,
  padTop: 10,
  padBottom: 10,
  caretGap: 10,
  caretW: 12,
  caretPad: 22,
  spread: 6,
  chipMax: 21,
  chipMin: MIN_TEXT_SIZE,
  chipPadX: 6,
  chipGap: 3,
  /** A chip leaves this much of its box edge visible after it. */
  chipTail: 6,
  zonePad: 14,
  zonePadTop: 10,
} as const;

const EXIF = {
  right: W - 40,
  valueSize: 23,
  headerSize: MIN_TEXT_SIZE,
  cameraSize: MIN_TEXT_SIZE,
  altMax: 18,
  altMin: MIN_TEXT_SIZE,
  colGap: 22,
  /** Space between the name zone and the readout text. */
  gap: 12,
  altY: 522,
  cameraY: 548,
  headerY: 574,
  valueY: 602,
  zonePad: 14,
  zonePadTop: 10,
} as const;

const chipHeight = (size: number) => Math.round(size * 1.34);
const chipWidth = (label: string, size: number) => monoWidth(label, size) + NAME.chipPadX * 2;
const SUBJECT_CHIP = NAME.chipMax;

export interface TextLine {
  text: string;
  /** Left edge (also for right-aligned text). */
  x: number;
  y: number;
  size: number;
  width: number;
}

export interface Chip {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NameLayout {
  size: number;
  chars: string[];
  glyphX: number[];
  baseline: number;
  capTop: number;
  caret: Box;
  /** Japanese name, role line, location, handle. */
  lines: TextLine[];
  pin: { x: number; y: number };
  /** One per detection, innermost first. */
  boxes: Box[];
  chips: Chip[];
  chipSize: number;
  zone: Box;
}

interface ExifField {
  header: string;
  value: (p: PhotoMeta) => string;
}

const EXIF_FIELDS: ExifField[] = [
  { header: "FOCAL", value: (p) => p.focalLength },
  { header: "APERTURE", value: (p) => p.aperture ?? "—" },
  { header: "SHUTTER", value: (p) => p.shutter ?? "—" },
  { header: "ISO", value: (p) => (p.iso === null ? "—" : String(p.iso)) },
];

const cameraLine = (p: PhotoMeta) => `${p.camera}  ${p.lens}`;

export interface ExifLayout {
  altSize: number;
  /** Right edge of each column, in EXIF_FIELDS order. */
  columns: number[];
  /** Every text the readout can show, for fit checks. */
  lines: TextLine[];
  zone: Box;
}

export interface SubjectLayout {
  /** Box in the photo's placed coordinates (inside its Ken Burns group). */
  box: Box;
  /** Label chip in placed coordinates: above the box, or inside when the top is tight. */
  label: Chip & { inside: boolean };
  /** Canvas extents when the box appears and in the settled (static) state. */
  shown: Box;
  settled: Box;
  labelShown: Box;
  labelSettled: Box;
  af: [number, number];
}

export interface HeroLayout {
  name: NameLayout;
  exif: ExifLayout;
  /** Caption zones: name block, EXIF readout. They never overlap. */
  zones: Box[];
  framings: Framing[];
  subjects: SubjectLayout[];
}

/** Largest size in [min, max] (0.5 steps) that passes `ok`, or a clear error naming the field. */
function fit(field: string, max: number, min: number, ok: (size: number) => boolean): number {
  for (let size = max; size >= min; size -= 0.5) if (ok(size)) return size;
  throw new Error(`renderHero: ${field} is too long to fit the hero even at ${min} units; shorten it`);
}

function nameGlyphs(chars: string[], x0: number, size: number): { glyphX: number[]; right: number } {
  const glyphX: number[] = [];
  let cursor = x0;
  chars.forEach((ch, i) => {
    glyphX.push(cursor);
    const kern = DISPLAY_BOLD_KERN[ch + (chars[i + 1] ?? "")] ?? 0;
    cursor += ((displayAdvance(ch, true) + kern) * size) / 1000 + NAME.tracking;
  });
  return { glyphX, right: cursor - NAME.tracking };
}

function layoutName(profile: Profile, maxZoneRight: number): NameLayout {
  const L = NAME;
  const levels = Math.max(1, profile.detections.length);
  const S = L.spread;
  const x0 = L.outerLeft + (levels - 1) * S + L.padX;
  /** Right edge allowed for the outermost box. */
  const limit = maxZoneRight - L.zonePad;
  const chars = [...profile.name.toUpperCase()];
  /** How far the outermost box reaches past the content of `level` (box 0 hugs the name, each outer box adds S). */
  const outside = (level: number) => (level === 0 ? levels - 1 : Math.max(0, levels - level)) * S;

  const size = fit("profile.name", L.max, L.min, (s) => {
    return nameGlyphs(chars, x0, s).right + L.caretGap + L.caretW + L.caretPad + outside(0) <= limit;
  });
  const roleRight = (r: number) => x0 + displayWidth(profile.nameJa, r) + L.roleGap + displayWidth(profile.roleLine, r);
  const roleSize = fit("profile.roleLine", L.roleMax, L.roleMin, (r) => roleRight(r) + L.padX + outside(1) <= limit);
  const handle = `@${profile.handle}`;
  const locX = x0 + L.locIndent;
  const locRight = (z: number) => locX + monoWidth(profile.location, z) + L.handleGap + monoWidth(handle, z);
  const locSize = fit("profile.location and handle", L.locMax, L.locMin, (z) => locRight(z) + L.padX + outside(2) <= limit);

  const { glyphX, right: nameRight } = nameGlyphs(chars, x0, size);
  const capTop = L.baseline - DISPLAY_CAP * size;
  const caret: Box = { x0: nameRight + L.caretGap, y0: capTop, x1: nameRight + L.caretGap + L.caretW, y1: L.baseline };
  const jaWidth = displayWidth(profile.nameJa, roleSize);
  const lines: TextLine[] = [
    { text: profile.nameJa, x: x0, y: L.roleBaseline, size: roleSize, width: jaWidth },
    {
      text: profile.roleLine,
      x: x0 + jaWidth + L.roleGap,
      y: L.roleBaseline,
      size: roleSize,
      width: displayWidth(profile.roleLine, roleSize),
    },
    { text: profile.location, x: locX, y: L.locBaseline, size: locSize, width: monoWidth(profile.location, locSize) },
    {
      text: handle,
      x: locX + monoWidth(profile.location, locSize) + L.handleGap,
      y: L.locBaseline,
      size: locSize,
      width: monoWidth(handle, locSize),
    },
  ];

  // Nested boxes: innermost wraps the name, then + role line, then + location.
  const contentRight = [caret.x1 + L.caretPad, roleRight(roleSize) + L.padX, locRight(locSize) + L.padX];
  const bottoms = [L.baseline + L.padBottom, L.roleBaseline + 10, L.locBaseline + 10];
  const bottomLimit = H - CORNER_MARK.inset - 10;
  const baseBoxes: Box[] = [];
  for (let i = 0; i < levels; i++) {
    const prev = baseBoxes[i - 1];
    baseBoxes.push({
      x0: x0 - L.padX - i * S,
      y0: capTop - L.padTop - i * S,
      x1: prev ? Math.max(prev.x1, contentRight[i] ?? 0) + S : (contentRight[0] ?? 0),
      y1: Math.min(Math.max(bottoms[i] ?? 0, prev ? prev.y1 + S : 0), bottomLimit),
    });
  }

  // Labels side by side, each on its own box's top edge; boxes stretch to hold them.
  const labels = profile.detections.map((d) => `${d.label} ${d.confidence.toFixed(2)}`);
  const place = (c: number): { boxes: Box[]; chips: Chip[] } => {
    const boxes = baseBoxes.map((b) => ({ ...b }));
    const h = chipHeight(c);
    let x = boxes[0]?.x0 ?? x0;
    const chips = labels.map((label, i) => {
      const w = chipWidth(label, c);
      const box = boxes[i] as Box;
      const chip: Chip = { label, x, y: box.y0 - h, w, h };
      x += w + L.chipGap;
      box.x1 = Math.max(box.x1, chip.x + w + L.chipTail);
      return chip;
    });
    for (let i = 1; i < boxes.length; i++) {
      const box = boxes[i] as Box;
      box.x1 = Math.max(box.x1, (boxes[i - 1] as Box).x1 + S);
    }
    return { boxes, chips };
  };
  const chipSize = fit("profile.detections", L.chipMax, L.chipMin, (c) => {
    const { boxes } = place(c);
    return (boxes[boxes.length - 1]?.x1 ?? 0) <= limit;
  });
  const { boxes, chips } = place(chipSize);
  const outer = boxes[boxes.length - 1] as Box;
  const top = Math.min(...chips.map((c) => c.y), outer.y0);
  return {
    size,
    chars,
    glyphX,
    baseline: L.baseline,
    capTop,
    caret,
    lines,
    pin: { x: x0, y: L.locBaseline },
    boxes,
    chips,
    chipSize,
    zone: { x0: 0, y0: top - L.zonePadTop, x1: outer.x1 + L.zonePad, y1: H },
  };
}

interface ExifNeeds {
  table: number;
  camera: number;
  /** Widest Japanese caption per unit of font size. */
  altPerUnit: number;
  colWidths: number[];
}

function exifNeeds(photos: readonly PhotoMeta[]): ExifNeeds {
  const colWidths = EXIF_FIELDS.map((field) =>
    Math.max(monoWidth(field.header, EXIF.headerSize), ...photos.map((p) => monoWidth(field.value(p), EXIF.valueSize))),
  );
  return {
    table: colWidths.reduce((a, b) => a + b, 0) + EXIF.colGap * (colWidths.length - 1),
    camera: Math.max(0, ...photos.map((p) => monoWidth(cameraLine(p), EXIF.cameraSize))),
    altPerUnit: Math.max(0, ...photos.map((p) => displayWidth(p.alt, 1))),
    colWidths,
  };
}

function layoutExif(photos: readonly PhotoMeta[], needs: ExifNeeds, nameZoneRight: number): ExifLayout {
  const left = nameZoneRight + EXIF.gap;
  const avail = EXIF.right - left;
  if (needs.table > avail || needs.camera > avail) {
    throw new Error("renderHero: the EXIF readout (camera, lens or exposure values) is too wide; shorten data/photos.ts");
  }
  const altSize = fit("a photo alt caption", EXIF.altMax, EXIF.altMin, (a) => needs.altPerUnit * a <= avail);

  const columns: number[] = [];
  let right = EXIF.right;
  for (let i = EXIF_FIELDS.length - 1; i >= 0; i--) {
    columns[i] = right;
    right -= (needs.colWidths[i] ?? 0) + EXIF.colGap;
  }
  const lines: TextLine[] = [];
  const add = (text: string, rightEdge: number, y: number, size: number, width: number) =>
    lines.push({ text, x: rightEdge - width, y, size, width });
  for (const p of photos) {
    add(p.alt, EXIF.right, EXIF.altY, altSize, displayWidth(p.alt, altSize));
    add(cameraLine(p), EXIF.right, EXIF.cameraY, EXIF.cameraSize, monoWidth(cameraLine(p), EXIF.cameraSize));
    EXIF_FIELDS.forEach((field, i) => {
      const value = field.value(p);
      add(value, columns[i] ?? EXIF.right, EXIF.valueY, EXIF.valueSize, monoWidth(value, EXIF.valueSize));
    });
  }
  EXIF_FIELDS.forEach((field, i) =>
    add(field.header, columns[i] ?? EXIF.right, EXIF.headerY, EXIF.headerSize, monoWidth(field.header, EXIF.headerSize)),
  );
  const textLeft = Math.min(...lines.map((l) => l.x));
  return {
    altSize,
    columns,
    lines,
    zone: { x0: Math.max(textLeft - EXIF.zonePad, nameZoneRight), y0: EXIF.altY - altSize - EXIF.zonePadTop, x1: W, y1: H },
  };
}

/** Lowest canvas y a box spanning [x0, x1] may reach above the caption zones. */
function floorUnder(x0: number, x1: number, zones: readonly Box[]): number {
  let floor = SAFE_AREA.y1;
  for (const z of zones) if (x1 > z.x0 - SUBJECT_GAP && x0 < z.x1 + SUBJECT_GAP) floor = Math.min(floor, z.y0 - SUBJECT_GAP);
  return floor;
}

/**
 * The subject box is the photo's subject clamped to the open photo area for the
 * whole time it is shown (it rides the Ken Burns move), so it always has four
 * real edges: a subject that runs behind the captions gets a bottom edge above them.
 */
function layoutSubject(photo: PhotoMeta, f: Framing, zones: readonly Box[]): SubjectLayout {
  const [sx0, sy0, sx1, sy1] = f.subject;
  const box: Box = { x0: f.ox + sx0 * f.scale, y0: f.oy + sy0 * f.scale, x1: f.ox + sx1 * f.scale, y1: f.oy + sy1 * f.scale };
  const progress = [SHOWN_P, 1];
  for (const p of progress) {
    box.x0 = Math.max(box.x0, unmapX(f, p, SAFE_AREA.x0));
    box.x1 = Math.min(box.x1, unmapX(f, p, SAFE_AREA.x1));
    box.y0 = Math.max(box.y0, unmapY(f, p, SAFE_AREA.y0));
  }
  for (const p of progress) {
    const m = mapBox(f, p, box);
    box.y1 = Math.min(box.y1, unmapY(f, p, floorUnder(m.x0, m.x1, zones)));
  }
  if (box.x1 - box.x0 < 40 || box.y1 - box.y0 < 40) {
    throw new Error(`renderHero: no room for the ${photo.id} subject box above the captions; adjust its framing in src/render/hero.ts`);
  }
  const h = chipHeight(SUBJECT_CHIP);
  const w = chipWidth(photo.subject, SUBJECT_CHIP);
  const above = progress.every((p) => mapY(f, p, box.y0 - h) >= SAFE_AREA.y0);
  const label = { label: photo.subject, x: box.x0, y: above ? box.y0 - h : box.y0, w, h, inside: !above };
  const labelBox: Box = { x0: label.x, y0: label.y, x1: label.x + w, y1: label.y + h };
  return {
    box,
    label,
    shown: mapBox(f, SHOWN_P, box),
    settled: mapBox(f, 1, box),
    labelShown: mapBox(f, SHOWN_P, labelBox),
    labelSettled: mapBox(f, 1, labelBox),
    af: f.af,
  };
}

export function layoutHero(profile: Profile, photos: readonly PhotoMeta[]): HeroLayout {
  const needs = exifNeeds(photos);
  const exifMin = Math.max(needs.table, needs.camera, needs.altPerUnit * EXIF.altMin);
  const name = layoutName(profile, EXIF.right - exifMin - EXIF.gap);
  const exif = layoutExif(photos, needs, name.zone.x1);
  const zones = [name.zone, exif.zone];
  const framings = photos.map(framingFor);
  const subjects = photos.map((photo, k) => layoutSubject(photo, framings[k] as Framing, zones));
  return { name, exif, zones, framings, subjects };
}

// ---------------------------------------------------------------------------
// Text and fonts
// ---------------------------------------------------------------------------

const ROLE_CLASS: Record<FontRole, string> = { mono: "fm", "mono-bold": "fmb", display: "fd", "display-bold": "fdb" };
const ROLE_ORDER: FontRole[] = ["mono", "mono-bold", "display", "display-bold"];

/** Builds <text> elements and remembers which glyphs each font role must cover. */
class Typesetter {
  private readonly glyphs = new Map<FontRole, Set<string>>();

  text(role: FontRole, content: string, attrs: Record<string, string | number | undefined>, extraClass = ""): string {
    const set = this.glyphs.get(role) ?? new Set<string>();
    for (const ch of content) set.add(ch);
    this.glyphs.set(role, set);
    const cls = extraClass ? `${ROLE_CLASS[role]} ${extraClass}` : ROLE_CLASS[role];
    return el("text", { class: cls, ...attrs }, esc(content));
  }

  async fontCss(ctx: RenderContext): Promise<string> {
    let out = "";
    for (const role of ROLE_ORDER) {
      const set = this.glyphs.get(role);
      if (set) out += await ctx.assets.fontCss(role, [...set].sort().join(""));
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Keyframe tracks
// ---------------------------------------------------------------------------

/** Piecewise-linear values over a looping timeline: [seconds, values]. */
type Track = Array<[number, number[]]>;

/** Evaluates a looping piecewise-linear track at time t (seconds within the cycle). */
function evalTrack(points: Track, t: number, cycle: number): number[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];
  let prev: [number, number[]] = [last[0] - cycle, last[1]];
  let next: [number, number[]] = [first[0] + cycle, first[1]];
  for (const p of sorted) {
    if (p[0] <= t) prev = p;
    else {
      next = p;
      break;
    }
  }
  const span = next[0] - prev[0];
  const k = span <= 0 ? 0 : (t - prev[0]) / span;
  return prev[1].map((v, i) => v + ((next[1][i] ?? v) - v) * k);
}

/**
 * Keyframe stops for a track written in local time. `offset` is where local
 * time 0 sits on the cycle; times wrap, and 100% always repeats 0% (no seam).
 */
function keyframeStops(cycle: number, offset: number, track: Track, fmt: (v: number[]) => string): string {
  const snap = (t: number) => {
    const r = Math.round(mod(t, cycle) * 1000) / 1000;
    return r >= cycle ? 0 : r;
  };
  const points: Track = track.map(([t, v]) => [snap(offset + t), v]);
  const times = [...new Set([0, ...points.map((p) => p[0])])].sort((a, b) => a - b);
  const stops = times.map((t) => `${pct(t / cycle)}{${fmt(evalTrack(points, t, cycle))}}`);
  stops.push(`100%{${fmt(evalTrack(points, 0, cycle))}}`);
  return stops.join("");
}

const opacityOf = (v: number[]) => `opacity:${n(v[0] ?? 0)}`;
const translateOf = (v: number[]) => `transform:translate(${px(v[0] ?? 0)},${px(v[1] ?? 0)})`;
const translateYOf = (v: number[]) => `transform:translateY(${px(v[0] ?? 0)})`;

/** On from `from` to `to` (local seconds) with short ramps either side. */
function shown(from: number, to: number, rampIn = EPS, rampOut = EPS): Track {
  return [
    [from - rampIn, [0]],
    [from, [1]],
    [to, [1]],
    [to + rampOut, [0]],
  ];
}

/** Visible for exactly one photo's segment (switching under the shutter blink). */
const onSegment: Track = [
  [-EPS, [0]],
  [0, [1]],
  [SEG - EPS, [1]],
  [SEG, [0]],
];

// ---------------------------------------------------------------------------
// Theme interpretation
// ---------------------------------------------------------------------------

interface Look {
  /** Area the photo is printed into. */
  photo: Box;
  /** "cinema": gradients over a full-bleed photo. "print": caption areas are plain paper. */
  caption: "cinema" | "print";
  /** HUD stroke on top of photos, and the keyline under it for contrast. */
  ink: string;
  halo: string;
  haloOpacity: number;
  /** Text on filled detection chips. */
  chipInk: string;
  grid: string;
  /** Paint for the caption mask (alpha mask, so any opaque theme color works). */
  maskOn: string;
  maskFeather: number;
  /** Capture flash and shutter-blink curtain. */
  flash: string;
  flashOpacity: number;
  curtain: string;
}

function lookFor(theme: Theme): Look {
  if (theme.name === "light") {
    return {
      photo: { x0: 20, y0: 58, x1: W - 20, y1: H - 20 },
      caption: "print",
      ink: theme.text,
      halo: theme.surface,
      haloOpacity: 0.85,
      chipInk: theme.surface,
      grid: theme.surface,
      maskOn: theme.surface,
      maskFeather: 0,
      flash: theme.surface,
      flashOpacity: 0.45,
      curtain: theme.bg,
    };
  }
  return {
    photo: { x0: 0, y0: 0, x1: W, y1: H },
    caption: "cinema",
    ink: theme.text,
    halo: theme.bg,
    haloOpacity: 0.55,
    chipInk: theme.bg,
    grid: theme.text,
    maskOn: theme.text,
    maskFeather: 22,
    flash: theme.text,
    flashOpacity: 0.28,
    curtain: theme.bg,
  };
}

/** Collects CSS and <defs> while the sections are built. */
class Doc {
  css = "";
  defs = "";
  readonly t = new Typesetter();
  readonly cycle: number;
  readonly count: number;
  private readonly frames = new Map<string, string>();

  constructor(
    readonly theme: Theme,
    readonly look: Look,
    readonly layout: HeroLayout,
    count: number,
  ) {
    this.count = Math.max(count, 1);
    this.cycle = SEG * this.count;
  }

  /**
   * Registers a looping animation on the shared cycle and returns its class name.
   * Identical tracks (same stops and easing) share one @keyframes.
   */
  loop(name: string, offset: number, track: Track, fmt: (v: number[]) => string, timing = "linear"): string {
    const stops = keyframeStops(this.cycle, offset - PHASE, track, fmt);
    const key = `${timing}|${stops}`;
    const existing = this.frames.get(key);
    if (existing) return existing;
    this.frames.set(key, name);
    this.css += `@keyframes ${name}{${stops}}.${name}{animation:${name} ${this.cycle}s ${timing} infinite}`;
    return name;
  }

  /** The same track repeated in every photo's segment. */
  perSegment(name: string, track: Track, fmt: (v: number[]) => string, timing = "linear"): string {
    const all: Track = [];
    for (let k = 0; k < this.count; k++) for (const [t, v] of track) all.push([k * SEG + t, v]);
    return this.loop(name, 0, all, fmt, timing);
  }
}

const cls = (...names: Array<string | undefined | false>) => names.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Drawing pieces
// ---------------------------------------------------------------------------

function bracketPath(w: number, h: number, arm: number): string {
  const x = w / 2;
  const y = h / 2;
  return [
    `M${-x} ${-y + arm}V${-y}H${-x + arm}`,
    `M${x - arm} ${-y}H${x}V${-y + arm}`,
    `M${x} ${y - arm}V${y}H${x - arm}`,
    `M${-x + arm} ${y}H${-x}V${y - arm}`,
  ].join("");
}

/** A stroke drawn over a soft keyline so it reads on any photo. */
function keylined(doc: Doc, shape: "rect" | "path", attrs: Record<string, string | number>, color: string, width: number): string {
  const base = { fill: "none", ...attrs };
  return (
    el(shape, { ...base, stroke: doc.look.halo, "stroke-opacity": doc.look.haloOpacity, "stroke-width": width + 3 }) +
    el(shape, { ...base, stroke: color, "stroke-width": width })
  );
}

/** A YOLO-style label chip. */
function chip(doc: Doc, c: Chip, size: number, fill: string): string {
  return (
    el("rect", { x: n(c.x), y: n(c.y), width: n(c.w), height: c.h, fill }) +
    doc.t.text("mono-bold", c.label, {
      x: n(c.x + NAME.chipPadX),
      y: n(c.y + c.h / 2 + (MONO_CAP * size) / 2),
      "font-size": size,
      fill: doc.look.chipInk,
    })
  );
}

// ---------------------------------------------------------------------------
// Photos, detections, AF
// ---------------------------------------------------------------------------

/** Ken Burns for photo k: the settled transform as attribute plus its animation class. */
function kenBurnsMove(doc: Doc, f: Framing, k: number): { attr: string; cls: string } {
  const fmtState = (p: number) => {
    const s = kenBurns(f, p);
    return [s.tx, s.ty, s.s];
  };
  const end = kenBurns(f, 1);
  const attr = `translate(${n(end.tx)} ${n(end.ty)}) scale(${ratio(end.s)}) translate(${n(-end.cx)} ${n(-end.cy)})`;
  const anim = doc.loop(
    `kbm${k}`,
    k * SEG,
    KB_CURVE.map(([t, p]) => [t, fmtState(p)]),
    (v) => `transform:translate(${px(v[0] ?? 0)},${px(v[1] ?? 0)}) scale(${ratio(v[2] ?? 1)}) translate(${px(-end.cx)},${px(-end.cy)})`,
  );
  return { attr, cls: cls("kb", `kb-${k}`, anim) };
}

/** Detector scan line that sweeps the subject box after AF lock. */
function scanLine(doc: Doc, box: Box, k: number): string {
  const trail = Math.min(70, (box.y1 - box.y0) * 0.45);
  doc.defs += el("clipPath", { id: `cp-scan${k}` }, el("rect", rectOf(box)));
  const visible = doc.loop(`scv${k}`, k * SEG, shown(T.scan, T.subject - 0.04, EPS, 0.12), opacityOf);
  const move = doc.loop(
    `scm${k}`,
    k * SEG,
    [
      [T.scan, [box.y0]],
      [T.subject, [box.y1]],
    ],
    translateYOf,
    "cubic-bezier(.45,0,.55,1)",
  );
  const width = box.x1 - box.x0;
  return el(
    "g",
    { class: cls("scan", `scan-${k}`, visible), opacity: 0, "clip-path": `url(#cp-scan${k})` },
    el(
      "g",
      { class: move, transform: `translate(0 ${n(box.y0)})` },
      el("rect", { x: n(box.x0), y: n(-trail), width: n(width), height: n(trail), fill: "url(#g-scan)" }) +
        el("rect", { x: n(box.x0), y: -1.5, width: n(width), height: 3, fill: doc.theme.lock }),
    ),
  );
}

function subjectBox(doc: Doc, s: SubjectLayout, k: number): string {
  const visible = doc.loop(
    `sbv${k}`,
    k * SEG,
    [
      [T.subject - EPS, [0]],
      [T.subject, [1]],
      [T.subject + 0.06, [0.25]],
      [T.subject + 0.12, [1]],
      [T.hudOut, [1]],
      [T.hudGone, [0]],
    ],
    opacityOf,
  );
  return el(
    "g",
    { class: cls("subject", `subject-${k}`, visible), opacity: k > 0 ? 0 : undefined },
    keylined(doc, "rect", { ...rectOf(s.box), "vector-effect": "non-scaling-stroke" }, doc.theme.lock, 2.5) +
      chip(doc, s.label, SUBJECT_CHIP, doc.theme.lock),
  );
}

/**
 * Photo stack and the per-photo detection layers. Photos switch instantly under
 * the shutter blink, so there is never a double exposure; photo 0 is the base.
 */
function photoLayers(doc: Doc, photos: PhotoMeta[], uris: string[]): { images: string; detections: string } {
  let images = "";
  let detections = "";
  photos.forEach((photo, k) => {
    const f = doc.layout.framings[k] as Framing;
    const s = doc.layout.subjects[k] as SubjectLayout;
    const id = `ph-${photo.id}`;
    doc.defs += el("image", {
      id,
      x: n(f.ox),
      y: n(f.oy),
      width: n(photo.width * f.scale),
      height: n(photo.height * f.scale),
      preserveAspectRatio: "xMidYMid slice",
      href: uris[k],
    });
    const kb = kenBurnsMove(doc, f, k);
    const fade = k > 0 ? doc.loop(`phf${k}`, k * SEG, onSegment, opacityOf) : undefined;
    images += el(
      "g",
      { class: cls("photo", `photo-${k}`, fade), opacity: k > 0 ? 0 : undefined },
      el("g", { class: kb.cls, transform: kb.attr }, el("use", { href: `#${id}` })),
    );
    detections += el("g", { class: kb.cls, transform: kb.attr }, scanLine(doc, s.box, k) + subjectBox(doc, s, k));
  });
  return { images, detections };
}

/** AF brackets: fixed in the frame, jump to each photo's AF point under the blink, hunt, then lock. */
function afBrackets(doc: Doc): string {
  const points = doc.layout.subjects.map((s) => s.af);
  const [ax, ay] = points[0] ?? [W / 2, H / 2];
  const moves = new Set(points.map((p) => p.join(","))).size > 1;
  const position = moves
    ? doc.loop(
        "afpos",
        0,
        points.flatMap((p, k): Track => [
          [k * SEG, [...p]],
          [(k + 1) * SEG - EPS, [...p]],
        ]),
        translateOf,
      )
    : undefined;
  const hunt = doc.perSegment(
    "hunt",
    [
      [T.hunt - EPS, [0, 0, 1.5]],
      [T.hunt, [0, 0, 1.5]],
      [0.38, [-7, 4, 0.82]],
      [0.54, [5, -3, 1.2]],
      [0.7, [-3, 2, 0.92]],
      [0.84, [2, -1, 1.08]],
      [0.93, [-1, 1, 0.97]],
      [T.lock, [0, 0, 1]],
      [T.lock + 0.07, [0, 0, 0.9]],
      [T.lock + 0.2, [0, 0, 1]],
    ],
    (v) => `transform:translate(${px(v[0] ?? 0)},${px(v[1] ?? 0)}) scale(${n(v[2] ?? 1)})`,
    "ease-in-out",
  );
  const visible = doc.perSegment("afv", shown(T.hunt, T.hudOut, EPS, T.hudGone - T.hudOut), opacityOf);
  const hunting = doc.perSegment("afw", shown(T.hunt, T.lock), opacityOf);
  const locked = doc.perSegment("afl", shown(T.lock, T.hudGone), opacityOf);
  const d = bracketPath(108, 80, 22);
  return el(
    "g",
    { class: position, transform: `translate(${n(ax)} ${n(ay)})` },
    el(
      "g",
      { class: visible },
      el(
        "g",
        { class: cls("afh", hunt) },
        el("g", { class: cls("af-hunt", hunting), opacity: 0 }, keylined(doc, "path", { d }, doc.look.ink, 3)) +
          el(
            "g",
            { class: cls("af-lock", locked) },
            keylined(doc, "path", { d }, doc.theme.lock, 3) + el("circle", { r: 3, fill: doc.theme.lock }),
          ),
      ),
    ),
  );
}

/** Soft capture flash over the photo at the moment AF locks: the shutter-click beat. */
function captureFlash(doc: Doc): string {
  const flash = doc.perSegment(
    "flsh",
    [
      [T.lock - EPS, [0]],
      [T.lock + 0.03, [doc.look.flashOpacity]],
      [T.lock + 0.3, [0]],
    ],
    opacityOf,
  );
  return el("rect", { class: cls("flash", flash), opacity: 0, ...rectOf(doc.look.photo), fill: doc.look.flash });
}

/** Shutter blink: two curtains meet at each photo change and part again. Translate only. */
function shutterCurtains(doc: Doc): string {
  const p = doc.look.photo;
  const half = (p.y1 - p.y0) / 2 + 1;
  const track = (dir: 1 | -1): Track => [
    [T.blinkClose, [0]],
    [T.blinkShut, [dir * half]],
    [T.blinkOpen, [dir * half]],
    [T.blinkClear, [0]],
  ];
  const top = doc.perSegment("ctop", track(1), translateYOf, "ease-in-out");
  const bottom = doc.perSegment("cbot", track(-1), translateYOf, "ease-in-out");
  const width = p.x1 - p.x0;
  return (
    el("rect", { class: cls("curtain-top", top), x: n(p.x0), y: n(p.y0 - half), width: n(width), height: n(half), fill: doc.look.curtain }) +
    el("rect", { class: cls("curtain-bottom", bottom), x: n(p.x0), y: n(p.y1), width: n(width), height: n(half), fill: doc.look.curtain })
  );
}

/** Rule-of-thirds grid that flashes while the AF hunts (masked off the captions). */
function thirdsGrid(doc: Doc): string {
  const p = doc.look.photo;
  const lines = [W / 3, (2 * W) / 3]
    .map((x) => el("line", { x1: n(x), y1: p.y0, x2: n(x), y2: p.y1 }))
    .concat([H / 3, (2 * H) / 3].map((y) => el("line", { x1: p.x0, y1: n(y), x2: p.x1, y2: n(y) })))
    .join("");
  const flash = doc.perSegment(
    "grid",
    [
      [T.hunt, [0]],
      [0.32, [0.55]],
      [0.55, [0.25]],
      [0.72, [0.55]],
      [0.95, [0.4]],
      [1.15, [0]],
    ],
    opacityOf,
  );
  return el("g", { class: flash, opacity: 0, stroke: doc.look.grid, "stroke-width": 1.2 }, lines);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

const TOP_BASELINE = 40;
const HUD_RIGHT = W - 40;

/** Top row: REC, frame counter + progress, mode, focus confirm, exposure meter, card, battery. */
function topBar(doc: Doc): string {
  const { theme, t, count } = doc;
  const y = TOP_BASELINE;
  let out = el("circle", { class: "rec", cx: 46, cy: y - 7, r: 7.5, fill: theme.accent });
  doc.css += `@keyframes rec{0%{opacity:1}50%{opacity:.15}}.rec{animation:rec 1s step-end infinite}`;
  out += t.text("mono", "REC", { x: 62, y, "font-size": 20, fill: theme.text });

  // Frame counter 01/03: the digits switch under the shutter blink.
  const size = 20;
  const cx = 116;
  for (let k = 0; k < count; k++) {
    const swap = count > 1 ? doc.loop(`cnt${k}`, k * SEG, onSegment, opacityOf) : undefined;
    out += t.text(
      "mono",
      String(k + 1).padStart(2, "0"),
      { x: cx, y, "font-size": size, fill: theme.text, opacity: k > 0 ? 0 : undefined },
      cls("counter", `counter-${k}`, swap),
    );
  }
  const total = `/${String(count).padStart(2, "0")}`;
  out += t.text("mono", total, { x: n(cx + monoWidth("00", size)), y, "font-size": size, fill: theme.muted });

  // Progress: one segment per photo, filling while it is on screen.
  const segW = 22;
  const segGap = 4;
  const pgX = cx + monoWidth(`00${total}`, size) + 14;
  const pgY = y - 10;
  for (let k = 0; k < count; k++) {
    const x = pgX + k * (segW + segGap);
    out += el("rect", { x: n(x), y: pgY, width: segW, height: 4, fill: theme.muted, "fill-opacity": 0.45 });
    const points: Track = [
      ...(k > 0 ? ([[0, [0]]] as Track) : []),
      [k * SEG, [0]],
      [(k + 1) * SEG - 2 * EPS, [1]],
      [doc.cycle - EPS, [1]],
    ];
    const fill = doc.loop(`pgf${k}`, 0, points, (v) => `transform:scaleX(${ratio(v[0] ?? 0)})`);
    out += el("rect", {
      class: cls("pg", "progress", `progress-${k}`, fill),
      x: n(x),
      y: pgY,
      width: segW,
      height: 4,
      fill: theme.text,
      transform: k > 0 ? "scale(0 1)" : undefined,
    });
  }

  const badge = (x: number, label: string) =>
    el("rect", {
      x: n(x),
      y: y - 20,
      width: n(monoWidth(label, 18) + 14),
      height: 26,
      rx: 4,
      fill: "none",
      stroke: theme.text,
      "stroke-opacity": 0.7,
      "stroke-width": 1.5,
    }) + t.text("mono", label, { x: n(x + 7), y: y - 1, "font-size": 18, fill: theme.text });
  const badgeX = pgX + count * (segW + segGap) + 18;
  out += badge(badgeX, "A");
  const afcX = badgeX + monoWidth("A", 18) + 14 + 10;
  out += badge(afcX, "AF-C");
  const focusX = afcX + monoWidth("AF-C", 18) + 30;
  out += el("circle", { cx: n(focusX), cy: y - 7, r: 5, fill: "none", stroke: theme.muted, "stroke-width": 1.5 });
  const focus = doc.perSegment("focus", shown(T.lock, T.hudGone), opacityOf);
  out += el("circle", { class: focus, cx: n(focusX), cy: y - 7, r: 5, fill: theme.lock });

  // Exposure meter: the needle swings while metering and settles on 0 at lock.
  const mx = W / 2;
  const half = 156;
  const scaleY = y - 10;
  let ticks = el("line", { x1: mx - half, y1: scaleY, x2: mx + half, y2: scaleY });
  for (let i = -9; i <= 9; i++) {
    const x = mx + (i * half) / 9;
    ticks += el("line", { x1: n(x), y1: i % 3 === 0 ? scaleY - 10 : scaleY - 6, x2: n(x), y2: scaleY });
  }
  out += el("g", { stroke: theme.text, "stroke-opacity": 0.75, "stroke-width": 1.5 }, ticks);
  out += t.text("mono", "-", { x: mx - half - 18, y: scaleY + 2, "font-size": 16, fill: theme.text });
  out += t.text("mono", "+", { x: mx + half + 8, y: scaleY + 2, "font-size": 16, fill: theme.text });
  const needle = doc.perSegment(
    "needle",
    [
      [T.hunt, [0]],
      [0.36, [-62]],
      [0.54, [44]],
      [0.7, [-26]],
      [0.84, [15]],
      [0.93, [-6]],
      [T.lock, [0]],
    ],
    (v) => `transform:translateX(${px(v[0] ?? 0)})`,
    "ease-in-out",
  );
  out += el("path", { class: needle, d: `M${mx} ${scaleY + 4}l6 9h-12z`, fill: theme.accent });

  // Card and battery.
  const cardX = HUD_RIGHT - 84;
  out += el("path", {
    d: `M${cardX} ${y - 20}h14l6 6v20h-20z`,
    fill: "none",
    stroke: theme.text,
    "stroke-opacity": 0.85,
    "stroke-width": 1.6,
  });
  out += el("path", { d: `M${cardX + 5} ${y - 16}v5M${cardX + 9} ${y - 16}v5M${cardX + 13} ${y - 16}v5`, stroke: theme.text, "stroke-width": 1.4 });
  const batX = HUD_RIGHT - 48;
  out += el("rect", { x: batX, y: y - 18, width: 42, height: 20, rx: 3, fill: "none", stroke: theme.text, "stroke-opacity": 0.85, "stroke-width": 1.6 });
  out += el("rect", { x: batX + 43, y: y - 12, width: 4, height: 8, rx: 1, fill: theme.text });
  for (let i = 0; i < 3; i++) out += el("rect", { x: batX + 4 + i * 12.5, y: y - 14, width: 9.5, height: 12, fill: theme.lock });
  return out;
}

/**
 * Playback readout, bottom right: Japanese caption, camera + lens, column
 * headers and exposure values. Values that are the same for every photo are
 * printed once; the rest swap around each blink: out just before it, back in
 * one by one after it, so two values never overlap.
 */
function exifReadout(doc: Doc, photos: PhotoMeta[]): string {
  const { theme, t, layout } = doc;
  const { exif } = layout;
  const fields: Array<{ value: (p: PhotoMeta) => string; role: FontRole; attrs: () => Record<string, string | number> }> = [
    {
      value: (p) => p.alt,
      role: "display",
      attrs: () => ({ x: EXIF.right, y: EXIF.altY, "font-size": n(exif.altSize), "text-anchor": "end", fill: theme.text }),
    },
    {
      value: cameraLine,
      role: "mono",
      attrs: () => ({ x: EXIF.right, y: EXIF.cameraY, "font-size": EXIF.cameraSize, "text-anchor": "end", fill: theme.text, "fill-opacity": 0.72 }),
    },
    ...EXIF_FIELDS.map((field, i) => ({
      value: field.value,
      role: "mono" as FontRole,
      attrs: () => ({ x: n(exif.columns[i] ?? EXIF.right), y: EXIF.valueY, "font-size": EXIF.valueSize, "text-anchor": "end", fill: theme.text }),
    })),
  ];

  let out = "";
  EXIF_FIELDS.forEach((field, i) => {
    out += t.text("mono", field.header, {
      x: n(exif.columns[i] ?? EXIF.right),
      y: EXIF.headerY,
      "font-size": EXIF.headerSize,
      "text-anchor": "end",
      fill: theme.muted,
    });
  });
  let order = 0;
  for (const field of fields) {
    const values = photos.map(field.value);
    if (new Set(values).size <= 1) {
      out += t.text(field.role, values[0] ?? "", field.attrs(), "exif");
      continue;
    }
    const at = T.exifIn + order * T.exifStagger;
    order++;
    values.forEach((value, k) => {
      const swap = doc.loop(
        `ex${k}x${order}`,
        k * SEG,
        [
          [at, [0]],
          [at + 0.14, [1]],
          [T.exifOut, [1]],
          [T.exifOut + 0.14, [0]],
        ],
        opacityOf,
      );
      out += t.text(field.role, value, { ...field.attrs(), opacity: k > 0 ? 0 : undefined }, cls("exif", `exif-${k}`, swap));
    });
  }
  return out;
}

/** Typed name, Japanese name + role, location + handle, and the nested profile detections (all from layout.name). */
function nameBlock(doc: Doc): string {
  const { theme, t, layout } = doc;
  const L = layout.name;
  let markup = "";

  // Profile detections: boxes first (outermost at the back), then the label row on top.
  doc.css += `@keyframes pd{0%{opacity:0;transform:scale(1.035)}30%{opacity:1}45%{opacity:.3}60%{opacity:1}100%{opacity:1;transform:scale(1)}}`;
  doc.css += `.pd{animation:pd .34s ease-out both;transform-box:fill-box;transform-origin:center}`;
  const color = (i: number) => theme.detect[i % theme.detect.length] ?? theme.accent;
  for (let i = L.boxes.length - 1; i >= 0; i--) {
    const box = L.boxes[i] as Box;
    // Re-detect on every new photo: a subtle outline flicker, never gone.
    const at = T.redetect + i * 0.07;
    const flicker = doc.perSegment(
      `pf${i}`,
      [
        [at, [1]],
        [at + 0.04, [0.35]],
        [at + 0.14, [1]],
      ],
      opacityOf,
    );
    markup += el("g", { class: `pd pd${i}` }, el("g", { class: flicker }, keylined(doc, "rect", rectOf(box), color(i), 2.5)));
    doc.css += `.pd.pd${i}{animation-delay:${n(T.detectStart + i * T.detectStep)}s}`;
  }
  L.chips.forEach((c, i) => {
    markup += el("g", { class: `pd pd${i}` }, chip(doc, c, L.chipSize, color(i)));
  });

  // Typed name: one glyph per step; a space takes a beat too.
  doc.css += `@keyframes ty{from{opacity:0}to{opacity:1}}.ty{animation:ty .01s both}`;
  L.chars.forEach((ch, i) => {
    if (ch.trim() === "") return;
    doc.css += `.ty.ty${i}{animation-delay:${n(T.typeStart + i * T.typeStep)}s}`;
    markup += t.text("display-bold", ch, { x: n(L.glyphX[i] ?? 0), y: L.baseline, "font-size": L.size, fill: theme.text }, `ty ty${i}`);
  });
  // Caret: follows the typing, then blinks in step with the REC dot.
  const caretX = L.caret.x0;
  const caretStops = [L.glyphX[0] ?? caretX, ...L.chars.map((_, i) => (i === L.chars.length - 1 ? caretX : (L.glyphX[i + 1] ?? caretX)))];
  const moves = caretStops.map((x, i) => `${pct(i / caretStops.length)}{transform:translateX(${px(x - caretX)})}`).join("");
  const typeEnd = T.typeStart + L.chars.length * T.typeStep;
  doc.css += `@keyframes caretm{${moves}100%{transform:translateX(0px)}}`;
  doc.css += `.caretm{animation:caretm ${n(caretStops.length * T.typeStep)}s step-end ${n(T.typeStart - T.typeStep)}s both}`;
  doc.css += `@keyframes blink{0%{opacity:1}50%{opacity:0}}`;
  doc.css += `.caretb{animation:blink 1s step-end ${Math.ceil(typeEnd)}s infinite both}`;
  markup += el(
    "g",
    { class: "caretb" },
    el("rect", { class: "caret caretm", ...rectOf(L.caret), fill: theme.accent }),
  );

  const [ja, role, location, handle] = L.lines as [TextLine, TextLine, TextLine, TextLine];
  markup += t.text("display", ja.text, { x: n(ja.x), y: ja.y, "font-size": n(ja.size), fill: theme.text });
  markup += t.text("display", role.text, { x: n(role.x), y: role.y, "font-size": n(role.size), fill: theme.text, "fill-opacity": 0.86 });
  const { x: pinX, y: pinY } = L.pin;
  markup += el("path", {
    d: `M${pinX + 8} ${pinY + 1}c-5-6-8-9.5-8-13a8 8 0 0 1 16 0c0 3.5-3 7-8 13z`,
    fill: "none",
    stroke: theme.text,
    "stroke-width": 1.8,
  });
  markup += el("circle", { cx: pinX + 8, cy: pinY - 12, r: 2.6, fill: theme.text });
  for (const line of [location, handle]) {
    markup += t.text("mono", line.text, { x: n(line.x), y: line.y, "font-size": n(line.size), fill: theme.text, "fill-opacity": 0.86 });
  }
  return markup;
}

// ---------------------------------------------------------------------------
// Caption treatment and frame
// ---------------------------------------------------------------------------

/** Darkens (cinema) or cuts paper out of (print) the photo under the caption areas. */
function captionScrims(doc: Doc): string {
  const { theme, look, layout } = doc;
  const zones = layout.zones;
  if (look.caption === "print") return zones.map((z) => el("rect", { ...rectOf(z), fill: theme.bg })).join("");

  const stops = (list: Array<[number, number]>) =>
    list.map(([offset, opacity]) => el("stop", { offset, "stop-color": theme.bg, "stop-opacity": n(opacity) })).join("");
  const name = zones[0] ?? { x0: 0, y0: 400, x1: 860, y1: H };
  const cx = (name.x0 + name.x1) / 2;
  doc.defs += el(
    "linearGradient",
    { id: "g-top", x1: 0, y1: 0, x2: 0, y2: 150, gradientUnits: "userSpaceOnUse" },
    stops([
      [0, 0.72],
      [1, 0],
    ]),
  );
  doc.defs += el(
    "linearGradient",
    { id: "g-bot", x1: 0, y1: 340, x2: 0, y2: H, gradientUnits: "userSpaceOnUse" },
    stops([
      [0, 0],
      [1, 0.84],
    ]),
  );
  doc.defs += el(
    "radialGradient",
    { id: "g-name", cx: 0, cy: 0, r: 1, gradientUnits: "userSpaceOnUse", gradientTransform: `translate(${n(cx)} ${H - 100}) scale(${n(cx + 240)} 270)` },
    stops([
      [0, 0.72],
      [0.55, 0.48],
      [1, 0],
    ]),
  );
  doc.defs += el(
    "radialGradient",
    { id: "g-vig", cx: W / 2, cy: H / 2, r: 760, gradientUnits: "userSpaceOnUse" },
    stops([
      [0.66, 0],
      [1, 0.32],
    ]),
  );
  return [
    el("rect", { width: W, height: 150, fill: "url(#g-top)" }),
    el("rect", { y: 340, width: W, height: H - 340, fill: "url(#g-bot)" }),
    el("rect", { width: W, height: H, fill: "url(#g-name)" }),
    el("rect", { width: W, height: H, fill: "url(#g-vig)" }),
  ].join("");
}

/**
 * Mask that keeps the grid off the caption areas. The zones are holes in an
 * alpha mask, optionally feathered by a fading band just above each zone.
 * Zones must not overlap, or evenodd would refill the overlap.
 */
function captionMask(doc: Doc): void {
  const { look, layout } = doc;
  const feather = look.maskFeather;
  const holes = layout.zones.map((z) => `M${n(z.x0)} ${n(z.y0 - feather)}H${n(z.x1)}V${n(z.y1)}H${n(z.x0)}Z`).join("");
  let content = el("path", { d: `M0 0H${W}V${H}H0Z${holes}`, "fill-rule": "evenodd", fill: look.maskOn });
  if (feather > 0) {
    layout.zones.forEach((z, i) => {
      doc.defs += el(
        "linearGradient",
        { id: `g-mask${i}`, x1: 0, y1: n(z.y0 - feather), x2: 0, y2: n(z.y0), gradientUnits: "userSpaceOnUse" },
        el("stop", { offset: 0, "stop-color": look.maskOn }) + el("stop", { offset: 1, "stop-color": look.maskOn, "stop-opacity": 0 }),
      );
      content += el("rect", { ...rectOf({ ...z, y0: z.y0 - feather, y1: z.y0 }), fill: `url(#g-mask${i})` });
    });
  }
  doc.defs += el("mask", { id: "m-caption", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H, style: "mask-type:alpha" }, content);
}

/** EVF frame corners (dark) or printer's crop marks (light). */
function frameMarks(doc: Doc): string {
  const { theme, look } = doc;
  const p = look.photo;
  if (look.caption === "print") {
    let d = "";
    for (const [x, y, sx, sy] of [
      [p.x0, p.y0, -1, -1],
      [p.x1, p.y0, 1, -1],
      [p.x1, p.y1, 1, 1],
      [p.x0, p.y1, -1, 1],
    ] as const) {
      d += `M${x + sx * 4} ${y}h${sx * 12}M${x} ${y + sy * 4}v${sy * 12}`;
    }
    return el("path", { d, stroke: theme.text, "stroke-width": 1 });
  }
  const { inset: i, arm: a } = CORNER_MARK;
  return el("path", {
    d: `M${i} ${i + a}V${i}H${i + a}M${W - i - a} ${i}H${W - i}V${i + a}M${W - i} ${H - i - a}V${H - i}H${W - i - a}M${i + a} ${H - i}H${i}V${H - i - a}`,
    fill: "none",
    stroke: theme.text,
    "stroke-opacity": 0.55,
    "stroke-width": 2,
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function checkPhotoBudget(photos: readonly PhotoMeta[], uris: readonly string[]): void {
  let total = 0;
  photos.forEach((photo, k) => {
    const bytes = Buffer.byteLength(uris[k] ?? "");
    total += bytes;
    if (bytes > MAX_PHOTO_URI_BYTES) {
      throw new Error(
        `renderHero: photo ${photo.id} adds ${Math.round(bytes / 1000)} KB as a data URI; keep each hero photo under ${MAX_PHOTO_URI_BYTES / 1000} KB (re-encode it smaller, see docs/maintaining.md)`,
      );
    }
  });
  if (total > MAX_PHOTOS_URI_BYTES) {
    throw new Error(`renderHero: the photos add ${Math.round(total / 1000)} KB; together they must stay under ${MAX_PHOTOS_URI_BYTES / 1000} KB to keep the hero under 900 KB`);
  }
}

export async function renderHero(input: HeroInput, ctx: RenderContext): Promise<string> {
  const { profile, photos } = input;
  if (photos.length < 1) throw new Error("renderHero: needs at least one photo");
  if (photos.length > MAX_PHOTOS) {
    throw new Error(
      `renderHero: got ${photos.length} photos, but at most ${MAX_PHOTOS} photos fit the 900 KB hero budget (each Leica JPEG adds ~190 KB as base64)`,
    );
  }
  const uris = await Promise.all(photos.map((p) => ctx.assets.photoDataUri(p.file)));
  checkPhotoBudget(photos, uris);

  const layout = layoutHero(profile, photos);
  const doc = new Doc(ctx.theme, lookFor(ctx.theme), layout, photos.length);
  const p = doc.look.photo;

  const layers = photoLayers(doc, photos, uris);
  captionMask(doc);
  doc.defs += el("clipPath", { id: "cp-photo" }, el("rect", rectOf(p)));
  doc.defs += el("clipPath", { id: "cp-hud" }, el("rect", rectOf({ ...p, y0: Math.max(p.y0, SAFE_AREA.y0 - 6) })));
  doc.defs += el(
    "linearGradient",
    { id: "g-scan", x1: 0, y1: 0, x2: 0, y2: 1 },
    el("stop", { offset: 0, "stop-color": ctx.theme.lock, "stop-opacity": 0 }) +
      el("stop", { offset: 1, "stop-color": ctx.theme.lock, "stop-opacity": 0.32 }),
  );

  const body = [
    el("rect", { width: W, height: H, fill: ctx.theme.bg }),
    el("g", { "clip-path": "url(#cp-photo)" }, layers.images + captureFlash(doc) + shutterCurtains(doc) + captionScrims(doc)),
    el("g", { "clip-path": "url(#cp-hud)", mask: "url(#m-caption)" }, thirdsGrid(doc)),
    el("g", { "clip-path": "url(#cp-hud)" }, layers.detections),
    afBrackets(doc),
    frameMarks(doc),
    topBar(doc),
    exifReadout(doc, photos),
    nameBlock(doc),
  ].join("");

  const style = [
    await doc.t.fontCss(ctx),
    `.fm{font-family:${fontStack.mono};font-weight:500}`,
    `.fmb{font-family:${fontStack.mono};font-weight:700}`,
    `.fd{font-family:${fontStack.display};font-weight:400}`,
    `.fdb{font-family:${fontStack.display};font-weight:700}`,
    `.kb{transform-box:view-box;transform-origin:0 0}`,
    `.afh{transform-box:fill-box;transform-origin:center}`,
    `.pg{transform-box:fill-box;transform-origin:0 50%}`,
    doc.css,
    `@media (prefers-reduced-motion: reduce){*{animation:none!important}}`,
  ].join("");

  const alts = photos.map((ph) => ph.alt).join(" / ");
  const labels = profile.detections.map((d) => `${d.label} ${d.confidence.toFixed(2)}`).join(", ");
  return svgDoc({
    width: W,
    height: H,
    title: `${profile.name} (@${profile.handle})`,
    desc: `${profile.nameJa}. ${profile.roleLine}. ${profile.location}. Camera viewfinder over photos: ${alts}. Detections: ${labels}.`,
    style,
    defs: doc.defs,
    body,
  });
}
