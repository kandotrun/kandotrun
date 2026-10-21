import { describe, expect, it } from "vitest";
import { photos } from "../data/photos";
import { profile } from "../data/profile";
import { Photos, Profile } from "../src/contract/schema";

describe("profile contract", () => {
  it("parses against the Profile schema", () => {
    expect(() => Profile.parse(profile)).not.toThrow();
  });

  it("fills whole contact-sheet rows of three with unique ids", () => {
    const ids = profile.featured.map((p) => p.id);
    expect(ids.length % 3).toBe(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts every pinned repository on the contact sheet", () => {
    const ids = profile.featured.map((p) => p.id);
    for (const pinned of ["afterimage-app", "kururi-ai", "giga-site", "txt", "human-required-blog", "tamago-muku"]) {
      expect(ids).toContain(pinned);
    }
  });

  it("does not list a featured project again under OSS or archived", () => {
    const featuredUrls = new Set(profile.featured.flatMap((p) => [p.url, p.repo].filter(Boolean)));
    const listed = [...profile.oss.flatMap((c) => c.entries), ...profile.archived];
    expect(listed.filter((entry) => featuredUrls.has(entry.url)).map((entry) => entry.name)).toEqual([]);
  });

  it("keeps job titles and age out of the README data", () => {
    const text = JSON.stringify(profile);
    for (const banned of ["代表取締役", "CEO", "COO", "歳"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("photo contract", () => {
  it("parses as a hero photo set and only references files under assets/photos", () => {
    expect(() => Photos.parse(photos)).not.toThrow();
    for (const photo of photos) {
      expect(photo.file).toMatch(/^assets\/photos\/[a-z0-9-]+\.jpg$/);
    }
  });
});
