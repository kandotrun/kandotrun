// Zenn (RSS 2.0) → newest articles. YouTube is ranked by views in ./youtube.ts.
// Parsing is pure and unit-tested from a captured fixture; network access goes
// through an injected `fetch` so the whole fetcher is testable offline.
import { XMLParser } from "fast-xml-parser";
import type { FeedItem } from "../contract/schema";

export const DEFAULT_LIMIT = 5;
export const DEFAULT_RETRY = { attempts: 3, delayMs: 1500 } as const;
/** Per request, so a hung connection cannot stall the daily workflow. */
const TIMEOUT_MS = 15_000;

export interface FetchZennOptions {
  user: string;
  limit?: number;
  fetch?: typeof fetch;
  /** GETs are retried on network errors, 404 and 5xx. */
  retry?: { attempts?: number; delayMs?: number };
}

export function zennFeedUrl(user: string): string {
  return `https://zenn.dev/${encodeURIComponent(user)}/feed`;
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
  isArray: (name) => name === "item" || name === "link",
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

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

interface Retry {
  attempts: number;
  delayMs: number;
}

/** Feeds occasionally answer 404 or 5xx for a valid URL; those are worth a retry. */
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

export async function fetchZennFeed(opts: FetchZennOptions): Promise<FeedItem[]> {
  const retry = {
    attempts: opts.retry?.attempts ?? DEFAULT_RETRY.attempts,
    delayMs: opts.retry?.delayMs ?? DEFAULT_RETRY.delayMs,
  };
  const xml = await getText(zennFeedUrl(opts.user), opts.fetch ?? globalThis.fetch, retry);
  return parseZennFeed(xml).slice(0, opts.limit ?? DEFAULT_LIMIT);
}
