// How old data/snapshot/github.json may get before the daily run turns red.
// A failed GitHub fetch keeps the previous snapshot and only logs a warning, so
// a transient outage stays green; an expired PROFILE_TOKEN fails every day and
// would otherwise freeze the stats without anyone noticing.

export const GITHUB_SNAPSHOT = "data/snapshot/github.json";
export const MAX_SNAPSHOT_AGE_DAYS = 7;
const DAY_MS = 86_400_000;

/** Whole days from `fetchedAt` to `now`; an unparseable timestamp counts as infinitely old. */
export function snapshotAgeDays(fetchedAt: string, now: Date): number {
  const time = Date.parse(fetchedAt);
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - time) / DAY_MS);
}

/** An error message when the GitHub snapshot is older than a week, otherwise null. */
export function staleSnapshotError(snapshot: unknown, now: Date): string | null {
  const fetchedAt =
    typeof snapshot === "object" && snapshot !== null ? (snapshot as { fetchedAt?: unknown }).fetchedAt : undefined;
  if (typeof fetchedAt !== "string" || Number.isNaN(Date.parse(fetchedAt))) {
    return `${GITHUB_SNAPSHOT} has no valid fetchedAt`;
  }
  const age = snapshotAgeDays(fetchedAt, now);
  if (age <= MAX_SNAPSHOT_AGE_DAYS) return null;
  return `${GITHUB_SNAPSHOT} is ${age} days old; the GitHub fetch keeps failing (check the PROFILE_TOKEN secret)`;
}
