import { describe, expect, it } from "vitest";
import { photos } from "../data/photos";
import { profile } from "../data/profile";
import { PhotoMeta, Profile } from "../src/contract/schema";

describe("profile contract", () => {
  it("parses against the Profile schema", () => {
    expect(() => Profile.parse(profile)).not.toThrow();
  });

  it("features exactly six projects with unique ids", () => {
    const ids = profile.featured.map((p) => p.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it("keeps job titles and age out of the README data", () => {
    const text = JSON.stringify(profile);
    for (const banned of ["代表取締役", "CEO", "COO", "歳"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("photo contract", () => {
  it("parses every photo and only references files under assets/photos", () => {
    expect(photos.length).toBeGreaterThanOrEqual(3);
    for (const photo of photos) {
      expect(() => PhotoMeta.parse(photo)).not.toThrow();
      expect(photo.file).toMatch(/^assets\/photos\/[a-z0-9-]+\.jpg$/);
    }
  });
});
