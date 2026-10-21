// Most viewed regular uploads of a channel, without an API key.
//
// yt-dlp lists the channel's Videos tab (Shorts live on a separate tab). It runs
// twice: with lang=ja for the Japanese titles and exact counts under 10,000, and
// with lang=en because yt-dlp cannot parse counts written as "7.1万" — the English
// listing has every count, rounded above 10,000. Parsing and ranking are pure;
// the process runner and `fetch` are injected so everything is testable offline.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VideoItem } from "../contract/schema";

export const DEFAULT_LIMIT = 3;
const TIMEOUT_MS = 15_000;
const YT_DLP_TIMEOUT_MS = 120_000;

/** Runs yt-dlp with the given arguments and resolves with its stdout. */
export type YtDlpRunner = (args: readonly string[]) => Promise<string>;

export interface FlatEntry {
  id: string;
  title: string;
  /** null when yt-dlp could not read the count. */
  viewCount: number | null;
}

export function channelVideosUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}/videos`;
}

export function ytDlpArgs(lang: "ja" | "en", url: string): string[] {
  return ["--flat-playlist", "--dump-single-json", "--no-warnings", "--extractor-args", `youtube:lang=${lang}`, url];
}

/** yt-dlp only needs to find its binary and a home directory; it never sees tokens. */
export function ytDlpEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "LANG", "TMPDIR"]) {
    if (env[key] !== undefined) out[key] = env[key];
  }
  return out;
}

const execFileAsync = promisify(execFile);

export const runYtDlp: YtDlpRunner = async (args) => {
  const { stdout } = await execFileAsync("yt-dlp", [...args], {
    env: ytDlpEnv(process.env),
    timeout: YT_DLP_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
};

const VIDEO_ID = /^[\w-]{11}$/;
const NOT_UPLOADED = new Set(["is_live", "is_upcoming", "post_live"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** yt-dlp `--flat-playlist --dump-single-json` output → entries in listing order (newest first). */
export function parseFlatPlaylist(json: string): FlatEntry[] {
  const data: unknown = JSON.parse(json);
  if (!isRecord(data) || !Array.isArray(data.entries)) {
    throw new Error("parseFlatPlaylist: yt-dlp output has no entries array");
  }
  const entries: FlatEntry[] = [];
  for (const entry of data.entries) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id : "";
    const title = typeof entry.title === "string" ? entry.title.replace(/\s+/g, " ").trim() : "";
    if (!VIDEO_ID.test(id) || !title) continue;
    if (typeof entry.live_status === "string" && NOT_UPLOADED.has(entry.live_status)) continue;
    const views = entry.view_count;
    entries.push({ id, title, viewCount: typeof views === "number" && Number.isInteger(views) && views >= 0 ? views : null });
  }
  return entries;
}

/**
 * Joins the two listings by id — Japanese title and count first, English as the
 * fallback — drops unknown counts, and keeps the top `limit` by views. Ties keep
 * the English listing order, which is newest first.
 */
export function rankByViews(ja: readonly FlatEntry[], en: readonly FlatEntry[], limit: number): Omit<VideoItem, "thumbnail">[] {
  const japanese = new Map(ja.map((entry) => [entry.id, entry]));
  const ranked = en
    .map((entry, order) => {
      const local = japanese.get(entry.id);
      return { id: entry.id, title: local?.title ?? entry.title, viewCount: local?.viewCount ?? entry.viewCount, order };
    })
    .filter((entry): entry is typeof entry & { viewCount: number } => entry.viewCount !== null)
    .sort((a, b) => b.viewCount - a.viewCount || a.order - b.order);
  return ranked.slice(0, limit).map(({ id, title, viewCount }) => ({
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    viewCount,
  }));
}

export function thumbnailUrl(id: string, quality: "maxresdefault" | "mqdefault"): string {
  return `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
}

/**
 * maxresdefault (1280×720) only exists for some uploads; YouTube answers 404
 * otherwise. mqdefault (320×180) always exists and, unlike hqdefault, is 16:9
 * without letterboxing, so both choices share an aspect ratio in the README.
 */
export async function pickThumbnail(id: string, fetchImpl: typeof fetch): Promise<string> {
  const maxres = thumbnailUrl(id, "maxresdefault");
  try {
    const response = await fetchImpl(maxres, { method: "HEAD", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) return maxres;
  } catch {
    // Network trouble is not worth failing the snapshot over.
  }
  return thumbnailUrl(id, "mqdefault");
}

export interface FetchPopularOptions {
  channelId: string;
  limit?: number;
  run?: YtDlpRunner;
  fetch?: typeof fetch;
}

export async function fetchPopularVideos(opts: FetchPopularOptions): Promise<VideoItem[]> {
  const run = opts.run ?? runYtDlp;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const url = channelVideosUrl(opts.channelId);

  // The Japanese listing only improves titles; the English one is required.
  const ja = await run(ytDlpArgs("ja", url)).then(parseFlatPlaylist, () => []);
  const en = parseFlatPlaylist(await run(ytDlpArgs("en", url)));

  const ranked = rankByViews(ja, en, opts.limit ?? DEFAULT_LIMIT);
  if (ranked.length === 0) throw new Error(`fetchPopularVideos: no videos with a view count at ${url}`);
  return Promise.all(ranked.map(async (video) => ({ ...video, thumbnail: await pickThumbnail(video.id, fetchImpl) })));
}
