import type { PhotoMeta } from "../src/contract/schema";

// Exposure values are copied from the original EXIF. The committed JPEGs are
// re-encoded with all metadata (including GPS) stripped.
//
// `framing` places each photo in the 1280x640 hero by eye: scale/ox/oy must cover
// the frame for the whole move (a tilt starts `dy` lower), `subject` is in photo
// pixels and `af` in canvas units. `suggestFraming(photo)` in src/render/hero.ts
// drafts a centred starting point for a new photo.
export const photos: PhotoMeta[] = [
  {
    id: "architecture",
    file: "assets/photos/architecture.jpg",
    alt: "電線越しに見上げたブルータリズム建築",
    width: 932,
    height: 1400,
    camera: "LEICA Q3",
    lens: "SUMMILUX 28mm f/1.7 ASPH.",
    focalLength: "28mm",
    aperture: "f/5.0",
    shutter: "1/400",
    iso: 100,
    subject: "building",
    // Portrait tower: tilt up from the shaft to the cantilevered top.
    framing: {
      scale: 1280 / 932,
      ox: 0,
      oy: -400,
      subject: [213, 380, 728, 1105],
      af: [640, 240],
      motion: { kind: "tilt", dy: 200 },
    },
  },
  {
    id: "sticker",
    file: "assets/photos/sticker.jpg",
    alt: "白いポールに貼られたステッカーとガラスの反射",
    width: 1400,
    height: 932,
    camera: "LEICA Q3",
    lens: "SUMMILUX 28mm f/1.7 ASPH.",
    focalLength: "28mm",
    aperture: null,
    shutter: null,
    iso: null,
    subject: "sticker",
    // The sticker on the white pole.
    framing: {
      scale: 1.15,
      ox: -126,
      oy: -321,
      subject: [668, 376, 768, 566],
      af: [700, 222],
      motion: { kind: "push", zoom: 0.06 },
    },
  },
  {
    id: "donburi",
    file: "assets/photos/donburi.jpg",
    alt: "卵黄をのせたローストビーフ丼の定食",
    width: 1400,
    height: 932,
    camera: "LEICA Q3",
    lens: "SUMMILUX 28mm f/1.7 ASPH.",
    focalLength: "28mm",
    aperture: "f/1.7",
    shutter: "1/50",
    iso: 1250,
    subject: "donburi",
    // Roast-beef donburi, focused on the yolk.
    framing: {
      scale: 0.96,
      ox: -40,
      oy: -254,
      subject: [535, 334, 910, 668],
      af: [649, 189],
      motion: { kind: "push", zoom: 0.03 },
    },
  },
];
