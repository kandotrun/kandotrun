// Renders every generated file in memory: themed SVGs under assets/generated/
// and README.md. src/cli/build.ts writes the result only once all of it has
// rendered, so a renderer that throws leaves the previous output untouched.
import type { FeedSnapshot, GitHubSnapshot, PhotoMeta, Profile } from "../contract/schema";
import { generatedPath } from "../readme/paths";
import { renderReadme } from "../readme/render";
import { renderContrib } from "../render/contrib";
import { renderFrame } from "../render/frame";
import { renderHero } from "../render/hero";
import { renderStats } from "../render/stats";
import { themeNames, themes } from "../render/theme";
import type { AssetLoader, RenderContext } from "../render/types";

export interface BuildInput {
  profile: Profile;
  photos: PhotoMeta[];
  github: GitHubSnapshot;
  feeds: FeedSnapshot;
}

/** Repository-relative path → file content. */
export async function buildAll(input: BuildInput, assets: AssetLoader): Promise<Map<string, string>> {
  const { profile, photos, github, feeds } = input;
  const files = new Map<string, string>();
  for (const name of themeNames) {
    const ctx: RenderContext = { theme: themes[name], assets };
    files.set(generatedPath("hero", name), await renderHero({ profile, photos }, ctx));
    files.set(generatedPath("stats", name), await renderStats(github, ctx));
    files.set(generatedPath("contrib", name), await renderContrib(github, ctx));
    for (const [index, project] of profile.featured.entries()) {
      const svg = await renderFrame({ project, index, total: profile.featured.length }, ctx);
      files.set(generatedPath("frame", name, { index, id: project.id }), svg);
    }
  }
  files.set("README.md", renderReadme({ profile, feeds }));
  return files;
}
