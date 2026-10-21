// Renders every SVG into assets/generated/ and writes README.md. Everything is
// rendered in memory first; assets/generated/ is cleared (dropping stale files)
// only after that succeeds.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { photos as photoData } from "../../data/photos";
import { profile as profileData } from "../../data/profile";
import { createFsAssetLoader } from "../assets/loader";
import { FeedSnapshot, GitHubSnapshot, Photos, Profile } from "../contract/schema";
import { GENERATED_DIR } from "../readme/paths";
import { themeNames } from "../render/theme";
import { buildAll } from "./build-all";

const root = process.cwd();

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

const files = await buildAll(
  {
    profile: Profile.parse(profileData),
    photos: Photos.parse(photoData),
    github: GitHubSnapshot.parse(await readJson("data/snapshot/github.json")),
    feeds: FeedSnapshot.parse(await readJson("data/snapshot/feeds.json")),
  },
  createFsAssetLoader(root),
);

await rm(join(root, GENERATED_DIR), { recursive: true, force: true });
for (const [path, content] of files) {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}
console.log(`built README.md and ${GENERATED_DIR}/ (${themeNames.join(", ")})`);
