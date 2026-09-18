---
title: Add a typecheck so a green test run means something
status: next
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

- Before: `pnpm test` runs eight tests and reports success regardless of type errors.
- After: `pnpm test` typechecks first and fails loudly before a single test runs.

## Where

| File            | Change                                                               |
| --------------- | -------------------------------------------------------------------- |
| `package.json`  | add `typescript` to devDependencies; add `"pretest": "tsc --noEmit"` |
| `tsconfig.json` | new. match niwa's — `allowImportingTsExtensions`, `noEmit`, strict   |

## Out of scope

Fixing whatever the first run reports. If the typecheck surfaces existing errors, they get
their own feature rather than being bundled here — a feature that both adds a gate and
changes code to get through it makes both halves unreviewable.

Do not add `"type": "module"` to `package.json` while in there. It is a separate change to how
every file is parsed.

## Acceptance checks

```bash
pnpm test    # typecheck runs first; tests run only if it passes
```

- [ ] Introducing a deliberate type error makes `pnpm test` fail before any test runs
- [ ] With the error removed, all existing tests still pass
- [ ] `.ts` extension imports still resolve — `allowImportingTsExtensions` is set
- [ ] The count of pre-existing errors is reported here, whether zero or not

## Notes

niwa's `tsconfig.json` is the reference. The two repos differ — niwa is Next.js, kiku is plain
Node — so copy the compiler options, not the file.
