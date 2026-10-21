// MEDIA section body: newest Zenn articles as a Markdown list and the most
// viewed YouTube videos as linked thumbnails. Pure: FeedSnapshot in, Markdown
// out. The caller (render.ts) owns the "### MEDIA" heading and drops it when
// this returns "".
import type { FeedItem, FeedSnapshot, VideoItem } from "../contract/schema";
import { esc } from "../render/svg";

const MAX_VIDEOS = 3;
/**
 * Each video is its own `<table align="left">` card, so cards float side by side
 * and wrap: 3 per row in github.com's 846 px README column, 2 at mid widths, 1 on
 * phones (a single 3-column table would squeeze thumbnails to ~60 px there).
 * github.com's td is border-box (Primer's global reset) with 13 px padding and a
 * 1 px collapsed border; plain github-markdown-css leaves it content-box. A 246 px
 * cell fits three per row either way (3 × 247 or 3 × 273 ≤ 830) and holds a 219 px
 * thumbnail.
 */
const CARD_WIDTH = 246;
const THUMB_WIDTH = CARD_WIDTH - 2 * 13 - 1;
/** Japan has no DST, so a fixed offset gives the date readers see on Zenn/YouTube. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstDate(iso: string): string {
  return new Date(Date.parse(iso) + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function newestFirst(items: readonly FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function mostViewedFirst(videos: readonly VideoItem[]): VideoItem[] {
  return [...videos].sort((a, b) => b.viewCount - a.viewCount);
}

/** YouTube's Japanese style: "9,539回再生" under 10,000, then "7.1万回再生" / "4万回再生". */
export function formatViews(count: number): string {
  if (count < 10_000) return `${count.toLocaleString("en-US")}回再生`;
  return `${(Math.round(count / 1_000) / 10).toString()}万回再生`;
}

/**
 * Markdown link text: HTML specials become entities (so "&copy;" stays literal)
 * and every character with inline meaning in GFM is backslash-escaped,
 * including `|` (tables), `~` (strikethrough) and `$` (math).
 */
function mdText(text: string): string {
  return oneLine(text)
    .replace(/[\\`*_[\]|~$]/g, (ch) => `\\${ch}`)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Markdown link destination: no raw parentheses, whitespace or angle brackets. */
function mdUrl(url: string): string {
  return url.replace(/[()<>\s]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

function zennList(items: readonly FeedItem[]): string {
  return newestFirst(items)
    .map((item) => `- \`${jstDate(item.publishedAt)}\` · [${mdText(item.title)}](${mdUrl(item.url)})`)
    .join("\n");
}

function videoCard(video: VideoItem): string {
  const title = esc(oneLine(video.title));
  const href = esc(video.url);
  const cell = [
    `<td width="${CARD_WIDTH}" valign="top">`,
    `<a href="${href}"><img src="${esc(video.thumbnail)}" width="${THUMB_WIDTH}" alt="${title}"></a>`,
    `<br><sub>▶ ${formatViews(video.viewCount)}</sub>`,
    `<br><a href="${href}">${title}</a>`,
    `</td>`,
  ].join("");
  return [`<table align="left">`, "<tr>", cell, "</tr>", "</table>"].join("\n");
}

/** One HTML block (no blank lines inside); `clear` stops the next section wrapping around the cards. */
function youtubeCards(videos: readonly VideoItem[]): string {
  const cards = mostViewedFirst(videos).slice(0, MAX_VIDEOS).map(videoCard);
  return [...cards, `<br clear="all">`].join("\n");
}

export function renderMedia(feeds: FeedSnapshot): string {
  const blocks: string[] = [];
  if (feeds.zenn.length > 0) blocks.push("#### Zenn <sub>新着記事</sub>", zennList(feeds.zenn));
  if (feeds.youtube.length > 0) blocks.push(`#### YouTube <sub>再生数トップ ${MAX_VIDEOS}</sub>`, youtubeCards(feeds.youtube));
  return blocks.join("\n\n");
}
