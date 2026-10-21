// Shared assertions for every generated SVG. GitHub shows README images through
// <img>, so scripts, external resources and links inside the SVG never work.
import { XMLValidator } from "fast-xml-parser";
import { expect } from "vitest";

export interface GithubSafeOptions {
  /** Upper bound on the serialized size in bytes. */
  maxBytes: number;
}

const ANIMATABLE = ["transform", "opacity", "animation-timing-function"];

/** Every property set inside a CSS @keyframes block, @font-face rules excluded. */
function keyframeProperties(svg: string): Array<{ name: string; prop: string }> {
  const css = [...svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1] ?? "")
    .join("")
    .replace(/@font-face\{[^}]*\}/g, "");
  const out: Array<{ name: string; prop: string }> = [];
  for (const block of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
    for (const stop of (block[2] ?? "").matchAll(/[^{}]+\{([^{}]*)\}/g)) {
      for (const decl of (stop[1] ?? "").split(";")) {
        const prop = decl.split(":")[0]?.trim();
        if (prop) out.push({ name: block[1] ?? "", prop });
      }
    }
  }
  return out;
}

/**
 * What every generated SVG must satisfy to work as a GitHub README image:
 * well-formed with a <title>; no scripts, foreignObject, event handlers or <a>;
 * no external URLs or @import; prefers-reduced-motion handled when animated;
 * CSS keyframes only on transform/opacity; and the caller's byte budget.
 * Loop seams, cycle lengths and text sizes are checked in each renderer's tests.
 */
export function expectGithubSafeSvg(svg: string, { maxBytes }: GithubSafeOptions): void {
  expect(XMLValidator.validate(svg), "SVG must be well-formed XML").toBe(true);
  expect(svg.startsWith("<svg "), "document must start with <svg").toBe(true);
  expect(svg, "needs an accessible <title>").toMatch(/<title[^>]*>[^<]+<\/title>/);

  expect(svg, "no <script>").not.toMatch(/<script/i);
  expect(svg, "no <foreignObject>").not.toMatch(/<foreignObject/i);
  expect(svg, "no inline event handlers").not.toMatch(/\son[a-z]+\s*=/i);
  expect(svg, "no <a> (links inside <img> are dead)").not.toMatch(/<a[\s>]/);

  // Only data: URIs and #fragments may be referenced. The xmlns is the one allowed URL.
  const withoutNs = svg.replace(/xmlns(:\w+)?="[^"]*"/g, "");
  expect(withoutNs, "no external URLs in attributes").not.toMatch(/(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i);
  expect(withoutNs, "no external URLs in CSS").not.toMatch(/url\(\s*["']?\s*(?:https?:|\/\/)/i);
  expect(withoutNs, "no @import").not.toMatch(/@import/i);

  const animated = /@keyframes|<animate|<animateTransform|<animateMotion|<set\s/.test(svg);
  if (animated) {
    expect(svg, "animated SVGs must honor prefers-reduced-motion").toContain("prefers-reduced-motion");
  }
  // Compositor-only animation: other properties repaint every frame and stutter in <img>.
  for (const { name, prop } of keyframeProperties(svg)) {
    expect(ANIMATABLE, `@keyframes ${name} animates ${prop}`).toContain(prop);
  }

  const bytes = Buffer.byteLength(svg);
  expect(bytes, `SVG is ${bytes} bytes, budget ${maxBytes}`).toBeLessThanOrEqual(maxBytes);
}
