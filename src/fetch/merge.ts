// Combines freshly fetched feed parts with the previous snapshot. A part that
// failed to fetch is passed as undefined and keeps its previous value, so one
// flaky source never blanks the README.
import { type FeedItem, FeedSnapshot, type VideoItem } from "../contract/schema";

export interface FreshFeeds {
  zenn?: FeedItem[];
  youtube?: VideoItem[];
}

export function mergeFeedSnapshot(previous: FeedSnapshot | null, fresh: FreshFeeds, now: Date): FeedSnapshot {
  return FeedSnapshot.parse({
    fetchedAt: now.toISOString().replace(/\.000Z$/, "Z"),
    zenn: fresh.zenn ?? previous?.zenn ?? [],
    youtube: fresh.youtube ?? previous?.youtube ?? [],
  });
}
