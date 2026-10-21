import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profile } from "../data/profile";
import { FeedSnapshot } from "../src/contract/schema";
import { renderReadme } from "../src/readme/render";
import { deniedEntries, privateDenylist } from "./helpers/denylist";

const denylist = privateDenylist();
const feeds = FeedSnapshot.parse(JSON.parse(readFileSync("data/snapshot/feeds.json", "utf8")));

describe("deniedEntries", () => {
  it("reports 1-based entry numbers, case-insensitively, and never the terms", () => {
    expect(deniedEntries("Hello WORLD", ["nope", "world"])).toEqual([2]);
    expect(deniedEntries("clean", ["nope"])).toEqual([]);
  });
});

describe.skipIf(!denylist)("private denylist", () => {
  const terms = denylist ?? [];

  it("keeps every private term out of the profile data", () => {
    expect(deniedEntries(JSON.stringify(profile), terms), "denylist entry numbers found in data/profile.ts").toEqual([]);
  });

  it("keeps every private term out of the rendered README", () => {
    expect(deniedEntries(renderReadme({ profile, feeds }), terms), "denylist entry numbers found in README").toEqual([]);
  });
});
