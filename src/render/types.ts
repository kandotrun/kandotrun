import type { Theme } from "./theme";

export type FontRole = "mono" | "mono-bold" | "display" | "display-bold";

/** Injected I/O for renderers. The real implementation is src/assets/loader.ts. */
export interface AssetLoader {
  /**
   * Returns an `@font-face` rule embedding only the glyphs in `text` as woff2.
   * Pair with `fontStack.mono` / `fontStack.display` from theme.ts and the
   * matching font-weight: mono 500 / mono-bold 700 / display 400 / display-bold 700.
   */
  fontCss(role: FontRole, text: string): Promise<string>;
  /** Returns a `data:image/jpeg;base64,…` URI for a file under assets/photos/. */
  photoDataUri(file: string): Promise<string>;
}

export interface RenderContext {
  theme: Theme;
  assets: AssetLoader;
}
