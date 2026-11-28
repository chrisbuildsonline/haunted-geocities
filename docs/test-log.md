# Test log

- Date: 2026-11-28
- Commit: `fe369fe`

Every check ran on `fe369fe`, the last code commit. Only this log and its guard test changed after it.

| Check | Command | Tests | Exit code |
|---|---|---|---|
| Typecheck | `bun run typecheck` | no errors | 0 |
| Unit | `bun run test` | 1489 passed, 0 failed | 0 |
| E2E | `bun run test:e2e` | 200 passed, 0 failed | 0 |
| Visual | `bun run test:visual` (the step inside `bun run docker:test`) | 38 passed, 0 failed | 0 |
| Docker | `bun run docker:test` | typecheck, 1489 unit, manifest lint, 200 e2e, 38 visual | 0 |

The visual baselines are made in the Playwright Docker image, which installs Comic Neue. On the host (no Comic Neue)
`bun run test:visual` fails its font check and the comic-face shots (`30 failed`, `8 passed (3.9m)`, exit 1), so the
Visual row is the run inside the image.

## Captured output

The summary lines each runner printed on `fe369fe`, copied as they came.

### Typecheck

```
$ tsc --noEmit
```

### Unit

```
bun test v1.4.2 (744846f84)

 1489 pass
 0 fail
 121508 expect() calls
Ran 1489 tests across 92 files. [10.24s]
```

### E2E

```
  200 passed (12.6m)
```

### Visual

```
#16 [stage-5 5/5] RUN bun run test:visual
#16 83.34   38 passed (1.3m)
#16 DONE 83.4s
```

### Docker

```
#12 [stage-5 1/5] RUN bun run typecheck
#12 0.182 $ tsc --noEmit
#12 DONE 0.6s
#13 [stage-5 2/5] RUN bun run test
#13 10.40  1489 pass
#13 10.40  0 fail
#13 10.40  121508 expect() calls
#13 10.40 Ran 1489 tests across 92 files. [10.13s]
#13 DONE 10.5s
#14 [stage-5 3/5] RUN bun run lint:manifest
#14 2.687 lint:manifest: ok
#14 DONE 2.7s
#15 [stage-5 4/5] RUN bun run test:e2e
#15 798.4   200 passed (12.4m)
#15 DONE 798.4s
#16 [stage-5 5/5] RUN bun run test:visual
#16 83.34   38 passed (1.3m)
#16 DONE 83.4s
#17 naming to docker.io/library/haunted-geocities:test done
#17 DONE 0.6s
```
