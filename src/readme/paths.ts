// Where generated SVGs live. Shared by the build CLI (writes) and the README (links).
import type { ThemeName } from "../render/theme";

export const GENERATED_DIR = "assets/generated";

export type GeneratedName = "hero" | "frame" | "stats" | "contrib";

/** `index` is the zero-based featured-project index, required for "frame". */
export function generatedPath(name: GeneratedName, theme: ThemeName, index?: number): string {
  if (name === "frame") {
    if (index === undefined) throw new Error("generatedPath: frame needs an index");
    return `${GENERATED_DIR}/frames/${String(index + 1).padStart(2, "0")}-${theme}.svg`;
  }
  return `${GENERATED_DIR}/${name}-${theme}.svg`;
}
