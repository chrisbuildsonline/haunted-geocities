# Clean-room check: typecheck, unit tests and e2e (headless Chromium + the unpacked extension).
# The checks are RUN steps so a failure fails the image build loudly (docker hides container stdout here).
FROM mcr.microsoft.com/playwright:v1.64.1-noble

# bun from npm (the image ships node + npm), so the build needs no second registry pull.
RUN npm install -g bun@1.4.2 && bun --version

ENV CI=1
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run typecheck
RUN bun run test
RUN bun run test:e2e
