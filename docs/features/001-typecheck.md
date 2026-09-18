---
title: Add a typecheck so a green test run means something
status: shipped
created: 2026-09-19
---

# 001 — Add a typecheck so a green test run means something

## Why

`node --test` strips types and runs. It does not check them. Right now `pnpm test` can pass
with a type error sitting in `src/server.ts`, and the only thing standing between that and a
broken reading is someone having read the diff carefully.

This matters more than it would in most repos because the failure mode is asynchronous: a bad
type in the TTS path does not throw until a job is halfway through spawning MLX, by which
point the person has already pressed the button and walked away. niwa runs `tsc --noEmit` as
`pretest` for exactly this reason; kiku should too.

## What changes

- Before: `pnpm test` ran 24 tests and reported success regardless of type errors.
- After: `pnpm test` typechecks first (`pretest`) and fails before a single test runs.

## Where

| File            | Change                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`  | `typescript` 7.0.2 and `@types/node` 26.6.1 as devDependencies; `typecheck` and `pretest` scripts, both `tsc --noEmit`                                                  |
| `tsconfig.json` | new: `module`/`moduleResolution` `nodenext`, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `noEmit`, `strict`, `target` `es2024`, `types: ["node"]`, `skipLibCheck` |

## Out of scope

Fixing whatever the first run reports. If the typecheck surfaces existing errors, they get
their own feature rather than being bundled here — a feature that both adds a gate and
changes code to get through it makes both halves unreviewable.

`package.json` already carries `"type": "module"`; there was nothing to add there.

## Acceptance checks

```bash
pnpm test    # typecheck runs first; tests run only if it passes
```

- [x] Introducing a deliberate type error makes `pnpm test` fail before any test runs
- [x] With the error removed, all existing tests still pass
- [x] `.ts` extension imports still resolve — `allowImportingTsExtensions` is set
- [x] The count of pre-existing errors is reported here: zero

## Notes

Shipped 2026-09-19 on Node 25.9.0 with TypeScript 7.0.2 and `@types/node` 26.6.1. The first
`pnpm typecheck` over `src/` and `test/` printed nothing and exited 0: zero pre-existing errors.

With `src/__probe.ts` containing `const n: number = "not a number";`, `pnpm test` stopped in
`pretest` before a single test ran:

```

> kiku@0.1.0 pretest <repo>
> tsc --noEmit

src/__probe.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.
 ELIFECYCLE  Command failed with exit code 1.
exit=1
```

With the probe removed:

```
> kiku@0.1.0 pretest <repo>
> tsc --noEmit
> kiku@0.1.0 test <repo>
> node --test 'test/**/*.test.ts'
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 206.662833
exit=0
```

`skipLibCheck` is on because without it `tsc` reports 131 errors, all inside `linkedom`'s own
`.d.ts` files (its `DOMParser` and element classes disagree with the DOM lib), none in this
repo. The repo's own files are checked in full. niwa's `tsconfig.json` supplied the option
names, not the file: kiku is plain Node, not Next.js.
