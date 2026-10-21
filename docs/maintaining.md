# Maintaining the profile README

`README.md` and everything in `assets/generated/` are build output. Edit the
data and run the build; never edit the output by hand.

| Change | Edit |
| --- | --- |
| Intro, NOW, WORK, featured projects, products, OSS lists, badges | `data/profile.ts` |
| Hero photos and their EXIF readout | `assets/photos/*.jpg` + `data/photos.ts` |
| Colors | `src/render/theme.ts` |
| Data shapes | `src/contract/schema.ts` |

## Commands

`just snapshot` needs [yt-dlp](https://github.com/yt-dlp/yt-dlp) on `PATH`
(`brew install yt-dlp`); the workflow installs a pinned version with pipx. If
YouTube changes break it, the snapshot keeps the previous videos and the run logs
a warning — bump the version in `.github/workflows/update.yml`.

```bash
just install    # once
just snapshot   # refresh data/snapshot/*.json (GitHub stats, Zenn, most viewed YouTube videos)
just build      # render assets/generated/ and README.md
just check      # typecheck + ast-grep + unit tests (photo metadata, privacy, purity rules)
just e2e        # render via GitHub's Markdown API; Chromium + WebKit at 846/766/311 px, dark/light
just shoot assets/generated/hero-dark.svg --times 0.5,4,9 --scheme dark
just hooks      # once per clone: run `just check` before every commit
```

The scheduled workflow (`.github/workflows/update.yml`) runs
`snapshot → build → check` every day at 06:17 JST and commits the result. If
`main` moved during the run it rebases once; when its generated files conflict
it gives up quietly and the next run regenerates them. Because the bot commits
`README.md`, `assets/generated/` and `data/snapshot/` every day, run `git pull`
before `just build` and committing.

Add a `PROFILE_TOKEN` secret (fine-grained PAT, no extra permissions) if the
contribution scan should include private contributions the way the profile
calendar does; without it the default `GITHUB_TOKEN` is used.

A failed source only logs a warning and keeps its previous data. The last step,
`just check-snapshot`, turns the run red once `data/snapshot/github.json` is more
than 7 days old — usually an expired `PROFILE_TOKEN`; renew the secret (the
workflow does not fall back to `GITHUB_TOKEN` when it is set).

## Adding a hero photo

Never commit camera originals. Re-encode and strip metadata first:

```bash
magick original.jpg -auto-orient -strip -resize 1400x1400 -interlace JPEG -quality 74 assets/photos/<id>.jpg
exiftool assets/photos/<id>.jpg | grep -i gps   # must print nothing
```

`tests/photos.test.ts` enforces the strip step for every file in
`assets/photos/` (no Exif/XMP, IPTC, comment or other APPn segments; only JFIF,
an ICC profile and the Adobe marker may remain), checks that the longer side is
at most 1400 px, and that the photo is listed in `data/photos.ts` with the
JPEG's real width and height. `just build` also refuses to embed a JPEG that
still has metadata. Run `just check` (or install the hook with `just hooks`)
before committing a photo: once pushed, the file is public.

Then add an entry to `data/photos.ts` with the exposure values copied by hand,
width/height matching the re-encoded file, and a hand-placed `framing`
(scale/ox/oy that cover the 1280x640 frame, the `motion`, the subject box and
the AF point). `suggestFraming(photo)` in `src/render/hero.ts` drafts a centred
starting point; renderHero throws if a framing does not cover the frame.

The hero holds at most 4 photos; each embedded photo must stay under 300 KB and
all of them under 800 KB (renderHero throws with a clear message otherwise).
Avoid photos that show people's faces, home exteriors or documents.
