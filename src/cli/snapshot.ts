// Refreshes data/snapshot/*.json. Each source is independent: if one fails, its
// previous snapshot is kept and a warning is printed, so the README still builds.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { profile } from "../../data/profile";
import { fetchFeedSnapshot } from "../fetch/feeds";
import { fetchGitHubSnapshot } from "../fetch/github";

const root = process.cwd();
const now = new Date();

function githubToken(): string {
  const fromEnv = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
}

async function save(path: string, data: unknown): Promise<void> {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${path}`);
}

const jobs: Array<[string, () => Promise<void>]> = [
  [
    "data/snapshot/github.json",
    async () => save("data/snapshot/github.json", await fetchGitHubSnapshot({ login: profile.handle, token: githubToken(), now })),
  ],
  [
    "data/snapshot/feeds.json",
    async () =>
      save(
        "data/snapshot/feeds.json",
        await fetchFeedSnapshot({ zennUser: profile.zennUser, youtubeChannelId: profile.youtubeChannelId, now }),
      ),
  ],
];

let failures = 0;
for (const [path, job] of jobs) {
  try {
    await job();
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    // GitHub Actions annotation; harmless locally.
    console.log(`::warning title=snapshot::keeping previous ${path}: ${message}`);
  }
}
if (failures === jobs.length) process.exit(1);
