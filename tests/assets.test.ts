import { describe, expect, it } from "vitest";
import { createFsAssetLoader } from "../src/assets/loader";

const loader = createFsAssetLoader(process.cwd());

describe("fontCss", () => {
  it("embeds a subset woff2 @font-face for the requested glyphs", async () => {
    const css = await loader.fontCss("mono", "KAN 0.99");
    expect(css).toMatch(/^@font-face\{font-family:"KN Mono";/);
    expect(css).toContain("src:url(data:font/woff2;base64,");
    expect(css.length).toBeLessThan(20_000);
  });

  it("subsets Japanese glyphs from LINE Seed JP", async () => {
    const css = await loader.fontCss("display-bold", "ギガサイト便");
    expect(css).toContain(`font-family:"KN Display"`);
    expect(css).toContain("font-weight:700");
    expect(css.length).toBeLessThan(30_000);
  });

  it("is deterministic", async () => {
    const a = await loader.fontCss("display", "Hiroshima");
    const b = await loader.fontCss("display", "Hiroshima");
    expect(a).toBe(b);
  });
});

describe("photoDataUri", () => {
  it("returns a JPEG data URI for a photo in assets/photos", async () => {
    const uri = await loader.photoDataUri("assets/photos/sticker.jpg");
    expect(uri.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("refuses paths outside assets/photos", async () => {
    await expect(loader.photoDataUri("../secret.jpg")).rejects.toThrow();
  });
});
