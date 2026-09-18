# Agents

Constellation-wide rules: `~/Code/cfap/AGENTS.md`. Read it once, then this. The map is
`docs/ARCHITECTURE.md` — read that instead of listing files.

## Stack

Node 25 with native type stripping — TypeScript runs directly, **there is no build step**, and
imports must carry explicit `.ts` extensions. Hono + `@hono/node-server` for HTTP.
`defuddle` + `linkedom` for extraction. Kokoro-82M via `mlx-audio` in a Python venv for
speech. `ffmpeg` for encoding. Swift for the Mac wrapper. pnpm.

`package.json` has no `"type": "module"` despite the code being ESM; Node infers it and warns
on each test run. Harmless, and adding the field is a real change to how every file is parsed
— do not add it as a drive-by.

## Commands

```bash
pnpm test    # node --test on test/**/*.test.ts — this is the proof
pnpm dev     # node --watch src/server.ts
pnpm start   # what the LaunchAgent runs
bin/kiku     # the CLI: a url, a file, quoted text, or nothing for the library
```

There is no typecheck script. `node --test` type-strips without checking types, so a type
error is only caught by reading. Do not assume a green test run means the types are sound.

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
