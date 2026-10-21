// Shared assertions for every generated SVG. GitHub shows README images through
// <img>, so scripts, external resources and links inside the SVG never work.
import { XMLValidator } from "fast-xml-parser";
import { expect } from "vitest";

export interface GithubSafeOptions {
  /** Upper bound on the serialized size in bytes. */
  maxBytes: number;
}

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

  const bytes = Buffer.byteLength(svg);
  expect(bytes, `SVG is ${bytes} bytes, budget ${maxBytes}`).toBeLessThanOrEqual(maxBytes);
}
