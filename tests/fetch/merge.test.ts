import { describe, expect, it } from "vitest";
import type { FeedSnapshot } from "../../src/contract/schema";
import { mergeFeedSnapshot } from "../../src/fetch/merge";

const NOW = new Date("2026-10-21T03:00:00.000Z");
const article = { title: "a", url: "https://zenn.dev/nixo/articles/a", publishedAt: "2026-10-01T00:00:00Z" };
const video = {
  id: "vwBRNTa6gVY",
  title: "v",
  url: "https://www.youtube.com/watch?v=vwBRNTa6gVY",
  thumbnail: "https://i.ytimg.com/vi/vwBRNTa6gVY/mqdefault.jpg",
  viewCount: 71000,
};
const previous: FeedSnapshot = { fetchedAt: "2026-10-20T00:00:00Z", zenn: [article], youtube: [video] };

describe("mergeFeedSnapshot", () => {
  it("uses every freshly fetched part and stamps the current time", () => {
    const fresh = { zenn: [{ ...article, title: "new" }], youtube: [{ ...video, viewCount: 72000 }] };
    expect(mergeFeedSnapshot(previous, fresh, NOW)).toEqual({ fetchedAt: "2026-10-21T03:00:00Z", ...fresh });
  });

  it("keeps the previous part when a source failed (undefined)", () => {
    const merged = mergeFeedSnapshot(previous, { zenn: [{ ...article, title: "new" }] }, NOW);
    expect(merged.youtube).toEqual([video]);
    expect(merged.zenn[0]?.title).toBe("new");
  });

  it("falls back to an empty list when there is nothing to keep", () => {
    expect(mergeFeedSnapshot(null, {}, NOW)).toEqual({ fetchedAt: "2026-10-21T03:00:00Z", zenn: [], youtube: [] });
  });

  it("returns a snapshot that satisfies the contract", () => {
    expect(() => mergeFeedSnapshot(previous, { youtube: [{ ...video, viewCount: -1 }] }, NOW)).toThrow();
  });
});
