import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import type { FeedItem, FeedSnapshot, VideoItem } from "../../src/contract/schema";
import { renderLatest } from "../../src/readme/latest";

const zenn: FeedItem[] = [
  {
    title: "AI生成HTMLを「信頼せず」に配信する",
    url: "https://zenn.dev/nixo/articles/8f5807a6cefd36",
    publishedAt: "2026-06-22T02:04:09Z",
  },
  {
    // 16:13 UTC is already the next day in Japan.
    title: "日本語読み推定モデルを自作した",
    url: "https://zenn.dev/nixo/articles/3139042d4034f2",
    publishedAt: "2026-06-11T16:13:54Z",
  },
];

function video(id: string, day: number, title = `動画 ${id}`): VideoItem {
  return {
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    publishedAt: `2026-09-${String(day).padStart(2, "0")}T22:00:00Z`,
    thumbnail: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
  };
}

const youtube: VideoItem[] = [video("-SE-qu4JSTY", 7), video("2KjUQdEJOZQ", 5), video("rRWcNvxJvfk", 3), video("oOFbGsF_JR0", 1)];

function snapshot(parts: Partial<FeedSnapshot> = {}): FeedSnapshot {
  return { fetchedAt: "2026-10-21T03:00:00Z", zenn, youtube, ...parts };
}

/** The raw HTML block GitHub receives for the YouTube half. */
function youtubeBlock(markdown: string): string {
  return markdown.match(/<table align="left">[\s\S]*<br clear="all">/)?.[0] ?? "";
}

/** HTML void tags written as XML so fast-xml-parser can check well-formedness. */
function asXml(html: string): string {
  return `<root>${html.replace(/<(img|br)\b([^>]*)>/g, "<$1$2/>")}</root>`;
}

const ALLOWED_TAGS = new Set(["a", "img", "table", "tr", "td", "p", "br", "sub", "sup", "picture", "source", "details", "summary", "div"]);

