set shell := ["bash", "-cu"]

export COREPACK_ENABLE_DOWNLOAD_PROMPT := "0"

default: check

# Install dependencies from the lockfile
install:
    pnpm install --frozen-lockfile

# Pull GitHub stats, contributions, Zenn and YouTube into data/snapshot/
snapshot:
    pnpm run snapshot

# Render every SVG and README.md from data/
build:
    pnpm run build

test:
    pnpm run test

typecheck:
    pnpm run typecheck

lint:
    pnpm exec ast-grep scan

# Render README through the GitHub Markdown API and screenshot it in dark and light
e2e: build
    pnpm run e2e

# Screenshot one SVG at a few animation times, e.g. `just shoot assets/generated/hero-dark.svg`
shoot svg *args:
    pnpm exec tsx src/cli/shoot.ts {{svg}} {{args}}

check: typecheck lint test

# What the scheduled workflow runs
update: snapshot build check
