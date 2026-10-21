import { describe, expect, it } from "vitest";
import { GitHubSnapshot } from "../../src/contract/schema";
import {
  aggregateLanguages,
  contributionLevel,
  contributionWindow,
  fetchGitHubSnapshot,
  FALLBACK_LANGUAGE_COLOR,
} from "../../src/fetch/github";
import fixture from "../fixtures/github-graphql-response.json";

const NOW = new Date("2026-10-21T03:00:00.000Z");

interface Call {
  url: string;
  init: RequestInit;
  body: { query: string; variables: Record<string, unknown> };
}

/** A fetch stand-in that replays the given JSON bodies in order and records each request. */
function replayFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const next = responses[calls.length];
    calls.push({ url: String(input), init: init ?? {}, body: JSON.parse(String(init?.body)) });
    if (!next) throw new Error(`unexpected request #${calls.length}`);
    return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fn, calls };
}

const clone = <T>(value: T): T => structuredClone(value);

describe("contributionLevel", () => {
  it("maps GitHub's quartile enum to 0..4", () => {
    expect(contributionLevel("NONE")).toBe(0);
    expect(contributionLevel("FIRST_QUARTILE")).toBe(1);
    expect(contributionLevel("SECOND_QUARTILE")).toBe(2);
    expect(contributionLevel("THIRD_QUARTILE")).toBe(3);
    expect(contributionLevel("FOURTH_QUARTILE")).toBe(4);
  });

  it("rejects unknown levels instead of guessing", () => {
    expect(() => contributionLevel("FIFTH_QUARTILE")).toThrow(/FIFTH_QUARTILE/);
  });
});

describe("contributionWindow", () => {
  it("covers the 365 days ending at now", () => {
    expect(contributionWindow(NOW)).toEqual({
      from: "2025-10-21T03:00:00.000Z",
      to: "2026-10-21T03:00:00.000Z",
    });
  });
});

