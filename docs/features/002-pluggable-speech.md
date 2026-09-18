---
title: Make the speech step pluggable so it runs off Apple silicon
status: draft
created: 2026-09-19
---

# 002 — Make the speech step pluggable so it runs off Apple silicon

## Why

kiku is the closest thing here to a finished instrument, and it runs on exactly one kind of
computer. `mlx-audio` is MLX, which is Apple's. On anything else the pipeline extracts and
cleans perfectly and then has nothing to speak with.

Every other part of this repo is already generic. This one dependency is what stands between
"Param's reading machine" and something another person can run, which makes it the single
highest-leverage change for the template goal in `docs/TEMPLATE.md`.

## What changes

- Before: `src/tts.ts` spawns `bin/tts.py` in a repo-local venv, hardcoded to MLX Kokoro.
- After: the speech step is chosen at startup from available backends; MLX stays the default
  where it works, and a machine without it gets a clear message naming what to install rather
  than a failure mid-job.

## Where

| File               | Change                                                                |
| ------------------ | --------------------------------------------------------------------- |
| `src/tts.ts`       | backend interface: `{ id, available(), voices(), speak(text, opts) }` |
| `src/tts-mlx.ts`   | new. the current implementation, moved behind the interface           |
| `src/tts-piper.ts` | new. a CPU backend that runs anywhere                                 |
| `src/server.ts`    | pick a backend at startup; surface which one is live on `/health`     |
| `test/tts.test.ts` | new. selection logic and the no-backend message, with fakes           |

## Out of scope

No cloud backend, ever. Not as an option, not behind a flag. The moment a person's reading
list can be routed to someone else's API this stops being the tool it claims to be.

No change to `clean.ts`, extraction, the library format, or the feed. The seam is speech only.

No voice-quality tuning for the second backend in this feature.

## Acceptance checks

```bash
pnpm test
pnpm start          # /health names the active backend
```

- [ ] On Apple silicon, behaviour is byte-identical to today, same default voice
- [ ] With MLX unavailable, startup selects the fallback and says so, rather than failing
- [ ] With no backend at all, the message names exactly what to install
- [ ] Voice lists come from the active backend, not a hardcoded array

## Notes

Needs a decision on which CPU backend before this leaves draft — Piper is the obvious
candidate, licence and voice quality both need checking. Write the answer into
`docs/DECISIONS.md` at the same time.
