// The shared SVG assertions are themselves tested, so a check that silently
// stops matching cannot let a renderer regress.
import { describe, expect, it } from "vitest";
import { expectGithubSafeSvg } from "./helpers/svg-assert";

const FONT = `@font-face{font-family:"KN Mono";src:url(data:font/woff2;base64,AA==) format("woff2");}`;

function svg(style: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>t</title><style>${FONT}${style}@media (prefers-reduced-motion: reduce){*{animation:none}}</style><rect class="a" width="1" height="1"/></svg>`;
}

const ok = (style: string) => () => expectGithubSafeSvg(svg(style), { maxBytes: 10_000 });

describe("expectGithubSafeSvg: animated properties", () => {
  it("accepts keyframes on transform and opacity, with per-stop timing functions", () => {
    expect(
      ok(
        ".a{animation:k 3s infinite}@keyframes k{0%,100%{opacity:0;transform:translateX(0px)}50%{opacity:1;animation-timing-function:ease-in}}",
      ),
    ).not.toThrow();
  });

  it("rejects keyframes that animate anything else", () => {
    expect(ok(".a{animation:k 3s infinite}@keyframes k{0%{fill:red}100%{fill:blue}}")).toThrow(/k animates fill/);
    expect(ok("@keyframes dash{from{stroke-dashoffset:10}to{stroke-dashoffset:0}}")).toThrow(
      /dash animates stroke-dashoffset/,
    );
  });

  it("ignores the declarations inside @font-face", () => {
    expect(ok(".a{animation:k 3s infinite}@keyframes k{0%{opacity:0}100%{opacity:1}}")).not.toThrow();
  });
});
