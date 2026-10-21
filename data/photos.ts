import type { PhotoMeta } from "../src/contract/schema";

// Exposure values are copied from the original EXIF. The committed JPEGs are
// re-encoded with all metadata (including GPS) stripped.
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
  },
];
