// Renders every SVG into assets/generated/ and writes README.md.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { photos as photoData } from "../../data/photos";
import { profile as profileData } from "../../data/profile";
import { createFsAssetLoader } from "../assets/loader";
import { FeedSnapshot, GitHubSnapshot, PhotoMeta, Profile } from "../contract/schema";
import { GENERATED_DIR, generatedPath } from "../readme/paths";
import { renderReadme } from "../readme/render";
import { renderContrib } from "../render/contrib";
import { renderFrame } from "../render/frame";
import { renderHero } from "../render/hero";
import { renderStats } from "../render/stats";
import { themeNames, themes } from "../render/theme";
import type { RenderContext } from "../render/types";

const root = process.cwd();

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

async function write(path: string, content: string): Promise<void> {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

const profile = Profile.parse(profileData);
const photos = photoData.map((p) => PhotoMeta.parse(p));
const github = GitHubSnapshot.parse(await readJson("data/snapshot/github.json"));
const feeds = FeedSnapshot.parse(await readJson("data/snapshot/feeds.json"));
const assets = createFsAssetLoader(root);

await rm(join(root, GENERATED_DIR), { recursive: true, force: true });

for (const name of themeNames) {
  const ctx: RenderContext = { theme: themes[name], assets };
  await write(generatedPath("hero", name), await renderHero({ profile, photos }, ctx));
  await write(generatedPath("stats", name), await renderStats(github, ctx));
  await write(generatedPath("contrib", name), await renderContrib(github, ctx));
  for (const [index, project] of profile.featured.entries()) {
    const svg = await renderFrame({ project, index, total: profile.featured.length }, ctx);
    await write(generatedPath("frame", name, index), svg);
  }
}

await write("README.md", renderReadme({ profile, feeds }));
console.log(`built README.md and ${GENERATED_DIR}/ (${themeNames.join(", ")})`);