describe("renderLatest", () => {
  const md = renderLatest(snapshot());

  it("renders nothing when both feeds are empty", () => {
    expect(renderLatest(snapshot({ zenn: [], youtube: [] }))).toBe("");
  });

  it("lists Zenn articles as `YYYY-MM-DD` · [title](url), dated in Japan time", () => {
    expect(md).toContain("#### Zenn");
    expect(md).toContain("- `2026-06-22` · [AI生成HTMLを「信頼せず」に配信する](https://zenn.dev/nixo/articles/8f5807a6cefd36)");
    expect(md).toContain("- `2026-06-12` · [日本語読み推定モデルを自作した](https://zenn.dev/nixo/articles/3139042d4034f2)");
  });

  it("orders each half newest first regardless of snapshot order", () => {
    const shuffled = renderLatest(snapshot({ zenn: [...zenn].reverse(), youtube: [...youtube].reverse() }));
    expect(shuffled).toBe(md);
  });

  it("shows up to three linked YouTube thumbnails with dates and titles beneath", () => {
    expect(md).toContain("#### YouTube");
    const block = youtubeBlock(md);
    const cards = block.match(/<table align="left">[\s\S]*?<\/table>/g) ?? [];
    expect(cards).toHaveLength(3);
    expect(cards[0]).toBe(
      [
        `<table align="left">`,
        `<tr>`,
        `<td width="246" valign="top">` +
          `<a href="https://www.youtube.com/watch?v=-SE-qu4JSTY"><img src="https://i.ytimg.com/vi/-SE-qu4JSTY/maxresdefault.jpg" width="219" alt="動画 -SE-qu4JSTY"></a>` +
          `<br><sub>2026-09-08</sub>` +
          `<br><a href="https://www.youtube.com/watch?v=-SE-qu4JSTY">動画 -SE-qu4JSTY</a>` +
          `</td>`,
        `</tr>`,
        `</table>`,
      ].join("\n"),
    );
    expect(md).not.toContain("oOFbGsF_JR0");
  });

  it("floats the cards so they sit side by side on desktop and stack on phones, then clears", () => {
    // github.com: README column 846 px, td is border-box with 13 px padding and a
    // 1 px border (content-box under plain github-markdown-css), so three cards fit in an 830 px column either way and a 219 px image fills each.
    const block = youtubeBlock(md);
    expect(block.match(/<td width="246"/g)).toHaveLength(3);
    expect(block.endsWith(`</table>\n<br clear="all">`)).toBe(true);
    expect(md.endsWith(`<br clear="all">`)).toBe(true);
  });

  it("puts Zenn above YouTube", () => {
    expect(md.indexOf("#### Zenn")).toBeLessThan(md.indexOf("#### YouTube"));
  });

  it("drops the Zenn half when there are no articles", () => {
    const only = renderLatest(snapshot({ zenn: [] }));
    expect(only).not.toContain("Zenn");
    expect(only.startsWith("#### YouTube")).toBe(true);
  });

  it("drops the YouTube half when there are no videos", () => {
    const only = renderLatest(snapshot({ youtube: [] }));
    expect(only).not.toContain("YouTube");
    expect(only).not.toContain("<table");
    expect(only.startsWith("#### Zenn")).toBe(true);
  });

  it("separates blocks with blank lines and keeps the HTML block free of them", () => {
    expect(md).toMatch(/#### Zenn\n\n- /);
    expect(md).toMatch(/#### YouTube\n\n<table align="left">/);
    expect(youtubeBlock(md)).not.toMatch(/\n\s*\n/);
    expect(md.endsWith("\n")).toBe(false);
  });

  it("only uses HTML that GitHub's sanitizer keeps, and the HTML is well-formed", () => {
    const tags = [...md.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1]?.toLowerCase() ?? "");
    for (const tag of tags) expect(ALLOWED_TAGS.has(tag), `<${tag}> is not allowed`).toBe(true);
    expect(XMLValidator.validate(asXml(youtubeBlock(md)))).toBe(true);
  });

  it("is deterministic", () => {
    expect(renderLatest(snapshot())).toBe(md);
  });

  describe("escaping hostile titles", () => {
    const nasty = 'a [b] | <c> & "d" `e` *f* _g_ ~h~ \\ $x$ &copy;';
    const out = renderLatest(
      snapshot({
        zenn: [{ ...zenn[0]!, title: nasty }],
        youtube: [{ ...video("-SE-qu4JSTY", 7), title: nasty }],
      }),
    );

    it("escapes Markdown link text", () => {
      const line = out.split("\n").find((l) => l.startsWith("- "));
      expect(line).toBe(
        "- `2026-06-22` · [a \\[b\\] \\| &lt;c&gt; &amp; \"d\" \\`e\\` \\*f\\* \\_g\\_ \\~h\\~ \\\\ \\$x\\$ &amp;copy;](https://zenn.dev/nixo/articles/8f5807a6cefd36)",
      );
    });

    it("escapes HTML attributes and text in the thumbnail table", () => {
      const table = youtubeBlock(out);
      const escaped = "a [b] | &lt;c&gt; &amp; &quot;d&quot; `e` *f* _g_ ~h~ \\ $x$ &amp;copy;";
      expect(table).toContain(`alt="${escaped}"`);
      expect(table).toContain(`>${escaped}</a>`);
      expect(table).not.toContain("<c>");
      expect(XMLValidator.validate(asXml(table))).toBe(true);
    });

    it("keeps multi-line titles on one line so the HTML block is not cut short", () => {
      const multi = renderLatest(snapshot({ zenn: [], youtube: [{ ...video("-SE-qu4JSTY", 7), title: "line one\n\nline two" }] }));
      expect(multi).toContain(">line one line two</a>");
      expect(youtubeBlock(multi)).not.toMatch(/\n\s*\n/);
    });

    it("percent-encodes parentheses and spaces in Markdown link destinations", () => {
      const odd = renderLatest(
        snapshot({ youtube: [], zenn: [{ ...zenn[0]!, url: "https://zenn.dev/nixo/articles/a(b) c" }] }),
      );
      expect(odd).toContain("](https://zenn.dev/nixo/articles/a%28b%29%20c)");
    });
  });
});
