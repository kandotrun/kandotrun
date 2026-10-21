import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("refuses to embed a photo that still carries Exif metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "loader-"));
    mkdirSync(join(root, "assets/photos"), { recursive: true });
    const clean = readFileSync("assets/photos/sticker.jpg");
    const exif = Buffer.from("Exif\0\0MM\0*", "latin1");
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, exif.length + 2]), exif]);
    // Insert the APP1 segment right after SOI, the way cameras write it.
    writeFileSync(join(root, "assets/photos/gps.jpg"), Buffer.concat([clean.subarray(0, 2), app1, clean.subarray(2)]));
    await expect(createFsAssetLoader(root).photoDataUri("assets/photos/gps.jpg")).rejects.toThrow(
      /assets\/photos\/gps\.jpg: contains Exif\/XMP \(APP1\) metadata/,
    );
  });
});
