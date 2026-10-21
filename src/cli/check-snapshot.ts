// Fails (exit 1) when data/snapshot/github.json is more than a week old. The
// workflow runs this after committing, so Zenn/YouTube updates still land while
// the red run tells the owner the GitHub fetch (usually PROFILE_TOKEN) is broken.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GITHUB_SNAPSHOT, staleSnapshotError } from "./freshness";

let snapshot: unknown = null;
try {
  snapshot = JSON.parse(await readFile(join(process.cwd(), GITHUB_SNAPSHOT), "utf8"));
} catch {
  // Missing or unreadable: staleSnapshotError reports it.
}

const error = staleSnapshotError(snapshot, new Date());
if (error) {
  console.log(`::error title=snapshot::${error}`);
  process.exit(1);
}
console.log(`${GITHUB_SNAPSHOT} is fresh`);
