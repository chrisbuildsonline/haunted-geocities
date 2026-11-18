# Clean-room check: typecheck, unit tests, manifest lint, e2e (headless Chromium + the
# unpacked extension) and the visual shots against the committed baselines.
# The checks are RUN steps so a failure fails the image build loudly (docker hides container stdout here).
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS base

# bun from npm (the image ships node + npm), so the build needs no second registry pull.
RUN npm install -g bun@1.4.2 && bun --version

# Comic Neue (SIL OFL): the open comic face in the costume's "Comic Sans MS" stack, so the shots
# show the copy's font, not a serif fallback. The build stops here if fontconfig cannot find it.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-comic-neue && rm -rf /var/lib/apt/lists/* \
 && fc-list : family | grep -q "^Comic Neue"

ENV CI=1
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Visual baselines, made in this image so fonts and anti-aliasing match:
#   bun run visual:baselines
FROM base AS visual-update
RUN bun run test:visual:update
FROM scratch AS baselines
COPY --from=visual-update /app/e2e-visual/__screenshots__/ /

# README screenshots and haunt.gif (docs/screenshots/), made in this image so they show Comic Neue:
#   bun run docs:screenshots
FROM base AS shots-run
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
RUN bun run screenshots
FROM scratch AS shots
COPY --from=shots-run /app/docs/screenshots/ /

FROM base
RUN bun run typecheck
RUN bun run test
RUN bun run lint:manifest
RUN bun run test:e2e
RUN bun run test:visual
