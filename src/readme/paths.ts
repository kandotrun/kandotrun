// Where generated SVGs live. Shared by the build CLI (writes) and the README (links).
import type { ThemeName } from "../render/theme";

export const GENERATED_DIR = "assets/generated";

export type GeneratedName = "hero" | "frame" | "stats" | "contrib";

/** A contact-sheet frame: zero-based position plus the project id. */
export interface FrameRef {
  index: number;
  id: string;
}

/**
 * Frames are named by position and project id, so reordering the contact sheet
 * changes their URLs and GitHub's image cache never shows an old card in a new slot.
 */
export function generatedPath(name: GeneratedName, theme: ThemeName, frame?: FrameRef): string {
  if (name === "frame") {
    if (!frame) throw new Error("generatedPath: frame needs { index, id }");
    return `${GENERATED_DIR}/frames/${String(frame.index + 1).padStart(2, "0")}-${frame.id}-${theme}.svg`;
  }
  return `${GENERATED_DIR}/${name}-${theme}.svg`;
}
