import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FeedSnapshot } from "../../src/contract/schema";
import { fetchZennFeed, parseZennFeed, toIsoUtc, zennFeedUrl } from "../../src/fetch/feeds";

const zennXml = readFileSync("tests/fixtures/zenn-feed.xml", "utf8");

const ZENN_URL = "https://zenn.dev/nixo/feed";

interface Call {
  url: string;
  method: string;
}

/** A fake `fetch` that serves the Zenn fixture, optionally after planned error statuses. */
function fakeFetch(options: { status?: Record<string, number | number[]> } = {}) {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, method: init?.method ?? "GET" });
    const planned = options.status?.[url];
    const status = Array.isArray(planned) ? planned.shift() : planned;
    if (status) return new Response("nope", { status });
    if (url === ZENN_URL) return new Response(zennXml, { status: 200 });
    return new Response("unexpected", { status: 500 });
  };
  return { calls, fetch: impl as typeof fetch };
}

describe("zennFeedUrl", () => {
  it("builds the Zenn RSS URL and encodes user input", () => {
    expect(zennFeedUrl("nixo")).toBe(ZENN_URL);
    expect(zennFeedUrl("a/b")).toBe("https://zenn.dev/a%2Fb/feed");
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

describe("fetchZennFeed", () => {
  const base = { user: "nixo", retry: { attempts: 3, delayMs: 0 } };

  it("returns the newest five articles by default", async () => {
    const { calls, fetch } = fakeFetch();
    const items = await fetchZennFeed({ ...base, fetch });
    expect(calls).toEqual([{ url: ZENN_URL, method: "GET" }]);
    expect(items).toHaveLength(5);
  });

  it("honours a custom limit", async () => {
    const items = await fetchZennFeed({ ...base, fetch: fakeFetch().fetch, limit: 2 });
    expect(items.map((item) => item.url)).toEqual([
      "https://zenn.dev/nixo/articles/8f5807a6cefd36",
      "https://zenn.dev/nixo/articles/3139042d4034f2",
    ]);
  });

  it("is deterministic for the same response", async () => {
    const a = await fetchZennFeed({ ...base, fetch: fakeFetch().fetch });
    const b = await fetchZennFeed({ ...base, fetch: fakeFetch().fetch });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("retries transient errors (404/5xx)", async () => {
    const { calls, fetch } = fakeFetch({ status: { [ZENN_URL]: [500, 404] } });
    await expect(fetchZennFeed({ ...base, fetch })).resolves.toHaveLength(5);
    expect(calls).toHaveLength(3);
  });

  it("rejects with the failing URL once the attempts are used up", async () => {
    const { calls, fetch } = fakeFetch({ status: { [ZENN_URL]: 503 } });
    await expect(fetchZennFeed({ ...base, fetch })).rejects.toThrow(/zenn\.dev\/nixo\/feed.*503/);
    expect(calls).toHaveLength(3);
  });

  it("names the URL when the network itself fails", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchZennFeed({ ...base, fetch: failing })).rejects.toThrow(/GET https:\/\/.*failed: fetch failed/);
  });

  it("does not retry client errors other than 404", async () => {
    const { calls, fetch } = fakeFetch({ status: { [ZENN_URL]: 403 } });
    await expect(fetchZennFeed({ ...base, fetch })).rejects.toThrow(/403/);
    expect(calls).toHaveLength(1);
  });
});

describe("committed snapshot", () => {
  it("data/snapshot/feeds.json matches the FeedSnapshot contract", () => {
    const json: unknown = JSON.parse(readFileSync("data/snapshot/feeds.json", "utf8"));
    const snapshot = FeedSnapshot.parse(json);
    expect(snapshot.zenn.length).toBeLessThanOrEqual(5);
    expect(snapshot.youtube.length).toBeLessThanOrEqual(3);
    const views = snapshot.youtube.map((video) => video.viewCount);
    expect(views).toEqual([...views].sort((a, b) => b - a));
    for (const video of snapshot.youtube) {
      expect(video.url).toBe(`https://www.youtube.com/watch?v=${video.id}`);
      expect(video.thumbnail).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/(maxres|mq)default\.jpg$/);
    }
  });
});
