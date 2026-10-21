import { describe, expect, it } from "vitest";
import { generatedPath } from "../../src/readme/paths";

describe("generatedPath", () => {
  it("names single panels by name and theme", () => {
    expect(generatedPath("hero", "dark")).toBe("assets/generated/hero-dark.svg");
    expect(generatedPath("stats", "light")).toBe("assets/generated/stats-light.svg");
  });

  it("names frames by position AND project id, so reordering never serves a cached card under an old URL", () => {
    expect(generatedPath("frame", "dark", { index: 1, id: "afterimage-app" })).toBe(
      "assets/generated/frames/02-afterimage-app-dark.svg",
    );
  });

  it("requires a frame reference for frames", () => {
    expect(() => generatedPath("frame", "dark")).toThrow();
  });
});
