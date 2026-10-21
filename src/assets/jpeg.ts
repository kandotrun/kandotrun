// JPEG header inspection for the hero photos. Photos are embedded byte for byte
// in a public SVG, so anything a camera or editor wrote into the file (Exif with
// GPS, XMP, IPTC, comments, preview images) would be published with it.

/** docs/maintaining.md resizes hero photos to fit 1400x1400. */
export const MAX_PHOTO_SIDE = 1400;

export interface JpegSegment {
  marker: number;
  /** The null-terminated identifier at the start of an APPn payload ("JFIF", "Exif", ...). */
  id: string;
}

export interface JpegInfo {
  width: number;
  height: number;
  /** Header segments from SOI up to (not including) the first SOS. */
  segments: JpegSegment[];
}

const SOI = 0xd8;
const SOS = 0xda;
const COM = 0xfe;
const APP0 = 0xe0;
const APP15 = 0xef;
/** Every SOFn except DHT (C4), JPG (C8) and DAC (CC). */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
/** Markers without a length field. */
const STANDALONE = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

/** Walks the header segments up to the first SOS and reads the frame size. */
export function jpegInfo(bytes: Uint8Array): JpegInfo {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) throw new Error("jpegInfo: not a JPEG (no SOI marker)");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const segments: JpegSegment[] = [];
  let size: { width: number; height: number } | null = null;
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error(`jpegInfo: corrupt header at byte ${offset}`);
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === SOS) break;
    if (STANDALONE.has(marker)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) break;
    const length = view.getUint16(offset + 2);
    const payload = bytes.subarray(offset + 4, offset + 2 + length);
    const id = marker >= APP0 && marker <= APP15 ? identifier(payload) : "";
    segments.push({ marker, id });
    if (SOF.has(marker) && payload.length >= 5) {
      size = { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  if (!size) throw new Error("jpegInfo: no frame header (SOF) before the image data");
  return { ...size, segments };
}

function identifier(payload: Uint8Array): string {
  const end = payload.indexOf(0);
  return Buffer.from(payload.subarray(0, Math.min(end < 0 ? payload.length : end, 32))).toString("latin1");
}

/**
 * Header segments that carry metadata, as readable labels. Allowed: JFIF (APP0),
 * an ICC colour profile (APP2 "ICC_PROFILE") and the Adobe colour marker (APP14).
 */
export function metadataSegments(bytes: Uint8Array): string[] {
  const found: string[] = [];
  for (const { marker, id } of jpegInfo(bytes).segments) {
    if (marker === COM) found.push("comment (COM)");
    if (marker < APP0 || marker > APP15) continue;
    if (marker === APP0 || marker === 0xee || (marker === 0xe2 && id === "ICC_PROFILE")) continue;
    if (marker === 0xe1) found.push("Exif/XMP (APP1)");
    else if (marker === 0xed) found.push("IPTC (APP13)");
    else found.push(`APP${marker - APP0}${id ? ` ${id}` : ""}`);
  }
  return found;
}

/** Throws when the JPEG still carries metadata; `file` only labels the message. */
export function assertStrippedJpeg(file: string, bytes: Uint8Array): void {
  const found = [...new Set(metadataSegments(bytes))];
  if (found.length > 0) {
    throw new Error(
      `${file}: contains ${found.join(", ")} metadata; re-encode it with \`magick … -strip\` as in docs/maintaining.md`,
    );
  }
}
