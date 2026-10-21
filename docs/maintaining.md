# Maintaining the profile README

`README.md` and everything in `assets/generated/` are build output. Edit the
data and run the build; never edit the output by hand.

| Change | Edit |
| --- | --- |
| Intro, NOW, featured projects, OSS lists, links, badges | `data/profile.ts` |
| Hero photos and their EXIF readout | `assets/photos/*.jpg` + `data/photos.ts` |
| Colors | `src/render/theme.ts` |
| Data shapes | `src/contract/schema.ts` |

## Commands

```bash
just install    # once
just snapshot   # refresh data/snapshot/*.json (GitHub stats, Zenn, YouTube)
just build      # render assets/generated/ and README.md
just check      # typecheck + ast-grep + unit tests
just e2e        # render via GitHub's Markdown API and screenshot dark/light, desktop/mobile
just shoot assets/generated/hero-dark.svg --times 0.5,4,9 --scheme dark
```

The scheduled workflow (`.github/workflows/update.yml`) runs
`snapshot → build → check` every day at 06:17 JST and commits the result.
Add a `PROFILE_TOKEN` secret (fine-grained PAT, no extra permissions) if the
contribution scan should include private contributions the way the profile
calendar does; without it the default `GITHUB_TOKEN` is used.

## Adding a hero photo

Never commit camera originals. Re-encode and strip metadata first:

```bash
magick original.jpg -auto-orient -strip -resize 1400x1400 -interlace JPEG -quality 74 assets/photos/<id>.jpg
exiftool assets/photos/<id>.jpg | grep -i gps   # must print nothing
```

Then add an entry to `data/photos.ts` with the exposure values copied by hand,
and a hand-placed entry in `FRAMINGS` in `src/render/hero.ts` (scale/ox/oy that
cover the 1280x640 frame, `dy` for a tilt, the subject box and the AF point).
Without one the photo falls back to a centred framing and a test fails.

The hero holds at most 4 photos; each embedded photo must stay under 300 KB and
all of them under 800 KB (renderHero throws with a clear message otherwise).
Avoid photos that show people's faces, home exteriors or documents.
