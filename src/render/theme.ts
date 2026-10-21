// Design tokens shared by every generated SVG. Dark = camera viewfinder at night,
// light = a print on warm paper. Renderers must take colors from here only.

export type ThemeName = "dark" | "light";

export interface Theme {
  name: ThemeName;
  /** Page-level background of the SVG canvas. */
  bg: string;
  /** Raised panels / cards. */
  surface: string;
  /** Hairlines, grid lines, frame borders. */
  line: string;
  text: string;
  muted: string;
  /** Leica red: REC dot, primary accent. */
  accent: string;
  /** AF lock / "confirmed" state. */
  lock: string;
  /** YOLO detection box colors, used in order. */
  detect: readonly [string, string, string];
  /** Contribution intensity levels 0..4. */
  levels: readonly [string, string, string, string, string];
  /** Film base color for contact-sheet frames and sprocket holes. */
  film: string;
  sprocket: string;
}

export const themes: Record<ThemeName, Theme> = {
  dark: {
    name: "dark",
    bg: "#0b0c0d",
    surface: "#141618",
    line: "#2a2e33",
    text: "#f3f2ee",
    muted: "#8b9099",
    accent: "#e4002b",
    lock: "#3dff8c",
    detect: ["#22d3ee", "#ffb020", "#ff4fd8"],
    levels: ["#1a1d21", "#1f4a35", "#24794f", "#2fb36d", "#3dff8c"],
    film: "#16120e",
    sprocket: "#0b0c0d",
  },
  light: {
    name: "light",
    bg: "#f4f1ea",
    surface: "#fffdf8",
    line: "#d9d3c7",
    text: "#151515",
    muted: "#6d6a63",
    accent: "#d7001e",
    // Chip fills: label ink (bg / surface) stays at WCAG AA, see tests/render/theme.test.ts.
    lock: "#0b7a43",
    detect: ["#0e7490", "#a15c00", "#c026a3"],
    levels: ["#e8e3d8", "#b9e2c8", "#7cc99c", "#33a46a", "#0e7f45"],
    film: "#2a241d",
    sprocket: "#f4f1ea",
  },
};

export const themeNames: readonly ThemeName[] = ["dark", "light"];

/** CSS font-family stacks. The embedded subset fonts come first. */
export const fontStack = {
  mono: `"KN Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
  display: `"KN Display", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`,
} as const;
