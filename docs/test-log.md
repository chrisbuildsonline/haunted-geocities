# Test log

- Date: 2026-11-27
- Commit: `cd6f0d9`

| Check | Command | Tests | Exit code |
|---|---|---|---|
| Typecheck | `bun run typecheck` | no errors | 0 |
| Unit | `bun run test` | 1481 passed, 0 failed | 0 |
| E2E | `bun run test:e2e` | 189 passed, 0 failed | 0 |
| Visual | `bun run test:visual` | 38 passed, 0 failed | 0 |
| Docker | `bun run docker:test` | typecheck, unit, manifest lint, 189 e2e, 38 visual | 0 |
