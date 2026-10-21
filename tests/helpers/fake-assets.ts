// A fast, deterministic AssetLoader for unit tests. It records the text each
// font role was asked to cover so tests can check glyph coverage.
import type { AssetLoader, FontRole } from "../../src/render/types";

// 1×1 white JPEG.
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";

export interface FakeAssetLoader extends AssetLoader {
  requested: Map<FontRole, string>;
}

export function fakeAssets(): FakeAssetLoader {
  const requested = new Map<FontRole, string>();
  return {
    requested,
    async fontCss(role, text) {
      requested.set(role, (requested.get(role) ?? "") + text);
      const family = role.startsWith("mono") ? "KN Mono" : "KN Display";
      const weight = role === "mono" ? 500 : role === "display" ? 400 : 700;
      return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,AA==) format("woff2");}`;
    },
    async photoDataUri() {
      return TINY_JPEG;
    },
  };
}
