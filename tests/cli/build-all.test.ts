import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { photos } from "../../data/photos";
import { profile } from "../../data/profile";
import { buildAll } from "../../src/cli/build-all";
import { FeedSnapshot, GitHubSnapshot } from "../../src/contract/schema";
import { fakeAssets } from "../helpers/fake-assets";

const github = GitHubSnapshot.parse(JSON.parse(readFileSync("tests/fixtures/contrib-snapshot.json", "utf8")));
const feeds = FeedSnapshot.parse(JSON.parse(readFileSync("data/snapshot/feeds.json", "utf8")));
const input = { profile, photos, github, feeds };

describe("buildAll", () => {
  it("renders every themed SVG and README.md in memory", async () => {
    const files = await buildAll(input, fakeAssets());
    const svgs = [...files.keys()].filter((path) => path.endsWith(".svg"));
    // hero, stats and contrib plus one frame per featured project, in both themes
    expect(svgs).toHaveLength(2 * (3 + profile.featured.length));
    for (const path of svgs) {
      expect(path.startsWith("assets/generated/"), path).toBe(true);
      expect(files.get(path)?.startsWith("<svg "), path).toBe(true);
    }
    expect([...files.keys()]).toContain("README.md");
  });

  it("links README.md to exactly the SVGs it builds", async () => {
    const files = await buildAll(input, fakeAssets());
    const readme = files.get("README.md") ?? "";
    const referenced = new Set(readme.match(/assets\/generated\/[^"\s)]+\.svg/g) ?? []);
    const built = new Set([...files.keys()].filter((path) => path.endsWith(".svg")));
    expect([...referenced].sort()).toEqual([...built].sort());
  });

  it("rejects without producing anything when a renderer throws", async () => {
    const tooLong = { ...profile, roleLine: "x".repeat(400) };
    await expect(buildAll({ ...input, profile: tooLong }, fakeAssets())).rejects.toThrow();
  });
});
