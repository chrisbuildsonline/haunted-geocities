# Test log

- Date: 2026-11-28
- Commit: `a7e8204`

Every check ran on `a7e8204`, the last code commit. Only this log changed after it.

| Check | Command | Tests | Exit code |
|---|---|---|---|
| Typecheck | `bun run typecheck` | no errors | 0 |
| Unit | `bun run test` | 1503 passed, 0 failed | 0 |
| E2E | `bun run test:e2e` | 210 passed, 0 failed | 0 |
| Visual | `bun run test:visual` (the step inside `bun run docker:test`) | 38 passed, 0 failed | 0 |
| Docker | `bun run docker:test --no-cache` | typecheck, 1501 unit (2 git checks skip, no .git in the image), manifest lint, 210 e2e, 38 visual | 0 |

The visual baselines are made in the Playwright Docker image, which installs Comic Neue. On the host (no Comic Neue)
`bun run test:visual` fails its font check and the comic-face shots, so the Visual row is the run inside the image.

The first `bun run docker:test` on `a7e8204` came back with every layer `CACHED` (an earlier build had the same
inputs) and printed no runner output, so it was run again with `--no-cache`. That run is the one below.

The unit run on the host is the one after this log was written: before it, the guard that the log names the last
code commit failed on the old sha (`1502 pass`, `1 fail`), which is the check doing its job.

## Captured output

The summary lines each runner printed on `a7e8204`, copied as they came.

### Typecheck

```
$ tsc --noEmit
```

### Unit

```
bun test v1.4.2 (744846f84)

 1503 pass
 0 fail
 121578 expect() calls
Ran 1503 tests across 93 files. [10.26s]
```

### E2E

```
  210 passed (13.4m)
```

### Visual

```
#16 [stage-5 5/5] RUN bun run test:visual
#16 84.95   38 passed (1.3m)
#16 DONE 85.0s
```

### Docker

```
#12 [stage-5 1/5] RUN bun run typecheck
#12 0.247 $ tsc --noEmit
#12 DONE 0.6s
#13 [stage-5 2/5] RUN bun run test
#13 12.91  1501 pass
#13 12.91  2 skip
#13 12.91  0 fail
#13 12.91  121574 expect() calls
#13 12.91 Ran 1503 tests across 93 files. [12.63s]
#13 DONE 13.0s
#14 [stage-5 3/5] RUN bun run lint:manifest
#14 0.647 lint:manifest: ok
#14 DONE 0.7s
#15 [stage-5 4/5] RUN bun run test:e2e
#15 877.4   210 passed (13.4m)
#15 DONE 877.4s
#16 [stage-5 5/5] RUN bun run test:visual
#16 84.95   38 passed (1.3m)
#16 DONE 85.0s
#17 naming to docker.io/library/haunted-geocities:test done
#17 DONE 6.3s
```
