# Clean-room check: typecheck, unit tests, manifest lint, e2e (headless Chromium + the
# unpacked extension) and the visual shots against the committed baselines.
# The checks are RUN steps so a failure fails the image build loudly (docker hides container stdout here).
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS base

# bun from npm (the image ships node + npm), so the build needs no second registry pull.
RUN npm install -g bun@1.4.2 && bun --version

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

FROM base
RUN bun run typecheck
RUN bun run test
RUN bun run lint:manifest
RUN bun run test:e2e
RUN bun run test:visual
