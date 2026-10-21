// Private terms that must never reach the public README live outside the repo:
// the PRIVACY_DENYLIST env var (an Actions secret in CI) or a gitignored
// .privacy-denylist file, one term per line. Returns null when neither exists.
import { existsSync, readFileSync } from "node:fs";

export function privateDenylist(file = ".privacy-denylist"): string[] | null {
  const raw = process.env.PRIVACY_DENYLIST || (existsSync(file) ? readFileSync(file, "utf8") : "");
  const terms = raw
    .split(/\r?\n/)
    .map((term) => term.trim())
    .filter(Boolean);
  return terms.length ? terms : null;
}

/** 1-based numbers of the denylist entries found in `text` (case-insensitive). Never the terms themselves. */
export function deniedEntries(text: string, terms: readonly string[]): number[] {
  const haystack = text.toLowerCase();
  return terms.flatMap((term, i) => (haystack.includes(term.toLowerCase()) ? [i + 1] : []));
}
