import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FeedSnapshot } from "../../src/contract/schema";
import {
  fetchFeedSnapshot,
  parseYoutubeFeed,
  parseZennFeed,
  pickThumbnail,
  toIsoUtc,
  youtubeFeedUrl,
  zennFeedUrl,
} from "../../src/fetch/feeds";

const zennXml = readFileSync("tests/fixtures/zenn-feed.xml", "utf8");
const youtubeXml = readFileSync("tests/fixtures/youtube-feed.xml", "utf8");

const ZENN_URL = "https://zenn.dev/nixo/feed";
const YT_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=UCN2JUuxLy8A4jT3RVdN6smw";
const NOW = new Date("2026-10-21T03:00:00.000Z");

interface Call {
  url: string;
  method: string;
}

/** A fake `fetch` that serves the fixtures and answers HEAD for maxres thumbnails. */
function fakeFetch(
  options: {
    maxres?: (id: string) => boolean | "throw";
    /** A fixed status, or a queue of statuses served before the real body. */
    status?: Record<string, number | number[]>;
  } = {},
) {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    const planned = options.status?.[url];
    const status = Array.isArray(planned) ? planned.shift() : planned;
    if (status) return new Response("nope", { status });
    if (url === ZENN_URL) return new Response(zennXml, { status: 200 });
    if (url === YT_URL) return new Response(youtubeXml, { status: 200 });
    const thumb = url.match(/^https:\/\/i\.ytimg\.com\/vi\/([\w-]{11})\/maxresdefault\.jpg$/);
    if (thumb?.[1]) {
      const answer = options.maxres?.(thumb[1]) ?? true;
      if (answer === "throw") throw new TypeError("fetch failed");
      return new Response(null, { status: answer ? 200 : 404 });
    }
    return new Response("unexpected", { status: 500 });
  };
  return { calls, fetch: impl as typeof fetch };
}

describe("feed URLs", () => {
  it("builds the Zenn RSS and YouTube Atom URLs", () => {
    expect(zennFeedUrl("nixo")).toBe(ZENN_URL);
    expect(youtubeFeedUrl("UCN2JUuxLy8A4jT3RVdN6smw")).toBe(YT_URL);
  });

  it("encodes user input", () => {
    expect(zennFeedUrl("a/b")).toBe("https://zenn.dev/a%2Fb/feed");
    expect(youtubeFeedUrl("UC&x")).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UC%26x");
  });
});

describe("toIsoUtc", () => {
  it("normalises RFC 822 and offset timestamps to ISO 8601 UTC", () => {
    expect(toIsoUtc("Mon, 22 Jun 2026 02:04:09 GMT")).toBe("2026-06-22T02:04:09Z");
    expect(toIsoUtc("2026-09-07T22:00:24+00:00")).toBe("2026-09-07T22:00:24Z");
    expect(toIsoUtc("2026-09-08T07:00:24+09:00")).toBe("2026-09-07T22:00:24Z");
  });

  it("keeps sub-second precision only when present", () => {
    expect(toIsoUtc("2026-09-07T22:00:24.250Z")).toBe("2026-09-07T22:00:24.250Z");
  });

  it("returns null for anything unparseable", () => {
    expect(toIsoUtc("")).toBeNull();
    expect(toIsoUtc("yesterday")).toBeNull();
  });
});

