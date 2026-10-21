// I/O boundary for renderers: fonts and photos are loaded here and injected,
// so everything under src/render stays a pure function of its inputs.
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import subsetFont from "subset-font";
import { dataUri } from "../render/svg";
import type { AssetLoader, FontRole } from "../render/types";

export type { AssetLoader, FontRole };

interface FontSpec {
  family: string;
  weight: 400 | 500 | 700;
  file: string;
  /** Pin a variable font axis (JetBrains Mono is variable). */
  wght?: number;
}

const FONTS: Record<FontRole, FontSpec> = {
  mono: { family: "KN Mono", weight: 500, file: "assets/fonts/JetBrainsMono.ttf", wght: 500 },
  "mono-bold": { family: "KN Mono", weight: 700, file: "assets/fonts/JetBrainsMono.ttf", wght: 700 },
  display: { family: "KN Display", weight: 400, file: "assets/fonts/LINESeedJP-Regular.ttf" },
  "display-bold": { family: "KN Display", weight: 700, file: "assets/fonts/LINESeedJP-Bold.ttf" },
};

export function createFsAssetLoader(root: string): AssetLoader {
  const fontCache = new Map<string, Promise<Buffer>>();
  const readFont = (file: string) => {
    let pending = fontCache.get(file);
    if (!pending) {
      pending = readFile(join(root, file));
      fontCache.set(file, pending);
    }
    return pending;
  };

  return {
    async fontCss(role, text) {
      const spec = FONTS[role];
      // Always include space and basic punctuation so layout never falls back mid-word.
      const glyphs = [...new Set(`${text} .-·/:`)].sort().join("");
      const woff2 = await subsetFont(await readFont(spec.file), glyphs, {
        targetFormat: "woff2",
        ...(spec.wght ? { variationAxes: { wght: spec.wght } } : {}),
      });
      return `@font-face{font-family:"${spec.family}";font-weight:${spec.weight};font-style:normal;src:url(${dataUri("font/woff2", woff2)}) format("woff2");}`;
    },

    async photoDataUri(file) {
      const rel = normalize(file);
      if (!rel.startsWith(`assets${sep}photos${sep}`) || rel.includes("..") || !rel.endsWith(".jpg")) {
        throw new Error(`photoDataUri: refusing ${file}`);
      }
      return dataUri("image/jpeg", await readFile(join(root, rel)));
    },
  };
}
