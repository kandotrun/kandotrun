import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VideoItem } from "../../src/contract/schema";
import {
  channelVideosUrl,
  fetchPopularVideos,
  parseFlatPlaylist,
  pickThumbnail,
  rankByViews,
  ytDlpArgs,
  ytDlpEnv,
} from "../../src/fetch/youtube";

const jaJson = readFileSync("tests/fixtures/yt-dlp-ja.json", "utf8");
const enJson = readFileSync("tests/fixtures/yt-dlp-en.json", "utf8");
const CHANNEL = "UCN2JUuxLy8A4jT3RVdN6smw";

/** HEAD for maxres thumbnails: 200 unless `missing` lists the id. */
function thumbFetch(missing: string[] = []) {
  const heads: string[] = [];
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    heads.push(url);
    const id = url.match(/\/vi\/([\w-]{11})\//)?.[1] ?? "";
    return new Response(null, { status: missing.includes(id) ? 404 : 200 });
  };
  return { heads, fetch: impl as typeof fetch };
}

/** A fake yt-dlp: answers by the `lang=` extractor argument, or fails. */
function fakeRun(answers: { ja?: string | Error; en?: string | Error }) {
  const calls: string[][] = [];
  const run = async (args: readonly string[]) => {
    calls.push([...args]);
    const lang = args.find((a) => a.startsWith("youtube:lang="))?.split("=")[1] as "ja" | "en";
    const answer = answers[lang];
    if (answer === undefined || answer instanceof Error) throw answer ?? new Error(`no answer for ${lang}`);
    return answer;
  };
  return { calls, run };
}

describe("yt-dlp invocation", () => {
  it("lists the channel's Videos tab, which leaves Shorts out", () => {
    expect(channelVideosUrl(CHANNEL)).toBe(`https://www.youtube.com/channel/${CHANNEL}/videos`);
  });

  it("asks for a flat JSON listing in one language", () => {
    expect(ytDlpArgs("ja", channelVideosUrl(CHANNEL))).toEqual([
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      "--extractor-args",
      "youtube:lang=ja",
      `https://www.youtube.com/channel/${CHANNEL}/videos`,
    ]);
  });

  it("runs without tokens or other secrets in its environment", () => {
    const env = ytDlpEnv({ PATH: "/bin", HOME: "/home/x", GITHUB_TOKEN: "t", PROFILE_TOKEN: "p", GH_TOKEN: "g" });
    expect(env).toEqual({ PATH: "/bin", HOME: "/home/x" });
  });
});

describe("parseFlatPlaylist", () => {
  it("reads id, title and view count, keeping the listing order", () => {
    expect(parseFlatPlaylist(enJson)).toEqual([
      { id: "rRWcNvxJvfk", title: "Running DeepSeek V4 on a 900,000 Yen DGX Spark: My Verdict—A MacBook Is Just Fine", viewCount: 9500 },
      expect.objectContaining({ id: "bXrsmVhOGn4", viewCount: 6400 }),
      expect.objectContaining({ id: "s1kUDZdbusU", viewCount: 8500 }),
      expect.objectContaining({ id: "8FmOzkeUvJ8", viewCount: 40000 }),
      expect.objectContaining({ id: "vwBRNTa6gVY", viewCount: 71000 }),
    ]);
  });

  it("keeps a missing view count as null (the Japanese listing cannot parse 万)", () => {
    const ja = parseFlatPlaylist(jaJson);
    expect(ja.find((v) => v.id === "vwBRNTa6gVY")?.viewCount).toBeNull();
    expect(ja.find((v) => v.id === "rRWcNvxJvfk")?.viewCount).toBe(9539);
  });

  it("skips live or upcoming streams and entries without a valid id or title", () => {
    const json = JSON.stringify({
      entries: [
        { id: "aaaaaaaaaaa", title: "ok", view_count: 1 },
        { id: "bbbbbbbbbbb", title: "live", view_count: 5, live_status: "is_live" },
        { id: "ccccccccccc", title: "soon", view_count: 0, live_status: "is_upcoming" },
        { id: "bad", title: "short id", view_count: 9 },
        { id: "ddddddddddd", title: "  ", view_count: 9 },
        null,
      ],
    });
    expect(parseFlatPlaylist(json).map((v) => v.id)).toEqual(["aaaaaaaaaaa"]);
  });

  it("collapses whitespace in titles", () => {
    const json = JSON.stringify({ entries: [{ id: "aaaaaaaaaaa", title: " a\n  b ", view_count: 1 }] });
    expect(parseFlatPlaylist(json)[0]?.title).toBe("a b");
  });

  it("throws on output that is not a playlist", () => {
    expect(() => parseFlatPlaylist("{}")).toThrow(/entries/);
    expect(() => parseFlatPlaylist("not json")).toThrow();
  });
});