describe("parseZennFeed", () => {
  const items = parseZennFeed(zennXml);

  it("reads every article from the captured feed, newest first", () => {
    expect(items).toHaveLength(6);
    expect(items[0]).toEqual({
      title: "AI生成HTMLを「信頼せず」に配信する ― Cloudflare Workers + Hono で作る認証付きホスティングの設計",
      url: "https://zenn.dev/nixo/articles/8f5807a6cefd36",
      publishedAt: "2026-06-22T02:04:09Z",
    });
    expect(items.at(-1)?.publishedAt).toBe("2024-02-08T23:00:00Z");
    const times = items.map((item) => Date.parse(item.publishedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("keeps CDATA titles verbatim, including backslashes and asterisks", () => {
    const titles = items.map((item) => item.title);
    expect(titles).toContain("Next.jsでdangerouslySetInnerHtmlを使わずに改行コード(\\n)で改行する方法");
    expect(titles).toContain("【Ollama Vision】ローカルLLMで画像解析をする方法*");
  });

  it("includes articles published under an organisation", () => {
    expect(items.map((item) => item.url)).toContain("https://zenn.dev/fp16/articles/c3a080a68b3b59");
  });

  it("handles a feed with a single item and collapses whitespace in titles", () => {
    const xml = `<rss><channel><item><title><![CDATA[  2026
      年の  まとめ ]]></title><link>https://zenn.dev/nixo/articles/x</link><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseZennFeed(xml)).toEqual([
      { title: "2026 年の まとめ", url: "https://zenn.dev/nixo/articles/x", publishedAt: "2026-09-01T00:00:00Z" },
    ]);
  });

  it("returns an empty list for a feed without items", () => {
    expect(parseZennFeed(`<rss><channel><title>empty</title></channel></rss>`)).toEqual([]);
  });

  it("skips items without a title, an http(s) link or a valid date", () => {
    const xml = `<rss><channel>
      <item><title>no link</title><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item>
      <item><title>bad link</title><link>javascript:alert(1)</link><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item>
      <item><title>bad date</title><link>https://zenn.dev/a</link><pubDate>soon</pubDate></item>
      <item><link>https://zenn.dev/b</link><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item>
      <item><title>ok</title><link>https://zenn.dev/c</link><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item>
    </channel></rss>`;
    expect(parseZennFeed(xml).map((item) => item.title)).toEqual(["ok"]);
  });

  it("throws on a document that is not RSS", () => {
    expect(() => parseZennFeed("<html><body>maintenance</body></html>")).toThrow(/RSS/);
  });
});

describe("parseYoutubeFeed", () => {
  const videos = parseYoutubeFeed(youtubeXml);

  it("reads regular uploads newest first and drops Shorts (/shorts/ links)", () => {
    expect(videos.map((video) => video.id)).toEqual(["-SE-qu4JSTY", "2KjUQdEJOZQ", "5VuQLpbftcE", "xXpVQltkNAI"]);
    expect(videos.some((video) => video.url.includes("/shorts/"))).toBe(false);
  });

  it("maps title, canonical watch URL and ISO date", () => {
    expect(videos[0]).toEqual({
      id: "-SE-qu4JSTY",
      title: "Osmo Pocket 4Pが良すぎて、X-M5を売ることにした",
      url: "https://www.youtube.com/watch?v=-SE-qu4JSTY",
      publishedAt: "2026-09-07T22:00:24Z",
    });
  });

  it("decodes XML and numeric entities in titles", () => {
    const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom"><entry>
      <yt:videoId>abcdefghijk</yt:videoId>
      <title>R&amp;D &lt;live&gt; &quot;Q&amp;A&quot; &#39;24 &#x2603;</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=abcdefghijk"/>
      <published>2026-09-01T00:00:00+00:00</published>
    </entry></feed>`;
    expect(parseYoutubeFeed(xml)[0]?.title).toBe(`R&D <live> "Q&A" '24 ☃`);
  });

  it("skips entries with an invalid video id or date", () => {
    const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry>
      <yt:videoId>short</yt:videoId><title>x</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=short"/>
      <published>2026-09-01T00:00:00+00:00</published>
    </entry><entry>
      <yt:videoId>abcdefghijk</yt:videoId><title>y</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=abcdefghijk"/>
      <published>later</published>
    </entry></feed>`;
    expect(parseYoutubeFeed(xml)).toEqual([]);
  });

  it("throws on a document that is not an Atom feed", () => {
    expect(() => parseYoutubeFeed("<rss><channel/></rss>")).toThrow(/Atom/);
  });
});

describe("pickThumbnail", () => {
  it("prefers maxresdefault when the HEAD request succeeds", async () => {
    const { calls, fetch } = fakeFetch({ maxres: () => true });
    await expect(pickThumbnail("-SE-qu4JSTY", fetch)).resolves.toBe("https://i.ytimg.com/vi/-SE-qu4JSTY/maxresdefault.jpg");
    expect(calls).toEqual([{ url: "https://i.ytimg.com/vi/-SE-qu4JSTY/maxresdefault.jpg", method: "HEAD" }]);
  });

  it("falls back to mqdefault on 404", async () => {
    const { fetch } = fakeFetch({ maxres: () => false });
    await expect(pickThumbnail("-SE-qu4JSTY", fetch)).resolves.toBe("https://i.ytimg.com/vi/-SE-qu4JSTY/mqdefault.jpg");
  });

  it("falls back to mqdefault when the request fails", async () => {
    const { fetch } = fakeFetch({ maxres: () => "throw" });
    await expect(pickThumbnail("-SE-qu4JSTY", fetch)).resolves.toBe("https://i.ytimg.com/vi/-SE-qu4JSTY/mqdefault.jpg");
  });
});

describe("fetchFeedSnapshot", () => {
  const base = {
    zennUser: "nixo",
    youtubeChannelId: "UCN2JUuxLy8A4jT3RVdN6smw",
    now: NOW,
    retry: { attempts: 3, delayMs: 0 },
  };

  it("fetches both feeds and applies the default limits (Zenn 5, YouTube 3)", async () => {
    const { calls, fetch } = fakeFetch();
    const snapshot = await fetchFeedSnapshot({ ...base, fetch });
    expect(calls.filter((call) => call.method === "GET").map((call) => call.url)).toEqual(
      expect.arrayContaining([ZENN_URL, YT_URL]),
    );
    expect(snapshot.fetchedAt).toBe("2026-10-21T03:00:00Z");
    expect(snapshot.zenn).toHaveLength(5);
    expect(snapshot.youtube.map((video) => video.id)).toEqual(["-SE-qu4JSTY", "2KjUQdEJOZQ", "5VuQLpbftcE"]);
    expect(() => FeedSnapshot.parse(snapshot)).not.toThrow();
  });

  it("checks maxres thumbnails only for the videos it keeps", async () => {
    const { calls, fetch } = fakeFetch({ maxres: (id) => id !== "2KjUQdEJOZQ" });
    const snapshot = await fetchFeedSnapshot({ ...base, fetch });
    expect(calls.filter((call) => call.method === "HEAD")).toHaveLength(3);
    expect(snapshot.youtube.map((video) => video.thumbnail)).toEqual([
      "https://i.ytimg.com/vi/-SE-qu4JSTY/maxresdefault.jpg",
      "https://i.ytimg.com/vi/2KjUQdEJOZQ/mqdefault.jpg",
      "https://i.ytimg.com/vi/5VuQLpbftcE/maxresdefault.jpg",
    ]);
  });

  it("honours custom limits", async () => {
    const { fetch } = fakeFetch();
    const snapshot = await fetchFeedSnapshot({ ...base, fetch, limit: { zenn: 2, youtube: 0 } });
    expect(snapshot.zenn.map((item) => item.url)).toEqual([
      "https://zenn.dev/nixo/articles/8f5807a6cefd36",
      "https://zenn.dev/nixo/articles/3139042d4034f2",
    ]);
    expect(snapshot.youtube).toEqual([]);
  });

  it("is deterministic for the same responses and clock", async () => {
    const a = await fetchFeedSnapshot({ ...base, fetch: fakeFetch().fetch });
    const b = await fetchFeedSnapshot({ ...base, fetch: fakeFetch().fetch });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("retries the flaky YouTube endpoint (it intermittently answers 404/500)", async () => {
    const { calls, fetch } = fakeFetch({ status: { [YT_URL]: [500, 404] } });
    const snapshot = await fetchFeedSnapshot({ ...base, fetch });
    expect(calls.filter((call) => call.url === YT_URL)).toHaveLength(3);
    expect(snapshot.youtube).toHaveLength(3);
  });

  it("rejects with the failing URL once the attempts are used up", async () => {
    const { calls, fetch } = fakeFetch({ status: { [ZENN_URL]: 503 } });
    await expect(fetchFeedSnapshot({ ...base, fetch })).rejects.toThrow(/zenn\.dev\/nixo\/feed.*503/);
    expect(calls.filter((call) => call.url === ZENN_URL)).toHaveLength(3);
  });

  it("names the URL when the network itself fails", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchFeedSnapshot({ ...base, fetch: failing })).rejects.toThrow(/GET https:\/\/.*failed: fetch failed/);
  });

  it("does not retry client errors other than 404", async () => {
    const { calls, fetch } = fakeFetch({ status: { [ZENN_URL]: 403 } });
    await expect(fetchFeedSnapshot({ ...base, fetch })).rejects.toThrow(/403/);
    expect(calls.filter((call) => call.url === ZENN_URL)).toHaveLength(1);
  });
});

describe("committed snapshot", () => {
  it("data/snapshot/feeds.json matches the FeedSnapshot contract", () => {
    const json: unknown = JSON.parse(readFileSync("data/snapshot/feeds.json", "utf8"));
    const snapshot = FeedSnapshot.parse(json);
    expect(snapshot.zenn.length).toBeLessThanOrEqual(5);
    expect(snapshot.youtube.length).toBeLessThanOrEqual(3);
    for (const video of snapshot.youtube) {
      expect(video.url).not.toContain("/shorts/");
      expect(video.thumbnail).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/(maxres|mq)default\.jpg$/);
    }
  });
});
