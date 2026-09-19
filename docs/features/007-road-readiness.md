---
title: Run on a laptop, offline, and say what is missing
status: shipped
created: 2026-09-20
---

# 007 — Run on a laptop, offline, and say what is missing

## Why

kiku ran on one machine, the Studio, on its home network. Away from that network it was
reachable over the tailnet and nowhere else, and it depended on the Studio being awake. The
person is leaving the city with an M4 MacBook Pro and wants the instrument itself to travel:
readings on a plane, with no network, and a way to bring a wiped or borrowed Mac back up from
an SSD without the network either.

Two things stood in the way. `src/tts.ts` set `HF_HUB_OFFLINE=0`, so mlx-audio asked Hugging
Face about the Kokoro weights on every reading even though they were already cached — with no
network that is a hang mid-job. And there was no way to ask a machine what it was missing; the
first sign of a missing `pdftotext` was a failed reading.

## What changes

- Before: `HF_HUB_OFFLINE` defaulted to `0`; `/health` said `{ok:true}`; a job that was
  running when the process died vanished from the page; setup was a README.
- After: the hub is told to stay offline whenever the weights are on disk; `/health` is the
  full readiness report and the page shows one line per missing thing with its fix;
  `bin/doctor` prints the same from the shell; jobs persist in `~/Kiku/jobs.json` and an
  interrupted one comes back as an error with an _again_ button; `bin/setup-road` takes a bare
  clone to a green doctor; `bin/mirror-ssd` and `bin/restore-from-ssd` carry the library, the
  weights, one model, the Python runtime and the repo to and from `/Volumes/Go/kiku-road`.

## Where

| File                                          | Change                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/tts.ts`                                  | `HF_HUB_OFFLINE` defaults to `1` when `kokoroSnapshot()` finds the weights                |
| `src/preflight.ts`                            | new. `check({deep})` → `{ok, checks:[{name, ok, detail, fix}]}`; no side effects          |
| `src/ollama.ts`                               | new. `installed()`, `chooseModel()` — the largest installed model that fits ¾ of memory   |
| `src/jobs.ts`                                 | new. `Job`, `Input`, `Mode`; `toStored`, `markInterrupted`; `JobsStore` writes serially   |
| `src/server.ts`                               | `/health` is the report; free-space floor on submit; `POST /api/jobs/:id/again`; `DELETE` |
| `src/ui.ts`                                   | the readiness line under the lede; _again_ and _dismiss_ on interrupted jobs              |
| `bin/doctor`                                  | new. the report from the shell; `--quick`, `--json`; exit 1 when anything is missing      |
| `bin/setup-road`                              | new. idempotent bring-up, ending in `bin/doctor`                                          |
| `bin/mirror-ssd`, `bin/restore-from-ssd`      | new. one-way copies, nothing deleted, one model not the whole store                       |
| `launchd/com.param.ollama.plist.template`     | new. laptop-tuned Ollama agent; installed only where none exists                          |
| `test/preflight.test.ts`, `test/jobs.test.ts` | new                                                                                       |

## Out of scope

Making the speech step run off Apple silicon — that is `002`. Any change to extraction,
cleaning, the library format or the feed. Two-way sync of anything: the SSD is a copy.

## Acceptance checks

```bash
pnpm test                                  # green, 34 tests
bin/doctor                                 # every line ok, exit 0
curl -s localhost:4747/health | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.ok, r.checks.length)})'   # true 9
```

- [ ] With wifi off, `bin/kiku "the quick brown fox"` completes and the log shows no network attempt
- [ ] Kill the server mid-reading; on restart the page shows the job as interrupted with _again_
- [ ] `bin/mirror-ssd` then `bin/restore-from-ssd` on a second account or machine ends in a green doctor

## Notes

The model policy is deliberately a rule, not a table: largest installed model that fits three
quarters of physical memory, `KIKU_MODEL` to pin one. On the 16GB laptop that is `qwen2.5:7b`;
on the Studio it is whatever is largest. Nothing to keep in step with `ollama pull`.

## Ran — 2026-09-20, on the Studio

`pnpm test` → 51 pass, 0 fail (34 at the time this spec was written; 009 added the rest).
`bin/doctor` → 10 lines `ok`, exit 0, 4.0 s with the deep check. `curl /health` → `ok: true`,
9 checks (10 with `?deep=1`). Interrupted job: submitted a 41-word text reading, ran
`launchctl kickstart -k` while it was `reading`, and on restart `/api/jobs` showed it as
`error · interrupted · Interrupted before it finished.` with `again` carrying the text; the
page showed _again_ and _dismiss_; _again_ re-ran it to `done`. `bin/mirror-ssd` → 6.0 GB to
`/Volumes/Go/kiku-road` in one pass (library, weights, `qwen2.5:7b` only, uv Python, repo).

Not run here: the wifi-off reading (this is the home machine; the switch is `HF_HUB_OFFLINE`
and it is covered by the snapshot test), and `restore-from-ssd` onto a second machine — that
is the laptop's first job.
