// Refreshes data/snapshot/*.json. Each source is independent: if one fails, its
// previous data is kept and a warning is printed, so the README still builds.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { profile } from "../../data/profile";
import { FeedSnapshot } from "../contract/schema";
import { fetchZennFeed } from "../fetch/feeds";
import { fetchGitHubSnapshot } from "../fetch/github";
import { mergeFeedSnapshot } from "../fetch/merge";
import { fetchPopularVideos } from "../fetch/youtube";

const root = process.cwd();
const now = new Date();
const FEEDS = "data/snapshot/feeds.json";
const GITHUB = "data/snapshot/github.json";

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

/** Each part of the previous feeds snapshot that still matches the contract. */
async function previousFeeds(): Promise<FeedSnapshot | null> {
  try {
    const raw = JSON.parse(await readFile(join(root, FEEDS), "utf8")) as Record<string, unknown>;
    const zenn = FeedSnapshot.shape.zenn.safeParse(raw.zenn);
    const youtube = FeedSnapshot.shape.youtube.safeParse(raw.youtube);
    return { fetchedAt: String(raw.fetchedAt), zenn: zenn.data ?? [], youtube: youtube.data ?? [] };
  } catch {
    return null;
  }
}

/** Runs one source; on failure prints a GitHub Actions warning and returns undefined. */
async function attempt<T>(source: string, job: () => Promise<T>): Promise<T | undefined> {
  try {
    return await job();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=snapshot::keeping previous ${source} data: ${message}`);
    return undefined;
  }
}

const github = await attempt("GitHub", () => fetchGitHubSnapshot({ login: profile.handle, token: githubToken(), now }));
if (github) await save(GITHUB, github);

const zenn = await attempt("Zenn", () => fetchZennFeed({ user: profile.zennUser }));
const youtube = await attempt("YouTube", () => fetchPopularVideos({ channelId: profile.youtubeChannelId }));
if (zenn || youtube) await save(FEEDS, mergeFeedSnapshot(await previousFeeds(), { zenn, youtube }, now));

if (!github && !zenn && !youtube) process.exit(1);
