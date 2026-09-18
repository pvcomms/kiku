# Agents

Constellation-wide rules: `~/Code/cfap/AGENTS.md`. Read it once, then this. The map is
`docs/ARCHITECTURE.md` — read that instead of listing files.

## Stack

Node 25 with native type stripping — TypeScript runs directly, **there is no build step**, and
imports must carry explicit `.ts` extensions. Hono + `@hono/node-server` for HTTP.
`defuddle` + `linkedom` for extraction. Kokoro-82M via `mlx-audio` in a Python venv for
speech, built by `bin/setup-python.sh` from `pyproject.toml`. `ffmpeg` for encoding. Swift for
the Mac wrapper. pnpm 10 (`packageManager`).

## Commands

```bash
pnpm test       # tsc --noEmit, then node --test on test/**/*.test.ts — this is the proof
pnpm typecheck  # the typecheck alone
pnpm dev        # node --watch src/server.ts
pnpm start      # what the LaunchAgent runs
bin/kiku        # the CLI: a url, a file, quoted text, or nothing for the library
```

`pnpm test` typechecks first, so a green run means the types are sound too. `node --test` run
directly strips types without checking them; do not read its green as proof.

## Invariants

**Nothing leaves the machine.** No API keys, no cloud voices, no CDN fonts, no analytics.
Fonts are `.woff2` files in `assets/fonts/`. The voice model runs locally on Apple silicon.
A feature that needs the network fetches _the thing the person asked for_ and nothing else.

**Never deploy this.** It binds to the home network. Remote access is `tailscale serve` via
`bin/kiku-remote`, on a tailnet, with a real certificate. `bin/kiku-public` exists for
players that crawl from a cloud and hands out a secret link — treat widening that surface as a
security change, not a feature.

**No queue, no autoplay, no next-up, no recommendation.** The person chooses the thing. Feeds
land in an Inbox that must be acted on. The absence of an algorithmic queue is the product;
anything that fills the slot after the chosen item is out of scope and should be refused.

**Playback comes from `<enclosure url>`, never `<link>`.** Publishers routinely point `<link>`
at a marketing page. This has already bitten once.

**The library is written serially.** `src/library.ts` holds a single `library.json` under a
lock so concurrent jobs cannot interleave and corrupt it. Any new writer to `~/Kiku/` uses the
same discipline.

## Do not touch

`~/Kiku/` contents by hand while the server is running. `.venv/` — it is the MLX environment,
rebuilt not edited. `assets/fonts/` — self-hosted on purpose.

## Traps

**Text feeds are not podcasts.** `src/podcasts.ts` plays a publisher's own audio from an
enclosure. `src/textfeeds.ts` has no enclosure and runs the link through
extract → clean → Kokoro instead. They look similar and are not interchangeable.

**`src/clean.ts` is where quality lives.** Kokoro reads markdown literally — a stray footnote
marker, a code block or an unexpanded abbreviation is audible. Changes to extraction that
look fine as text can sound broken. Listen before shipping anything that touches it.

**Books split by chapter above ~9,000 words** when headings exist. A change to the splitter
changes how existing long items would re-render, though already-generated audio is untouched.

**`KIKU_HOME` and `KIKU_PORT`** are the seam for running a second instance. Hardcoding either
breaks that.

---

<!-- BEGIN:cfap -->

## Constellation rules

This repo is part of the Center for Applied Post-Phenomenology constellation. These rules hold
here and in every sibling repo. This block is generated — edit `cfap/KERNEL.md`, not this copy.

**Read this much, then stop.** This file, then `docs/ARCHITECTURE.md` for the map, then the one
feature spec you were given at `docs/features/NNN-slug.md`. Do not crawl the repo to get
oriented — the architecture doc exists so you do not have to. Do not open a fifth document
without a reason you could state. Token discipline is a product requirement here, not a
preference: a tool about attention that wastes yours is a joke.

**Local by default.** Personal data stays on the machine that made it. No telemetry, no
analytics, no error reporting to a third party, no fonts or scripts from a CDN, no usage pings.
If a feature needs the network it says so in its spec and names the host.

**Flat files are the database.** Markdown with YAML frontmatter for what a human writes, JSON
for what a program writes. No hosted database, no ORM, no migration framework.

**The tool never decides.** Nothing ranks a person's options for them, scores them against a
norm, or recommends. Instruments surface; people judge. If a spec asks for a recommendation
engine, it is out of scope — say so rather than building it.

**No dependency without a written reason** in `docs/DECISIONS.md`. Prefer the standard library.
Prefer thirty lines you can read.

**Three similar lines beat a premature abstraction.** Extract on the third repetition.

**Never invent a fact about the system.** If you need to know what deploys where or whether
something is live, check it. This whole structure exists because hand-written claims drifted
from reality while still reading as authoritative.

**Features** are `docs/features/NNN-slug.md` with frontmatter `status:` of `draft` / `next` /
`building` / `shipped` / `parked`. Acceptance checks are commands with expected output, never
adjectives. Mark `shipped` only when you ran them and they passed — and report the output. A
feature you could not finish stays `building` with a note on what blocked it. Never silently
narrow scope.

**Style.** Plain declarative prose, no emoji, no "comprehensive" or "seamlessly", no summary
paragraph restating what was just said. Code matches its neighbours. Commit subjects say what
changed and why it mattered.

**Before you finish**, run the repo's tests and typecheck, and say plainly what passed, what
failed, and what you did not do.

<!-- END:cfap -->
