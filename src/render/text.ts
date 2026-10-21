// Text metrics shared by the renderers, so copy can be placed and fitted without
// reading font files at render time.
//
// The numbers come from the bundled fonts in assets/fonts/ (shaped with HarfBuzz).
// tests/render/text.test.ts re-measures them from those files and fails if they
// drift, printing the replacement values to paste here.
import type { FontRole } from "./types";

/**
 * LINE Seed JP advance widths of printable ASCII (U+0020..U+007E) in 1/1000 em,
 * index = char code - 32. Anything else (Japanese, symbols) is full width.
 */
export const DISPLAY_ADVANCE: Readonly<Record<"display" | "display-bold", readonly number[]>> = {
  display:
    "345,282,499,837,645,1009,782,292,427,427,534,650,292,504,292,455,725,466,667,669,715,669,660,629,695,658,292,292,650,650,650,603,1125,761,709,823,791,638,609,842,798,279,526,735,635,985,791,875,672,890,703,622,689,771,753,1154,691,717,655,377,455,377,650,613,359,659,659,580,659,583,391,659,626,249,249,577,249,978,626,630,659,659,405,500,420,623,572,854,548,571,533,455,327,455,634"
      .split(",")
      .map(Number),
  "display-bold":
    "345,282,499,837,645,1009,782,292,427,427,534,650,292,504,292,455,725,466,667,669,715,669,660,629,695,658,292,292,650,650,650,603,1125,815,743,863,827,671,636,880,834,319,587,785,663,1027,825,923,704,931,734,647,729,807,803,1202,738,770,671,377,455,377,650,613,392,694,694,626,694,621,435,694,665,288,288,643,288,1020,665,676,694,694,451,530,464,665,630,915,608,629,558,455,327,455,650"
      .split(",")
      .map(Number),
};

/** Kerning of uppercase pairs in LINE Seed JP Bold (1/1000 em), e.g. "AV" -108. */
export const DISPLAY_BOLD_KERN: Readonly<Record<string, number>> = Object.fromEntries(
  "AC-43 AG-43 AO-43 AQ-43 AS-22 AT-119 AU-43 AV-108 AW-97 AY-119 BA-32 BC-22 BG-22 BO-22 BQ-22 BT-32 BV-43 BW-43 BX-11 BY-49 CA-43 CC-22 CG-22 CO-22 CQ-22 CS-11 CT-32 CV-43 CW-43 CX-43 CY-54 CZ-11 DA-43 DJ-16 DS-11 DT-43 DU-11 DV-43 DW-43 DX-43 DY-65 DZ-11 FA-87 FC-11 FG-11 FJ-22 FO-11 FQ-11 GA-43 GJ-16 GS-11 GT-43 GU-11 GV-43 GW-43 GX-43 GY-65 GZ-11 JA-22 KC-54 KG-54 KJ-22 KO-54 KQ-54 KS-32 KT-22 KU-16 LC-54 LG-54 LO-54 LQ-54 LS-22 LT-119 LU-32 LV-108 LW-108 LY-141 OA-43 OJ-16 OS-11 OT-43 OU-11 OV-43 OW-43 OX-43 OY-65 OZ-11 PA-87 PC-11 PG-11 PJ-54 PO-11 PQ-11 PT-11 PV-22 PW-22 PX-43 PY-43 PZ-22 QA-11 QC-22 QG-22 QO-22 QQ-22 QS-11 QT-43 QU-22 QV-65 QW-76 QX-22 QY-97 RC-11 RG-11 RJ-11 RO-11 RQ-11 RS-11 RT-22 RU-16 RV-43 RW-32 RY-54 SA-22 SC-11 SG-11 SO-11 SQ-11 ST-11 SV-22 SW-11 SX-22 SY-22 TA-119 TC-43 TG-43 TJ-54 TO-43 TQ-43 TS-11 UA-43 UC-11 UG-11 UO-11 UQ-11 VA-108 VC-43 VG-43 VJ-54 VO-43 VQ-43 VS-22 WA-97 WC-43 WG-43 WJ-54 WO-43 WQ-43 WS-11 XC-43 XG-43 XJ-11 XO-43 XQ-43 XS-22 YA-119 YC-65 YG-65 YJ-65 YO-65 YQ-65 YS-22 ZC-11 ZG-11 ZO-11 ZQ-11"
    .split(" ")
    .map((pair) => [pair.slice(0, 2), Number(pair.slice(2))]),
);

/** Cap height of LINE Seed JP Bold, in em (OS/2 sCapHeight). */
export const DISPLAY_CAP = 0.758;
/** JetBrains Mono: every glyph advances 0.6 em; cap height in em. */
export const MONO_ADVANCE = 0.6;
export const MONO_CAP = 0.73;

const FULL_WIDTH = 1000;

/** Advance of one character in 1/1000 em. */
export function advance(ch: string, role: FontRole): number {
  if (role === "mono" || role === "mono-bold") return MONO_ADVANCE * 1000;
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 32 && code <= 126 ? DISPLAY_ADVANCE[role][code - 32] : undefined) ?? FULL_WIDTH;
}

/** Rendered width of `text` at `size` (no kerning), with optional letter-spacing in em per character. */
export function textWidth(text: string, role: FontRole, size: number, tracking = 0): number {
  let units = 0;
  let count = 0;
  for (const ch of text) {
    units += advance(ch, role);
    count++;
  }
  return (units * size) / 1000 + count * tracking * size;
}

export const displayWidth = (text: string, size: number, bold = false) => textWidth(text, bold ? "display-bold" : "display", size);

export const monoWidth = (text: string, size: number, tracking = 0) => textWidth(text, "mono", size, tracking);

/** Kerning between two characters of LINE Seed JP Bold, in 1/1000 em (0 for unlisted pairs). */
export const kern = (a: string, b: string) => DISPLAY_BOLD_KERN[a + b] ?? 0;

/** 14030 → "14,030". */
export const groupThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
