// Pure statistics over a GitHub contribution calendar. "Today" is the last day
// present in the data, so results never depend on the wall clock.
import type { ContributionDay, GitHubSnapshot } from "../contract/schema";

export type Contributions = GitHubSnapshot["contributions"];

export interface PeakWeek {
  /** Index into `contributions.weeks`. */
  index: number;
  /** First date present in that week (a Sunday unless the week is partial). */
  start: string;
  total: number;
}

export interface ContribStats {
  total: number;
  peak: PeakWeek;
  longestStreak: number;
  currentStreak: number;
  firstDate: string;
  lastDate: string;
}

const DAY_MS = 86_400_000;

function days(c: Contributions): ContributionDay[] {
  return c.weeks.flatMap((week) => week.days);
}

function isNextDay(prev: ContributionDay, next: ContributionDay): boolean {
  return Date.parse(next.date) - Date.parse(prev.date) === DAY_MS;
}

interface Run {
  length: number;
  /** Index of the run's last day in the flattened calendar. */
  end: number;
}

/** Runs of non-empty, date-consecutive days, in calendar order. */
function runs(list: readonly ContributionDay[]): Run[] {
  const out: Run[] = [];
  let length = 0;
  list.forEach((day, i) => {
    const prev = list[i - 1];
    if (day.count > 0 && length > 0 && prev && isNextDay(prev, day)) {
      length++;
    } else {
      if (length > 0) out.push({ length, end: i - 1 });
      length = day.count > 0 ? 1 : 0;
    }
  });
  if (length > 0) out.push({ length, end: list.length - 1 });
  return out;
}

export function totalContributions(c: Contributions): number {
  return days(c).reduce((sum, day) => sum + day.count, 0);
}

/** The week with the largest sum; ties go to the latest week. */
export function peakWeek(c: Contributions): PeakWeek {
  let best: PeakWeek | undefined;
  c.weeks.forEach((week, index) => {
    const total = week.days.reduce((sum, day) => sum + day.count, 0);
    const first = week.days[0];
    if (first && (best === undefined || total >= best.total)) {
      best = { index, start: first.date, total };
    }
  });
  if (!best) throw new Error("peakWeek: calendar has no days");
  return best;
}

export function longestStreak(c: Contributions): number {
  return Math.max(0, ...runs(days(c)).map((run) => run.length));
}

/** Run of non-empty days ending on the last day of the data, or the day before it. */
export function currentStreak(c: Contributions): number {
  const list = days(c);
  const last = runs(list).at(-1);
  if (!last) return 0;
  const today = list.length - 1;
  const [yesterdayDay, todayDay] = [list[today - 1], list[today]];
  const endsToday = last.end === today;
  const endsYesterday =
    last.end === today - 1 && yesterdayDay !== undefined && todayDay !== undefined && isNextDay(yesterdayDay, todayDay);
  return endsToday || endsYesterday ? last.length : 0;
}

export function contribStats(c: Contributions): ContribStats {
  const list = days(c);
  return {
    total: totalContributions(c),
    peak: peakWeek(c),
    longestStreak: longestStreak(c),
    currentStreak: currentStreak(c),
    firstDate: list[0]?.date ?? "",
    lastDate: list.at(-1)?.date ?? "",
  };
}
