import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { photos } from "../data/photos";

// JPEG markers that carry camera metadata: APP1 (Exif / XMP), APP13 (IPTC).
function metadataSegments(jpeg: Buffer): string[] {
  const found: string[] = [];
  let offset = 2; // skip SOI
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xff) {
    const marker = jpeg[offset + 1] ?? 0;
    if (marker === 0xda) break; // start of scan: no more headers
    const length = jpeg.readUInt16BE(offset + 2);
    const payload = jpeg.subarray(offset + 4, offset + 2 + length).toString("latin1");
    if (marker === 0xe1 && payload.startsWith("Exif")) found.push("Exif");
    if (marker === 0xe1 && payload.includes("ns.adobe.com/xap")) found.push("XMP");
    if (marker === 0xed) found.push("IPTC");
    offset += 2 + length;
  }
  return found;
}

describe("committed photos", () => {
  for (const photo of photos) {
    it(`${photo.file} carries no Exif, XMP or IPTC metadata (GPS lives there)`, () => {
      const jpeg = readFileSync(photo.file);
      expect(jpeg.subarray(0, 2).toString("hex")).toBe("ffd8");
      expect(metadataSegments(jpeg)).toEqual([]);
    });
  }

  it("detects metadata when it is present", () => {
    const exif = Buffer.from("Exif\0\0MM", "latin1");
    const segment = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, exif.length + 2]), exif]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), segment, Buffer.from([0xff, 0xda, 0x00, 0x02])]);
    expect(metadataSegments(jpeg)).toEqual(["Exif"]);
  });
});
