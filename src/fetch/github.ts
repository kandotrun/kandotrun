// Fetches the public GitHub numbers behind the HISTOGRAM and CONTRIBUTION SCAN
// panels through the GraphQL API and turns them into a GitHubSnapshot.
//
// What counts:
// - repos: public, owned by the user, not forks (archived included)
// - stars / publicRepos: summed / counted over those repos
// - languages: bytes over the same repos minus archived ones
// - contributions: the 365 days ending at `now`. The numbers depend on the token:
//   a personal token can see more private contributions than a CI GITHUB_TOKEN.
import { z } from "zod";
import { GitHubSnapshot, type LanguageStat } from "../contract/schema";

export const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
/** Used when linguist has no color for a language. */
export const FALLBACK_LANGUAGE_COLOR = "#8b949e";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// GraphQL documents
// ---------------------------------------------------------------------------

const REPOS_FIELDS = `
  repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: NAME, direction: ASC }) {
    totalCount
    pageInfo { hasNextPage endCursor }
    nodes {
      name
      isArchived
      stargazerCount
      languages(first: 50, orderBy: { field: SIZE, direction: DESC }) {
        edges { size node { name color } }
      }
    }
  }`;

const SNAPSHOT_QUERY = `query Snapshot($login: String!, $from: DateTime!, $to: DateTime!, $cursor: String) {
  user(login: $login) {
    login
    followers { totalCount }
    ${REPOS_FIELDS}
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const REPOS_QUERY = `query Repos($login: String!, $cursor: String) {
  user(login: $login) {
    ${REPOS_FIELDS}
  }
}`;

// ---------------------------------------------------------------------------
// Raw response shapes (only the fields we ask for)
// ---------------------------------------------------------------------------

const RawRepo = z.object({
  name: z.string(),
  isArchived: z.boolean(),
  stargazerCount: z.number().int().nonnegative(),
  languages: z.object({
    edges: z.array(
      z.object({
        size: z.number().int().nonnegative(),
        node: z.object({ name: z.string().min(1), color: z.string().nullable() }),
      }),
    ),
  }),
});

const RawRepoPage = z.object({
  totalCount: z.number().int().nonnegative(),
  pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
  nodes: z.array(RawRepo),
});

const RawSnapshotUser = z.object({
  login: z.string().min(1),
  followers: z.object({ totalCount: z.number().int().nonnegative() }),
  repositories: RawRepoPage,
  contributionsCollection: z.object({
    totalCommitContributions: z.number().int().nonnegative(),
    totalPullRequestContributions: z.number().int().nonnegative(),
    totalIssueContributions: z.number().int().nonnegative(),
    totalPullRequestReviewContributions: z.number().int().nonnegative(),
    contributionCalendar: z.object({
      totalContributions: z.number().int().nonnegative(),
      weeks: z.array(
        z.object({
          contributionDays: z.array(
            z.object({
              date: z.string(),
              contributionCount: z.number().int().nonnegative(),
              contributionLevel: z.string(),
            }),
          ),
        }),
      ),
    }),
  }),
});

const RawReposUser = z.object({ repositories: RawRepoPage });

type RawRepo = z.infer<typeof RawRepo>;
type RawWeek = z.infer<typeof RawSnapshotUser>["contributionsCollection"]["contributionCalendar"]["weeks"][number];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const LEVELS: Record<string, 0 | 1 | 2 | 3 | 4> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

/** GitHub's ContributionLevel enum → 0..4. */
export function contributionLevel(level: string): 0 | 1 | 2 | 3 | 4 {
  const mapped = LEVELS[level];
  if (mapped === undefined) throw new Error(`unknown contribution level: ${level}`);
  return mapped;
}

/** The 365-day window ending at `now`, as GraphQL DateTime strings. */
export function contributionWindow(now: Date): { from: string; to: string } {
  return { from: new Date(now.getTime() - 365 * DAY_MS).toISOString(), to: now.toISOString() };
}

/** Sums language bytes over non-archived repos; sorted by bytes desc, then name. */
export function aggregateLanguages(repos: ReadonlyArray<Pick<RawRepo, "isArchived" | "languages">>): LanguageStat[] {
  const byName = new Map<string, LanguageStat>();
  for (const repo of repos) {
    if (repo.isArchived) continue;
    for (const { size, node } of repo.languages.edges) {
      const entry = byName.get(node.name) ?? { name: node.name, color: languageColor(node.color), bytes: 0 };
      entry.bytes += size;
      byName.set(node.name, entry);
    }
  }
  return [...byName.values()].sort((a, b) => b.bytes - a.bytes || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function languageColor(color: string | null): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : FALLBACK_LANGUAGE_COLOR;
}

function toWeeks(weeks: RawWeek[]): GitHubSnapshot["contributions"]["weeks"] {
  return weeks
    .filter((week) => week.contributionDays.length > 0)
    .map((week) => ({
      days: week.contributionDays.map((day) => ({
        date: day.date,
        count: day.contributionCount,
        level: contributionLevel(day.contributionLevel),
      })),
    }));
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export interface FetchGitHubSnapshotOptions {
  login: string;
  token: string;
  /** End of the contribution window and the snapshot's fetchedAt. */
  now: Date;
  fetch?: typeof fetch;
}

export async function fetchGitHubSnapshot(opts: FetchGitHubSnapshotOptions): Promise<GitHubSnapshot> {
  const { login, token, now } = opts;
  const doFetch = opts.fetch ?? globalThis.fetch;
  const request = (query: string, variables: Record<string, unknown>) =>
    graphql(doFetch, token, query, variables, login);

  const window = contributionWindow(now);
  const user = parseShape(RawSnapshotUser, await request(SNAPSHOT_QUERY, { login, ...window, cursor: null }));

  const repos = [...user.repositories.nodes];
  let page = user.repositories.pageInfo;
  while (page.hasNextPage) {
    if (!page.endCursor) throw new Error("unexpected GitHub GraphQL response: hasNextPage without endCursor");
    const next = parseShape(RawReposUser, await request(REPOS_QUERY, { login, cursor: page.endCursor }));
    repos.push(...next.repositories.nodes);
    page = next.repositories.pageInfo;
  }

  const cc = user.contributionsCollection;
  const calendar = cc.contributionCalendar;
  return GitHubSnapshot.parse({
    fetchedAt: now.toISOString(),
    login: user.login,
    totals: {
      publicRepos: user.repositories.totalCount,
      stars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
      followers: user.followers.totalCount,
      commits: cc.totalCommitContributions,
      pullRequests: cc.totalPullRequestContributions,
      issues: cc.totalIssueContributions,
      reviews: cc.totalPullRequestReviewContributions,
      contributions: calendar.totalContributions,
    },
    languages: aggregateLanguages(repos),
    contributions: { total: calendar.totalContributions, weeks: toWeeks(calendar.weeks) },
  });
}

/** Runs one GraphQL request and returns `data.user`, throwing on HTTP or GraphQL errors. */
async function graphql(
  doFetch: typeof fetch,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  login: string,
): Promise<unknown> {
  const response = await doFetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      authorization: `bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "kandotrun-profile",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub GraphQL HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  let body: { data?: { user?: unknown } | null; errors?: Array<{ message?: string }> };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`unexpected GitHub GraphQL response: not JSON: ${text.slice(0, 120)}`);
  }
  if (body.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${body.errors.map((e) => e.message ?? "unknown error").join("; ")}`);
  }
  const user = body.data?.user;
  if (user === null || user === undefined) throw new Error(`GitHub user "${login}" not found`);
  return user;
}

function parseShape<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`unexpected GitHub GraphQL response: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
