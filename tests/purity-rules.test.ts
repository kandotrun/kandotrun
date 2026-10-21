// Rule tests for rules/*.yml (the ast-grep purity guards on src/render and
// src/readme). Every case becomes its own file in a scratch tree, under the
// guarded directories and under ones the rules must leave alone; one ast-grep
// run with the real rules directory reports which files each rule flags, so the
// rules' `files:` scoping is covered too.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const AST_GREP = join(ROOT, "node_modules", ".bin", "ast-grep");
const GUARDED = ["src/render", "src/readme"];
const UNGUARDED = ["src/fetch", "src/cli", "src/assets"];

interface Cases {
  valid: readonly string[];
  invalid: readonly string[];
}

const CASES: Record<string, Cases> = {
  "no-io-in-render": {
    valid: [
      `import type { Theme } from "./theme";`,
      `import { el, esc, svgDoc } from "./svg";`,
      `import { esc } from "../render/svg";`,
      `import type { FeedSnapshot } from "../contract/schema";`,
      `import { renderMedia } from "./media";`,
      `export { esc } from "./svg";`,
      `export type { AssetLoader } from "./types";`,
      `export async function render(ctx: { assets: { fontCss(r: string, t: string): Promise<string> } }) { return ctx.assets.fontCss("mono", "x"); }`,
      `const process2 = { env: 1 }; const x = process2.env;`,
      `const item = { fetch: 1 }; const y = item.fetch;`,
      `export default "zod";`,
      `const name = "node:fs";`,
    ],
    invalid: [
      `import { readFileSync } from "node:fs";`,
      `import { readFile } from "node:fs/promises";`,
      `import { readFileSync } from "fs";`,
      `import os from "node:os";`,
      `import { execFile } from "node:child_process";`,
      `import { z } from "zod";`,
      `import { createFsAssetLoader } from "../assets/loader";`,
      `import { fetchZennFeed } from "../fetch/feeds";`,
      `import "../cli/build";`,
      `export * from "node:fs";`,
      `export { readFile } from "node:fs/promises";`,
      `const r = await fetch("https://example.com");`,
      `const r = await globalThis.fetch("https://example.com");`,
      `const r = await window.fetch("https://example.com");`,
      `const fs = await import("node:fs");`,
      `const fs = require("fs");`,
      `const home = process.env.HOME;`,
      `const dir = process.cwd();`,
      `const g = globalThis;`,
    ],
  },
  "no-nondeterminism-in-render": {
    valid: [
      "const day = new Date(`${date}T00:00:00Z`).getUTCDay();",
      `const d = new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);`,
      `const t = Date.parse("2026-10-21T00:00:00Z");`,
      `const n = Math.round(1.5) + Math.max(1, 2);`,
      `const s = (1234).toString();`,
      `const list = items.map((item) => item.date);`,
    ],
    invalid: [
      `const t = Date.now();`,
      `const f = Date.now;`,
      `const d = new Date();`,
      `const d = new Date;`,
      `const s = Date();`,
      `const r = Math.random();`,
      `const p = performance.now();`,
      `const id = crypto.randomUUID();`,
      `const s = count.toLocaleString();`,
      `const s = count.toLocaleString("en-US");`,
      `const s = new Date(x).toLocaleDateString("ja-JP");`,
      `const s = new Date(x).toLocaleTimeString();`,
      `const f = new Intl.DateTimeFormat("ja-JP");`,
      `const f = Intl.NumberFormat("en-US");`,
      `const y = new Date(x).getFullYear();`,
      `const m = new Date(x).getMonth();`,
      `const d = new Date(x).getDate();`,
      `const w = new Date(x).getDay();`,
      `const h = new Date(x).getHours();`,
      `const o = new Date(x).getTimezoneOffset();`,
      `const s = new Date(x).toDateString();`,
    ],
  },
};

// realpath: macOS tmpdir is a symlink, and ast-grep resolves ruleDirs from the real path.
const tree = realpathSync(mkdtempSync(join(tmpdir(), "purity-rules-")));
/** rule id → files it flagged, as paths relative to the tree. */
const hits = new Map<string, Set<string>>();
const caseFile = (dir: string, rule: string, kind: keyof Cases, i: number) => `${dir}/${rule}-${kind}-${i}.ts`;

beforeAll(() => {
  for (const dir of [...GUARDED, ...UNGUARDED]) {
    mkdirSync(join(tree, dir), { recursive: true });
    for (const [rule, cases] of Object.entries(CASES)) {
      for (const kind of ["valid", "invalid"] as const) {
        cases[kind].forEach((code, i) => writeFileSync(join(tree, caseFile(dir, rule, kind, i)), `${code}\n`));
      }
    }
  }
  writeFileSync(join(tree, "sgconfig.yml"), `ruleDirs:\n  - ${JSON.stringify(relative(tree, join(realpathSync(ROOT), "rules")))}\n`);
  const run = spawnSync(AST_GREP, ["scan", "--json=compact", "."], { cwd: tree, encoding: "utf8" });
  if (run.error) throw run.error;
  if (!run.stdout.trim().startsWith("[")) throw new Error(`ast-grep failed: ${run.stderr}`);
  for (const match of JSON.parse(run.stdout) as Array<{ ruleId: string; file: string }>) {
    const files = hits.get(match.ruleId) ?? new Set<string>();
    files.add(match.file.replace(/\\/g, "/"));
    hits.set(match.ruleId, files);
  }
});

afterAll(() => rmSync(tree, { recursive: true, force: true }));

function flagged(rule: string, dir: string, kind: keyof Cases): string[] {
  const files = hits.get(rule) ?? new Set<string>();
  return (CASES[rule]?.[kind] ?? []).filter((_, i) => files.has(caseFile(dir, rule, kind, i)));
}

for (const [rule, cases] of Object.entries(CASES)) {
  describe(`rules/${rule}.yml`, () => {
    for (const dir of GUARDED) {
      it(`${dir}: flags every invalid case`, () => {
        const caught = new Set(flagged(rule, dir, "invalid"));
        expect(cases.invalid.filter((code) => !caught.has(code)), "not flagged").toEqual([]);
      });
      it(`${dir}: accepts every valid case`, () => {
        expect(flagged(rule, dir, "valid"), "flagged").toEqual([]);
      });
    }
    it(`leaves ${UNGUARDED.join(", ")} alone`, () => {
      for (const dir of UNGUARDED) expect(flagged(rule, dir, "invalid"), dir).toEqual([]);
    });
  });
}
