import { describe, expect, it } from "vitest";
import { themeNames, themes } from "../../src/render/theme";

/** WCAG 2.x relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("theme tokens", () => {
  // Chip labels (hero detections, frame kind tabs, the contrib PEAK WEEK tab) are
  // small bold text in theme.bg or theme.surface on a detect/lock fill.
  it("keeps chip label ink at WCAG AA (4.5:1) on every chip fill", () => {
    for (const name of themeNames) {
      const t = themes[name];
      for (const fill of [...t.detect, t.lock]) {
        for (const ink of [t.bg, t.surface]) {
          expect(contrast(fill, ink), `${name}: ${ink} on ${fill}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
