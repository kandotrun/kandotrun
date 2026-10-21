// The metric tables in src/render/text.ts are measured from assets/fonts/. This
// re-measures them with HarfBuzz (the copy subset-font already ships), so a font
// update fails here; the failure message carries the values to paste.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  advance,
  DISPLAY_ADVANCE,
  DISPLAY_BOLD_KERN,
  DISPLAY_CAP,
  displayWidth,
  groupThousands,
  kern,
  MONO_ADVANCE,
  MONO_CAP,
  monoWidth,
  textWidth,
} from "../../src/render/text";

interface HbFont {
  shape(text: string): number[];
  upem: number;
  capHeight: number;
}

const fromSubsetFont = createRequire(createRequire(import.meta.url).resolve("subset-font"));
// harfbuzzjs is reached through subset-font, so it has no type information here.
const hb: any = await import(pathToFileURL(fromSubsetFont.resolve("harfbuzzjs")).href);

function load(file: string): HbFont {
  const face = new hb.Face(new hb.Blob(new Uint8Array(readFileSync(file))));
  const font = new hb.Font(face);
  const os2: Uint8Array = face.referenceTable("OS/2");
  const capHeight = new DataView(os2.buffer, os2.byteOffset, os2.byteLength).getInt16(88);
  return {
    upem: face.upem,
    capHeight,
    shape(text) {
      const buffer = new hb.Buffer();
      buffer.addText(text);
      buffer.guessSegmentProperties();
      hb.shape(font, buffer);
      return buffer.getGlyphPositions().map((p: { xAdvance: number }) => p.xAdvance);
    },
  };
}

const fonts = {
  display: load("assets/fonts/LINESeedJP-Regular.ttf"),
  "display-bold": load("assets/fonts/LINESeedJP-Bold.ttf"),
  mono: load("assets/fonts/JetBrainsMono.ttf"),
};
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const em = (font: HbFont, units: number) => Math.round((units / font.upem) * 1000);

describe("text metrics match assets/fonts", () => {
  for (const role of ["display", "display-bold"] as const) {
    it(`${role} ASCII advances`, () => {
      const font = fonts[role];
      const measured = ASCII.map((ch) => em(font, font.shape(ch)[0] ?? 0));
      expect(DISPLAY_ADVANCE[role], `paste into DISPLAY_ADVANCE["${role}"]:\n"${measured.join(",")}"`).toEqual(measured);
    });
  }

  it("display-bold uppercase kerning pairs", () => {
    const font = fonts["display-bold"];
    const measured: Record<string, number> = {};
    const upper = ASCII.filter((ch) => /[A-Z]/.test(ch));
    for (const a of upper) {
      const alone = font.shape(a)[0] ?? 0;
      for (const b of upper) {
        const k = em(font, (font.shape(a + b)[0] ?? 0) - alone);
        if (k !== 0) measured[a + b] = k;
      }
    }
    const pasteable = Object.entries(measured)
      .map(([pair, k]) => `${pair}${k}`)
      .join(" ");
    expect(DISPLAY_BOLD_KERN, `paste into DISPLAY_BOLD_KERN:\n"${pasteable}"`).toEqual(measured);
  });

  it("mono advance and cap heights", () => {
    const mono = fonts.mono;
    for (const ch of ASCII) expect(mono.shape(ch)[0], `JetBrains Mono "${ch}"`).toBe(MONO_ADVANCE * mono.upem);
    expect(MONO_CAP).toBe(mono.capHeight / mono.upem);
    const bold = fonts["display-bold"];
    expect(DISPLAY_CAP).toBe(bold.capHeight / bold.upem);
  });
});

describe("text measurement", () => {
  it("adds advances, treats non-ASCII as full width and mono as 0.6 em", () => {
    expect(textWidth("AV", "display-bold", 100)).toBeCloseTo((815 + 803) / 10, 9);
    expect(displayWidth("写真", 20)).toBe(40);
    expect(displayWidth("A", 10, true)).toBeGreaterThan(displayWidth("A", 10));
    expect(monoWidth("REC", 20)).toBeCloseTo(36, 9);
    expect(monoWidth("REC", 20, 0.1)).toBeCloseTo(42, 9);
    expect(advance("x", "mono-bold")).toBe(600);
  });

  it("kerns listed uppercase pairs only", () => {
    expect(kern("A", "V")).toBe(-108);
    expect(kern("N", "I")).toBe(0);
  });

  it("groups thousands", () => {
    expect(groupThousands(14030)).toBe("14,030");
    expect(groupThousands(999)).toBe("999");
    expect(groupThousands(1234567)).toBe("1,234,567");
  });
});
