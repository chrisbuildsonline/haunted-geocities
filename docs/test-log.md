# Test log

- Date: 2026-11-27
- Commit: `3fe1d69`

| Check | Command | Tests | Exit code |
|---|---|---|---|
| Typecheck | `bun run typecheck` | no errors | 0 |
| Unit | `bun run test` | 1434 passed, 0 failed | 0 |
| E2E | `bun run test:e2e` | 182 passed, 0 failed | 0 |
| Visual | `bun run test:visual` | 32 passed, 0 failed | 0 |
| Docker | `bun run docker:test` | typecheck, unit, manifest lint, 182 e2e, 32 visual | 0 |
