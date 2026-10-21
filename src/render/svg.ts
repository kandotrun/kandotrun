// Tiny string helpers for building SVG documents. No DOM, no I/O.

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch] ?? ch);
}

export type AttrValue = string | number | boolean | null | undefined;

/** Serializes attributes with a leading space. Skips null, undefined and false. */
export function attrs(values: Record<string, AttrValue>): string {
  let out = "";
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === false) continue;
    out += value === true ? ` ${key}` : ` ${key}="${esc(value)}"`;
  }
  return out;
}

/** `el("rect", { x: 1 })` → `<rect x="1"/>`; with children → `<g>…</g>`. */
export function el(tag: string, values: Record<string, AttrValue> = {}, children?: string): string {
  return children === undefined ? `<${tag}${attrs(values)}/>` : `<${tag}${attrs(values)}>${children}</${tag}>`;
}

export interface SvgDocOptions {
  width: number;
  height: number;
  title: string;
  desc: string;
  /** Raw CSS placed in a <style> element (fonts, keyframes, classes). */
  style?: string;
  /** Raw markup placed in <defs>. */
  defs?: string;
  body: string;
}

/** A standalone, accessible SVG document suitable for `<img src>` on GitHub. */
export function svgDoc(options: SvgDocOptions): string {
  const { width, height, title, desc, style, defs, body } = options;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"${attrs({
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-labelledby": "t d",
    })}>`,
    `<title id="t">${esc(title)}</title>`,
    `<desc id="d">${esc(desc)}</desc>`,
    style ? `<style>${style.replace(/]]>/g, "]]]]><![CDATA[>")}</style>` : "",
    defs ? `<defs>${defs}</defs>` : "",
    body,
    "</svg>",
  ].join("");
}

export function dataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
