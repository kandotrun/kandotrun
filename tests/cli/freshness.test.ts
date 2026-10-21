import { describe, expect, it } from "vitest";
import { MAX_SNAPSHOT_AGE_DAYS, snapshotAgeDays, staleSnapshotError } from "../../src/cli/freshness";

const NOW = new Date("2026-10-21T03:00:00.000Z");

describe("snapshotAgeDays", () => {
  it("counts whole days between fetchedAt and now", () => {
    expect(snapshotAgeDays("2026-10-21T03:00:00.000Z", NOW)).toBe(0);
    expect(snapshotAgeDays("2026-10-20T03:00:01.000Z", NOW)).toBe(0);
    expect(snapshotAgeDays("2026-10-20T03:00:00.000Z", NOW)).toBe(1);
    expect(snapshotAgeDays("2026-10-11T02:00:00.000Z", NOW)).toBe(10);
  });

  it("treats an unreadable timestamp as infinitely old", () => {
    expect(snapshotAgeDays("yesterday", NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("staleSnapshotError", () => {
  it("is null while the snapshot is at most a week old", () => {
    expect(MAX_SNAPSHOT_AGE_DAYS).toBe(7);
    expect(staleSnapshotError({ fetchedAt: "2026-10-14T03:00:00.000Z" }, NOW)).toBeNull();
  });

  it("names the age and the token to check once it is older than a week", () => {
    expect(staleSnapshotError({ fetchedAt: "2026-10-13T03:00:00.000Z" }, NOW)).toBe(
      "data/snapshot/github.json is 8 days old; the GitHub fetch keeps failing (check the PROFILE_TOKEN secret)",
    );
  });

  it("reports a snapshot without a usable fetchedAt", () => {
    expect(staleSnapshotError({}, NOW)).toMatch(/no valid fetchedAt/);
    expect(staleSnapshotError(null, NOW)).toMatch(/no valid fetchedAt/);
  });
});
