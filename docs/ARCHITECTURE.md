# Architecture

> The map. Read this instead of crawling the repo.

## In one paragraph

kiku is a single Hono server on Node 25 that turns anything readable into audio on the machine
it runs on. A link, a file or pasted text is extracted to markdown, cleaned into prose a
speech model reads well, spoken by Kokoro-82M through MLX on Apple silicon, encoded to MP3
with tags and cover art, and added to a private RSS feed that any podcast player on the home
network can follow. There is no build step — Node strips the types and runs the TypeScript
directly. There is no database: one JSON file and a folder of audio.

## The tree

```
kiku/
  src/
    server.ts      Hono app, all routes, job orchestration. the spine
    extract.ts     url | file | text → { title, author, site, markdown }; chapter splitting
    clean.ts       markdown → prose Kokoro reads well. where audio quality lives
    tts.ts         spawns the MLX driver, streams progress, encodes to mp3
    library.ts     ~/Kiku/library.json, written serially under a lock
    feed.ts        library → RSS with iTunes tags; absolute URLs from the request host
    podcasts.ts    real podcast subscriptions; plays the publisher's own enclosure
    textfeeds.ts   RSS/Atom text feeds; no enclosure, so items go through the TTS pipeline
    ui.ts          the page, served as a string. player, library, feeds, inbox
  bin/
    kiku           CLI
    kiku-remote    tailscale serve — the tailnet address
    kiku-public    secret public link, for players that crawl from a cloud
    tts.py         the MLX driver, run inside .venv
  app/             Swift wrapper → /Applications/Kiku.app
  launchd/         com.param.kiku.plist — keeps the server up
  shortcut/        the iOS Share Sheet shortcut, as a plist, for reference
  assets/          self-hosted fonts, cover art, icon
  test/            clean, extract, textfeeds
```

## Data flow

```
link ──▶ fetch + defuddle ─┐
file ──▶ markitdown/pdftotext ─┼─▶ clean.ts ──▶ bin/tts.py (Kokoro-82M via mlx-audio)
text ──────────────────────┘                          │  ~19× realtime on the M3 Ultra
                                                      ▼
                                          ffmpeg → mp3, 96k mono, ID3 + cover
                                                      │
                                                      ▼
                            ~/Kiku/library.json ──▶ /feed.xml ──▶ any podcast player
                                                      │
                                                      └──▶ the page's own player
                                                           (positions sync server-side)
```

Feeds are a second entrance, not a second pipeline:

```
podcasts.ts  ──▶ publisher's own <enclosure> audio ──▶ played directly, never converted
textfeeds.ts ──▶ new items ──▶ Inbox ──▶ (person chooses) ──▶ the pipeline above
```

## Routes

| Route                                                                | What                                     |
| -------------------------------------------------------------------- | ---------------------------------------- |
| `GET /`                                                              | the page — player, library, feeds, inbox |
| `POST /api/jobs` · `GET /api/jobs[/:id]`                             | submit a reading, watch its progress     |
| `GET`/`DELETE` `/api/library[/:id]`                                  | what has been read                       |
| `GET /feed.xml` · `GET /audio/:file`                                 | the private podcast feed, Range-capable  |
| `GET`/`POST`/`DELETE` `/api/podcasts…` `/api/feeds…`                 | subscriptions, both kinds                |
| `POST /api/feeds/poll` · `POST /api/feeds/import`                    | refresh; OPML-style import               |
| `GET /api/inbox` · `POST /api/inbox/:id/{listen,dismiss}`            | the deliberate-choice gate               |
| `GET /api/positions`                                                 | resume points, shared across devices     |
| `GET /text/:id` · `/cover.png` · `/manifest.webmanifest` · `/health` | supporting                               |

## What it reads and writes

| Path                      | Direction  | What                               | Override    |
| ------------------------- | ---------- | ---------------------------------- | ----------- |
| `~/Kiku/audio/*.mp3`      | write      | the readings                       | `KIKU_HOME` |
| `~/Kiku/text/*.txt`       | write      | the cleaned source of each reading | `KIKU_HOME` |
| `~/Kiku/library.json`     | read+write | the library, written serially      | `KIKU_HOME` |
| `~/Kiku/positions.json`   | read+write | resume points                      | `KIKU_HOME` |
| `~/Kiku/public-token`     | read+write | the secret for `kiku-public`       | `KIKU_HOME` |
| `~/Library/Logs/kiku.log` | write      | the LaunchAgent's log              | —           |

Ports: `4747` (`KIKU_PORT`), `4748` for the public surface (`KIKU_PUBLIC_PORT`).

## Invariants

Nothing leaves the machine. Never deployed — the network boundary is the LAN, widened only to
a tailnet. No queue, no autoplay, no recommendation: 220 subscribed feeds land in an Inbox
that must be acted on, and the friction is the feature. Playback from `<enclosure>`, never
`<link>`. The library is written serially.

## Known sharp edges

No typecheck. `node --test` strips types without checking them, so type errors survive a green
run.

`package.json` lacks `"type": "module"` while the code is ESM. Node infers it and warns.
Adding the field changes how every file is parsed — not a drive-by fix.

`src/clean.ts` failures are audible, not visible. Text that looks correct can still read
badly aloud. Listen.

`ui.ts` serves the whole page as a string. There is no framework and no bundler, which is why
the page loads instantly and why it will get unwieldy — a real decision, recorded in
`docs/DECISIONS.md`, not an oversight.
