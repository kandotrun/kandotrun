import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { photos } from "../data/photos";
import { assertStrippedJpeg, jpegInfo, MAX_PHOTO_SIDE, metadataSegments } from "../src/assets/jpeg";

const PHOTO_DIR = "assets/photos";
const committed = readdirSync(PHOTO_DIR)
  .filter((name) => !name.startsWith("."))
  .sort()
  .map((name) => `${PHOTO_DIR}/${name}`);

/** A minimal JPEG header: SOI, the given segments, a baseline SOF0 and SOS. */
function jpeg(segments: Array<[marker: number, payload: string]>, width = 3, height = 2): Buffer {
  const segment = (marker: number, payload: Buffer) =>
    Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  const sof = Buffer.from([8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...segments.map(([marker, payload]) => segment(marker, Buffer.from(payload, "latin1"))),
    segment(0xc0, sof),
    segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x00, 0xff, 0xd9]),
  ]);
}

describe("committed photos", () => {
  it("are all JPEGs listed in data/photos.ts", () => {
    expect(committed).toEqual(photos.map((p) => p.file).sort());
  });

  for (const file of committed) {
    it(`${file} carries no Exif, XMP, IPTC or comment metadata (GPS lives there)`, () => {
      expect(() => assertStrippedJpeg(file, readFileSync(file))).not.toThrow();
    });
  }

  for (const photo of photos) {
    it(`${photo.file}: data/photos.ts width/height match the JPEG and stay within ${MAX_PHOTO_SIDE} px`, () => {
      const { width, height } = jpegInfo(readFileSync(photo.file));
      expect({ width: photo.width, height: photo.height }).toEqual({ width, height });
      expect(Math.max(width, height)).toBeLessThanOrEqual(MAX_PHOTO_SIDE);
    });
  }
});

describe("jpegInfo", () => {
  it("reads the frame size from the SOF header", () => {
    expect(jpegInfo(jpeg([[0xe0, "JFIF\0"]], 1400, 932))).toMatchObject({ width: 1400, height: 932 });
  });

  it("rejects data that is not a JPEG", () => {
    expect(() => jpegInfo(Buffer.from("GIF89a"))).toThrow(/not a JPEG/);
  });
});

describe("metadataSegments / assertStrippedJpeg", () => {
  it("accepts JFIF, an ICC profile and the Adobe marker", () => {
    const clean = jpeg([
      [0xe0, "JFIF\0"],
      [0xe2, "ICC_PROFILE\0"],
      [0xee, "Adobe\0"],
    ]);
    expect(metadataSegments(clean)).toEqual([]);
    expect(() => assertStrippedJpeg("clean.jpg", clean)).not.toThrow();
  });

  it("finds Exif, XMP, IPTC, comments and multi-picture data", () => {
    const dirty = jpeg([
      [0xe1, "Exif\0\0MM"],
      [0xe1, "http://ns.adobe.com/xap/1.0/\0"],
      [0xed, "Photoshop 3.0\0"],
      [0xfe, "shot at home"],
      [0xe2, "MPF\0"],
    ]);
    expect(metadataSegments(dirty)).toEqual(["Exif/XMP (APP1)", "Exif/XMP (APP1)", "IPTC (APP13)", "comment (COM)", "APP2 MPF"]);
  });

  it("names the file and the fix", () => {
    expect(() => assertStrippedJpeg("assets/photos/new.jpg", jpeg([[0xe1, "Exif\0\0MM"]]))).toThrow(
      /assets\/photos\/new\.jpg: contains Exif\/XMP \(APP1\) metadata; re-encode it with `magick … -strip`/,
    );
  });
});
