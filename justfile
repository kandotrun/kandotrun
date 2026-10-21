set shell := ["bash", "-cu"]

export COREPACK_ENABLE_DOWNLOAD_PROMPT := "0"

default: check

# Install dependencies from the lockfile
install:
    pnpm install --frozen-lockfile

# Pull GitHub stats, contributions, Zenn and YouTube into data/snapshot/
snapshot:
    pnpm run snapshot

# Fail when data/snapshot/github.json is more than a week old (the workflow's last step)
check-snapshot:
    pnpm exec tsx src/cli/check-snapshot.ts

# Render every SVG and README.md from data/
build:
    pnpm run build

test:
    pnpm run test

typecheck:
    pnpm run typecheck

lint:
    pnpm exec ast-grep scan

# Render README through the GitHub Markdown API; check it in Chromium and WebKit at 846/766/311 px, dark and light
e2e: build
    pnpm run e2e

# Screenshot one SVG at a few animation times, e.g. `just shoot assets/generated/hero-dark.svg`
shoot svg *args:
    pnpm exec tsx src/cli/shoot.ts {{svg}} {{args}}

check: typecheck lint test

# Install a git pre-commit hook that runs `just check` (photo metadata, privacy, purity rules, tests)
hooks:
    #!/usr/bin/env bash
    set -euo pipefail
    hook="$(git rev-parse --git-path hooks)/pre-commit"
    mkdir -p "$(dirname "$hook")"
    printf '#!/bin/sh\nexec just check\n' > "$hook"
    chmod +x "$hook"
    echo "installed $hook"

# What the scheduled workflow runs
update: snapshot build check