describe("aggregateLanguages", () => {
  const lang = (name: string, size: number, color: string | null = "#123456") => ({ size, node: { name, color } });

  it("sums bytes per language across repos, sorted by bytes descending", () => {
    const result = aggregateLanguages([
      { isArchived: false, languages: { edges: [lang("TypeScript", 100, "#3178c6"), lang("CSS", 10, "#663399")] } },
      { isArchived: false, languages: { edges: [lang("Python", 60, "#3572A5"), lang("TypeScript", 5, "#3178c6")] } },
    ]);
    expect(result).toEqual([
      { name: "TypeScript", color: "#3178c6", bytes: 105 },
      { name: "Python", color: "#3572A5", bytes: 60 },
      { name: "CSS", color: "#663399", bytes: 10 },
    ]);
  });

  it("skips archived repos", () => {
    const result = aggregateLanguages([
      { isArchived: true, languages: { edges: [lang("Swift", 1000)] } },
      { isArchived: false, languages: { edges: [lang("Rust", 1)] } },
    ]);
    expect(result.map((l) => l.name)).toEqual(["Rust"]);
  });

  it("breaks ties by name so the order is deterministic", () => {
    const result = aggregateLanguages([
      { isArchived: false, languages: { edges: [lang("Zig", 7), lang("Go", 7), lang("Nim", 7)] } },
    ]);
    expect(result.map((l) => l.name)).toEqual(["Go", "Nim", "Zig"]);
  });

  it("falls back to a neutral color when GitHub has none for a language", () => {
    const [only] = aggregateLanguages([{ isArchived: false, languages: { edges: [lang("Roff", 3, null)] } }]);
    expect(only?.color).toBe(FALLBACK_LANGUAGE_COLOR);
    expect(FALLBACK_LANGUAGE_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("fetchGitHubSnapshot", () => {
  it("POSTs an authenticated GraphQL query for the login and the 365-day window", async () => {
    const { fn, calls } = replayFetch({ body: fixture });
    await fetchGitHubSnapshot({ login: "kandotrun", token: "t0ken", now: NOW, fetch: fn });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.github.com/graphql");
    expect(call?.init.method).toBe("POST");
    expect(new Headers(call?.init.headers).get("authorization")).toBe("bearer t0ken");
    expect(call?.body.query).toMatch(/contributionsCollection/);
    expect(call?.body.variables).toMatchObject({
      login: "kandotrun",
      from: "2025-10-21T03:00:00.000Z",
      to: "2026-10-21T03:00:00.000Z",
    });
  });

  it("returns a snapshot that satisfies the contract", async () => {
    const { fn } = replayFetch({ body: fixture });
    const snapshot = await fetchGitHubSnapshot({ login: "kandotrun", token: "t", now: NOW, fetch: fn });

    expect(() => GitHubSnapshot.parse(snapshot)).not.toThrow();
    expect(snapshot.fetchedAt).toBe("2026-10-21T03:00:00.000Z");
    expect(snapshot.login).toBe("kandotrun");
  });

  it("computes totals from repos, followers and the contributions collection", async () => {
    const { fn } = replayFetch({ body: fixture });
    const { totals } = await fetchGitHubSnapshot({ login: "kandotrun", token: "t", now: NOW, fetch: fn });
    const user = fixture.data.user;
    const cc = user.contributionsCollection;

    expect(totals).toEqual({
      publicRepos: user.repositories.nodes.length,
      stars: user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0),
      followers: user.followers.totalCount,
      commits: cc.totalCommitContributions,
      pullRequests: cc.totalPullRequestContributions,
      issues: cc.totalIssueContributions,
      reviews: cc.totalPullRequestReviewContributions,
      contributions: cc.contributionCalendar.totalContributions,
    });
  });

  it("aggregates languages over non-archived repos only", async () => {
    const { fn } = replayFetch({ body: fixture });
    const { languages } = await fetchGitHubSnapshot({ login: "kandotrun", token: "t", now: NOW, fetch: fn });

    expect(languages.map((l) => l.name)).toEqual(["TypeScript", "CSS", "Python", "Rust", "JavaScript", "HTML", "Shell"]);
    expect(languages[0]).toEqual({ name: "TypeScript", color: "#3178c6", bytes: 19_368_606 });
    // In the fixture, Dockerfile only appears in an archived repo.
    expect(languages.find((l) => l.name === "Dockerfile")).toBeUndefined();
  });

  it("maps the contribution calendar into weeks of days with numeric levels", async () => {
    const { fn } = replayFetch({ body: fixture });
    const { contributions } = await fetchGitHubSnapshot({ login: "kandotrun", token: "t", now: NOW, fetch: fn });
    const rawWeeks = fixture.data.user.contributionsCollection.contributionCalendar.weeks;

    expect(contributions.total).toBe(fixture.data.user.contributionsCollection.contributionCalendar.totalContributions);
    expect(contributions.weeks).toHaveLength(rawWeeks.length);
    expect(contributions.weeks[0]?.days[0]).toEqual({
      date: rawWeeks[0]?.contributionDays[0]?.date,
      count: rawWeeks[0]?.contributionDays[0]?.contributionCount,
      level: 1,
    });
    const levels = new Set(contributions.weeks.flatMap((w) => w.days.map((d) => d.level)));
    expect([...levels].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("follows repository pagination", async () => {
    const first = clone(fixture);
    const [a, b, ...rest] = first.data.user.repositories.nodes;
    first.data.user.repositories.nodes = [a!, b!];
    first.data.user.repositories.pageInfo = { hasNextPage: true, endCursor: "CURSOR-1" };
    const second = {
      data: {
        user: {
          repositories: {
            totalCount: fixture.data.user.repositories.totalCount,
            pageInfo: { hasNextPage: false, endCursor: "CURSOR-2" },
            nodes: rest,
          },
        },
      },
    };
    const { fn, calls } = replayFetch({ body: first }, { body: second });
    const paged = await fetchGitHubSnapshot({ login: "kandotrun", token: "t", now: NOW, fetch: fn });

    expect(calls).toHaveLength(2);
    expect(calls[1]?.body.variables).toMatchObject({ login: "kandotrun", cursor: "CURSOR-1" });

    const { fn: single } = replayFetch({ body: fixture });
    const whole = await fetchGitHubSnapshot({ login: "kandotrun", token: "t", now: NOW, fetch: single });
    expect(paged).toEqual(whole);
  });

  it("throws a clear error on HTTP failures", async () => {
    const { fn } = replayFetch({ status: 401, body: { message: "Bad credentials" } });
    await expect(fetchGitHubSnapshot({ login: "kandotrun", token: "bad", now: NOW, fetch: fn })).rejects.toThrow(
      /GitHub GraphQL HTTP 401.*Bad credentials/,
    );
  });

  it("throws a clear error on GraphQL errors", async () => {
    const { fn } = replayFetch({
      body: { data: { user: null }, errors: [{ message: "Could not resolve to a User with the login of 'nobody'." }] },
    });
    await expect(fetchGitHubSnapshot({ login: "nobody", token: "t", now: NOW, fetch: fn })).rejects.toThrow(
      /GitHub GraphQL error: Could not resolve to a User/,
    );
  });

  it("throws when the user does not exist", async () => {
    const { fn } = replayFetch({ body: { data: { user: null } } });
    await expect(fetchGitHubSnapshot({ login: "nobody", token: "t", now: NOW, fetch: fn })).rejects.toThrow(
      /user "nobody" not found/,
    );
  });

  it("throws when the response does not have the expected shape", async () => {
    const { fn } = replayFetch({ body: { data: { user: { login: "kandotrun" } } } });
    await expect(fetchGitHubSnapshot({ login: "kandotrun", token: "t", now: NOW, fetch: fn })).rejects.toThrow(
      /unexpected GitHub GraphQL response/,
    );
  });
});
