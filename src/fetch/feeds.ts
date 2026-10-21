// Zenn (RSS 2.0) and YouTube (Atom) → FeedSnapshot.
// Parsing is pure and unit-tested from captured fixtures; network access goes
// through an injected `fetch` so the whole fetcher is testable offline.
import { XMLParser } from "fast-xml-parser";
import { type FeedItem, FeedSnapshot, type VideoItem } from "../contract/schema";

export const DEFAULT_LIMIT = { zenn: 5, youtube: 3 } as const;
export const DEFAULT_RETRY = { attempts: 3, delayMs: 1500 } as const;
/** Per request, so a hung connection cannot stall the daily workflow. */
const TIMEOUT_MS = 15_000;

export interface FetchFeedOptions {
  zennUser: string;
  youtubeChannelId: string;
  /** Becomes `fetchedAt`; the fetcher never reads the clock itself. */
  now: Date;
  fetch?: typeof fetch;
  limit?: { zenn?: number; youtube?: number };
  /** Feed GETs are retried on network errors, 404 and 5xx (YouTube's feed is flaky). */
  retry?: { attempts?: number; delayMs?: number };
}

/** A parsed upload before its thumbnail has been chosen. */
export type YoutubeEntry = Omit<VideoItem, "thumbnail">;

export function zennFeedUrl(user: string): string {
  return `https://zenn.dev/${encodeURIComponent(user)}/feed`;
}

export function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

/** RFC 822 / ISO 8601 with any offset → ISO 8601 in UTC (`…Z`), or null. */
export function toIsoUtc(value: string): string | null {
  const time = Date.parse(value);
  if (!value.trim() || Number.isNaN(time)) return null;
  return new Date(time).toISOString().replace(/\.000Z$/, "Z");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep titles such as "2026" as strings.
  parseTagValue: false,
  parseAttributeValue: false,
  // Decode numeric character references (&#39;) as well as the XML five.
  htmlEntities: true,
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function child(node: unknown, key: string): unknown {
  return isNode(node) ? node[key] : undefined;
}

function list(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Text content of an element whether or not it carried attributes. */
function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (isNode(value) && typeof value["#text"] === "string") return value["#text"];
  return "";
}

/** One line, single-spaced: titles end up in Markdown list items and HTML blocks. */
function cleanTitle(value: unknown): string {
  return text(value).replace(/\s+/g, " ").trim();
}

function httpUrl(value: string): string | null {
  const trimmed = value.trim();
  return /^https?:\/\/[^\s]+$/.test(trimmed) ? trimmed : null;
}

function newestFirst<T extends { publishedAt: string; url: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
  );
}

export function parseZennFeed(xml: string): FeedItem[] {
  const channel = child(child(parser.parse(xml), "rss"), "channel");
  if (channel === undefined) throw new Error("parseZennFeed: not an RSS 2.0 document (no <rss><channel>)");

  const items: FeedItem[] = [];
  for (const item of list(child(channel, "item"))) {
    const title = cleanTitle(child(item, "title"));
    const url = list(child(item, "link")).map(text).map(httpUrl).find((link) => link !== null) ?? null;
    const publishedAt = toIsoUtc(text(child(item, "pubDate")));
    if (!title || !url || !publishedAt) continue;
    items.push({ title, url, publishedAt });
  }
  return newestFirst(items);
}

const VIDEO_ID = /^[\w-]{11}$/;

export function parseYoutubeFeed(xml: string): YoutubeEntry[] {
  const feed = child(parser.parse(xml), "feed");
  if (feed === undefined) throw new Error("parseYoutubeFeed: not an Atom document (no <feed>)");

  const videos: YoutubeEntry[] = [];
  for (const entry of list(child(feed, "entry"))) {
    const id = text(child(entry, "yt:videoId")).trim();
    const title = cleanTitle(child(entry, "title"));
    const publishedAt = toIsoUtc(text(child(entry, "published")));
    const links = list(child(entry, "link"));
    const alternate = links.find((link) => child(link, "@_rel") === "alternate") ?? links[0];
    const href = text(child(alternate, "@_href"));
    // Shorts are only distinguishable by their alternate link in the Atom feed.
    if (href.includes("/shorts/")) continue;
    if (!VIDEO_ID.test(id) || !title || !publishedAt) continue;
    videos.push({ id, title, url: `https://www.youtube.com/watch?v=${id}`, publishedAt });
  }
  return newestFirst(videos);
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

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

interface Retry {
  attempts: number;
  delayMs: number;
}

/** youtube.com/feeds intermittently answers 404 or 500 for a valid channel. */
function isTransient(status: number): boolean {
  return status === 404 || status === 408 || status === 429 || status >= 500;
}

async function getText(url: string, fetchImpl: typeof fetch, retry: Retry): Promise<string> {
  let lastError = new Error(`feeds: GET ${url} was never attempted`);
  for (let attempt = 1; attempt <= Math.max(1, retry.attempts); attempt++) {
    if (attempt > 1 && retry.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retry.delayMs * (attempt - 1)));
    }
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      lastError = new Error(`feeds: GET ${url} failed: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
      continue;
    }
    if (response.ok) return response.text();
    lastError = new Error(`feeds: GET ${url} → HTTP ${response.status}`);
    if (!isTransient(response.status)) break;
  }
  throw lastError;
}

export async function fetchFeedSnapshot(opts: FetchFeedOptions): Promise<FeedSnapshot> {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const zennLimit = opts.limit?.zenn ?? DEFAULT_LIMIT.zenn;
  const youtubeLimit = opts.limit?.youtube ?? DEFAULT_LIMIT.youtube;
  const retry = {
    attempts: opts.retry?.attempts ?? DEFAULT_RETRY.attempts,
    delayMs: opts.retry?.delayMs ?? DEFAULT_RETRY.delayMs,
  };

  const [zennXml, youtubeXml] = await Promise.all([
    getText(zennFeedUrl(opts.zennUser), fetchImpl, retry),
    getText(youtubeFeedUrl(opts.youtubeChannelId), fetchImpl, retry),
  ]);

  const zenn = parseZennFeed(zennXml).slice(0, zennLimit);
  const entries = parseYoutubeFeed(youtubeXml).slice(0, youtubeLimit);
  const youtube = await Promise.all(
    entries.map(async (entry) => ({ ...entry, thumbnail: await pickThumbnail(entry.id, fetchImpl) })),
  );

  return FeedSnapshot.parse({ fetchedAt: toIsoUtc(opts.now.toISOString()), zenn, youtube });
}
