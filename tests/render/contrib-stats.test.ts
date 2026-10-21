import { describe, expect, it } from "vitest";
import type { GitHubSnapshot } from "../../src/contract/schema";
import {
  contribStats,
  currentStreak,
  longestStreak,
  peakWeek,
  totalContributions,
} from "../../src/render/contrib-stats";
import fixture from "../fixtures/contrib-snapshot.json";

type Contributions = GitHubSnapshot["contributions"];

const DAY_MS = 86_400_000;

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Builds a GitHub-like calendar: consecutive days, a new week every Sunday. */
function calendar(start: string, counts: number[]): Contributions {
  const weeks: Contributions["weeks"] = [];
  counts.forEach((count, i) => {
    const date = addDays(start, i);
    const isSunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    if (weeks.length === 0 || isSunday) weeks.push({ days: [] });
    weeks.at(-1)?.days.push({ date, count, level: count === 0 ? 0 : 1 });
  });
  return { total: counts.reduce((a, b) => a + b, 0), weeks };
}

// 2026-03-01 is a Sunday, 2026-03-04 a Wednesday.
const SUNDAY = "2026-03-01";
const WEDNESDAY = "2026-03-04";

describe("totalContributions", () => {
  it("sums every day in the calendar", () => {
    expect(totalContributions(calendar(SUNDAY, [1, 2, 3, 0, 4, 0, 0, 5]))).toBe(15);
  });

  it("is 0 for a calendar of empty days", () => {
    expect(totalContributions(calendar(SUNDAY, [0, 0, 0]))).toBe(0);
  });
});

describe("peakWeek", () => {
  it("finds the week with the largest sum and reports its first date", () => {
    const c = calendar(SUNDAY, [1, 1, 1, 1, 1, 1, 1, 0, 9, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2]);
    expect(peakWeek(c)).toEqual({ index: 2, start: "2026-03-15", total: 14 });
  });

  it("prefers the latest week on ties", () => {
    const c = calendar(SUNDAY, [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 1, 1, 1, 1, 1, 0, 0]);
    expect(peakWeek(c)).toEqual({ index: 2, start: "2026-03-15", total: 5 });
  });

  it("counts a partial first week by the days it has", () => {
    // Wed..Sat = 4 days, then a full week.
    const c = calendar(WEDNESDAY, [10, 10, 10, 10, 5, 5, 5, 5, 5, 5, 5]);
    expect(c.weeks[0]?.days).toHaveLength(4);
    expect(peakWeek(c)).toEqual({ index: 0, start: WEDNESDAY, total: 40 });
  });

  it("lets a partial last week win", () => {
    const c = calendar(SUNDAY, [1, 1, 1, 1, 1, 1, 1, 30]);
    expect(peakWeek(c)).toEqual({ index: 1, start: "2026-03-08", total: 30 });
  });

  it("falls back to the latest week when every day is empty", () => {
    const c = calendar(SUNDAY, Array(15).fill(0));
    expect(peakWeek(c)).toEqual({ index: 2, start: "2026-03-15", total: 0 });
  });
});

describe("longestStreak", () => {
  it("is 0 when there are no contributions", () => {
    expect(longestStreak(calendar(SUNDAY, [0, 0, 0, 0]))).toBe(0);
  });

  it("returns the longest run of non-empty days, across week boundaries", () => {
    // Run of 3, then a run of 5 spanning Fri..Tue.
    const c = calendar(SUNDAY, [1, 1, 1, 0, 0, 2, 2, 2, 2, 2, 0, 1]);
    expect(longestStreak(c)).toBe(5);
  });

  it("counts a run that reaches the end of the data", () => {
    expect(longestStreak(calendar(SUNDAY, [0, 1, 1, 1, 1]))).toBe(4);
  });

  it("treats a gap in the dates as a break", () => {
    const c: Contributions = {
      total: 4,
      weeks: [
        {
          days: [
            { date: "2026-03-01", count: 1, level: 1 },
            { date: "2026-03-02", count: 1, level: 1 },
            { date: "2026-03-05", count: 1, level: 1 },
            { date: "2026-03-06", count: 1, level: 1 },
          ],
        },
      ],
    };
    expect(longestStreak(c)).toBe(2);
  });
});

describe("currentStreak", () => {
  it("counts back from the last day when it has contributions", () => {
    expect(currentStreak(calendar(SUNDAY, [1, 0, 1, 1, 1, 1, 1, 1, 1]))).toBe(7);
  });

  it("still counts a streak that ended yesterday (today is not over yet)", () => {
    expect(currentStreak(calendar(SUNDAY, [0, 1, 1, 1, 0]))).toBe(3);
  });

  it("is 0 when both today and yesterday are empty", () => {
    expect(currentStreak(calendar(SUNDAY, [1, 1, 1, 0, 0]))).toBe(0);
  });

  it("handles a calendar of a single day", () => {
    expect(currentStreak(calendar(SUNDAY, [3]))).toBe(1);
    expect(currentStreak(calendar(SUNDAY, [0]))).toBe(0);
  });
});

describe("contribStats", () => {
  it("summarises the real snapshot fixture", () => {
    expect(contribStats(fixture.contributions as Contributions)).toEqual({
      total: 14030,
      peak: { index: 32, start: "2026-05-31", total: 1825 },
      longestStreak: 69,
      currentStreak: 2,
      firstDate: "2025-10-19",
      lastDate: "2026-10-21",
    });
  });
});