describe("rankByViews", () => {
  const ja = parseFlatPlaylist(jaJson);
  const en = parseFlatPlaylist(enJson);

  it("takes Japanese titles and exact counts, falling back to the English rounded counts", () => {
    expect(rankByViews(ja, en, 3)).toEqual([
      { id: "vwBRNTa6gVY", url: "https://www.youtube.com/watch?v=vwBRNTa6gVY", title: "Mac mini品薄だけど、ローカルLLMは実用的じゃない【エンジニアの本音】", viewCount: 71000 },
      { id: "8FmOzkeUvJ8", url: "https://www.youtube.com/watch?v=8FmOzkeUvJ8", title: "3万円 vs 100万円 vs 300万円｜ローカルLLMはいくらあれば快適に動くのか検証してみた", viewCount: 40000 },
      { id: "rRWcNvxJvfk", url: "https://www.youtube.com/watch?v=rRWcNvxJvfk", title: "90万円のDGX SparkでDeepSeek V4を動かした結論。MacBookでいい", viewCount: 9539 },
    ]);
  });

  it("uses English titles when the Japanese listing is unavailable", () => {
    expect(rankByViews([], en, 1)).toEqual([expect.objectContaining({ id: "vwBRNTa6gVY", viewCount: 71000 })]);
  });

  it("breaks ties by listing order (newest first)", () => {
    const tied = [
      { id: "aaaaaaaaaaa", title: "newer", viewCount: 10 },
      { id: "bbbbbbbbbbb", title: "older", viewCount: 10 },
    ];
    expect(rankByViews([], tied, 2).map((v) => v.title)).toEqual(["newer", "older"]);
  });

  it("drops videos whose count is unknown in both listings", () => {
    const unknown = [{ id: "aaaaaaaaaaa", title: "?", viewCount: null }];
    expect(rankByViews(unknown, unknown, 3)).toEqual([]);
  });
});

describe("pickThumbnail", () => {
  it("prefers maxresdefault when the HEAD request succeeds", async () => {
    const { heads, fetch } = thumbFetch();
    await expect(pickThumbnail("-SE-qu4JSTY", fetch)).resolves.toBe("https://i.ytimg.com/vi/-SE-qu4JSTY/maxresdefault.jpg");
    expect(heads).toEqual(["https://i.ytimg.com/vi/-SE-qu4JSTY/maxresdefault.jpg"]);
  });

  it("falls back to mqdefault on 404 or a network error", async () => {
    await expect(pickThumbnail("-SE-qu4JSTY", thumbFetch(["-SE-qu4JSTY"]).fetch)).resolves.toBe(
      "https://i.ytimg.com/vi/-SE-qu4JSTY/mqdefault.jpg",
    );
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(pickThumbnail("-SE-qu4JSTY", failing)).resolves.toBe("https://i.ytimg.com/vi/-SE-qu4JSTY/mqdefault.jpg");
  });
});

describe("fetchPopularVideos", () => {
  it("returns the three most viewed regular videos with thumbnails", async () => {
    const { calls, run } = fakeRun({ ja: jaJson, en: enJson });
    const { heads, fetch } = thumbFetch(["8FmOzkeUvJ8"]);
    const videos = await fetchPopularVideos({ channelId: CHANNEL, run, fetch });
    expect(calls.map((args) => args[4])).toEqual(["youtube:lang=ja", "youtube:lang=en"]);
    expect(heads).toHaveLength(3);
    expect(videos).toEqual([
      expect.objectContaining({
        id: "vwBRNTa6gVY",
        url: "https://www.youtube.com/watch?v=vwBRNTa6gVY",
        thumbnail: "https://i.ytimg.com/vi/vwBRNTa6gVY/maxresdefault.jpg",
        viewCount: 71000,
      }),
      expect.objectContaining({ id: "8FmOzkeUvJ8", thumbnail: "https://i.ytimg.com/vi/8FmOzkeUvJ8/mqdefault.jpg" }),
      expect.objectContaining({ id: "rRWcNvxJvfk", viewCount: 9539 }),
    ]);
    for (const video of videos) expect(() => VideoItem.parse(video)).not.toThrow();
  });

  it("still works with English titles when the Japanese listing fails", async () => {
    const { run } = fakeRun({ ja: new Error("blocked"), en: enJson });
    const videos = await fetchPopularVideos({ channelId: CHANNEL, run, fetch: thumbFetch().fetch, limit: 1 });
    expect(videos.map((v) => v.id)).toEqual(["vwBRNTa6gVY"]);
  });

  it("fails when the English listing fails, because only it has every count", async () => {
    const { run } = fakeRun({ ja: jaJson, en: new Error("Sign in to confirm you're not a bot") });
    await expect(fetchPopularVideos({ channelId: CHANNEL, run, fetch: thumbFetch().fetch })).rejects.toThrow(/not a bot/);
  });

  it("fails rather than publishing an empty list", async () => {
    const empty = JSON.stringify({ entries: [] });
    const { run } = fakeRun({ ja: empty, en: empty });
    await expect(fetchPopularVideos({ channelId: CHANNEL, run, fetch: thumbFetch().fetch })).rejects.toThrow(/no videos/);
  });
});
