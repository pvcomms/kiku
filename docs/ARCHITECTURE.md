# Architecture

> The map. Read this instead of crawling the repo.

## In one paragraph

kiku is a single Hono server on Node 25 that turns anything readable into something the
person owns, on the machine it runs on. A link, a file or pasted text is extracted to
markdown, then either _listened to_ — cleaned into prose a speech model reads well, spoken by
Kokoro-82M through MLX on Apple silicon, encoded to MP3 and added to a private RSS feed — or
_seen_: read by a local Ollama model into three or five sets and drawn as one self-contained
interactive HTML page. Either result is copied into the Proton Drive sync folder. There is no
build step — Node strips the types and runs the TypeScript directly. There is no database:
one JSON file and two folders. It runs on the Studio at home and on the laptop on the road;
`bin/doctor` says what a machine is missing.

## The tree

```
kiku/
  src/
    server.ts      Hono app, all routes, job orchestration. the spine
    jobs.ts        what a job is; ~/Kiku/jobs.json so an interrupted one comes back as an error
    extract.ts     url | file | text → { title, author, site, markdown }; chapter splitting
    clean.ts       markdown → prose Kokoro reads well. where audio quality lives
    tts.ts         spawns the MLX driver, streams progress, encodes to mp3
    analyze.ts     markdown → the sets it is made of, via a local model; validate, repair once
    artifact.ts    sets → the venn template's config → one self-contained html file
    ollama.ts      the local model runner: what is installed, which fits, one JSON turn
    export.ts      copies into the Proton Drive folder; an archive, never read back
    preflight.ts   what this machine has and the fix for each gap; /health and bin/doctor
    library.ts     ~/Kiku/library.json, written serially under a lock; audio and artifacts
    feed.ts        library → RSS with iTunes tags; audio only; absolute URLs from the request host
    podcasts.ts    real podcast subscriptions; plays the publisher's own enclosure
    textfeeds.ts   RSS/Atom text feeds; no enclosure, so items go through the TTS pipeline
    ui.ts          the page, served as a string. listen/see, player, library, feeds, inbox
  bin/
    kiku           CLI; --see draws instead of reads
    doctor         the readiness report from the shell; exit 1 when a reading cannot happen
    setup-road     a bare Mac → green doctor, idempotent
    mirror-ssd, restore-from-ssd   the stand to and from /Volumes/Go/kiku-road; nothing deleted
    vendor-venn.mjs  writes assets/venn.html from the sibling template; fails if an anchor moved
    kiku-remote    tailscale serve — the tailnet address
    kiku-public    secret public link, for players that crawl from a cloud
    tts.py         the MLX driver, run inside .venv
    install-launchd  renders launchd/…plist.template for this machine and loads it
    setup-python.sh  builds .venv from pyproject.toml
    shot.mjs         the README screenshot, from a second instance seeded with synthetic entries
  app/             Swift wrapper → /Applications/Kiku.app
  launchd/         com.param.kiku and com.param.ollama plist templates; bin/install-launchd and bin/setup-road fill them in
  shortcut/        the iOS Share Sheet shortcut, as a plist, for reference
  assets/          self-hosted fonts, cover art, icon; venn.html (generated) and venn.source.txt
  test/            clean, extract, textfeeds, preflight, jobs, export, analyze, artifact
  pyproject.toml   the Python half, pinned; .venv is built from it and never edited
```

## Data flow

```
link ──▶ fetch + defuddle ─┐
file ──▶ markitdown/pdftotext ─┼─▶ extract.ts ──┬─ listen ─▶ clean.ts ──▶ bin/tts.py (Kokoro-82M via mlx-audio)
text ──────────────────────┘                    │                                │  ~19× realtime on the M3 Ultra
                                                │                                ▼
                                                │                    ffmpeg → mp3, 96k mono, ID3 + cover
                                                │                                │
                                                └─ see ─▶ analyze.ts ──▶ Ollama at 127.0.0.1 (largest model that fits)
                                                              │  validate · repair once
                                                              ▼
                                                   artifact.ts → assets/venn.html + config → one .html
                                                                                 │
                            ~/Kiku/library.json ◀────────────────────────────────┘
                                   │
                                   ├──▶ /feed.xml ──▶ any podcast player           (audio only)
                                   ├──▶ the page's own player · /artifacts/:file    (positions sync server-side)
                                   └──▶ export.ts ──▶ <Proton Drive>/Kiku/{Audio,Artifacts}/   (a copy; never read back)
```

The two halves are strictly one after the other — `pump()` runs one job at a time and the
model is released as it answers — so on a 16GB laptop Kokoro never shares memory with Ollama.

Feeds are a second entrance, not a second pipeline:

```
podcasts.ts  ──▶ publisher's own <enclosure> audio ──▶ played directly, never converted
textfeeds.ts ──▶ new items ──▶ Inbox ──▶ (person chooses) ──▶ the pipeline above
```

## Routes

| Route                                                                            | What                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /`                                                                          | the page — listen/see, player, library, feeds, inbox          |
| `GET /health`                                                                    | the readiness report: every check, its fix, the export folder |
| `POST /api/jobs` (`mode`: listen \| see, `sets`: 3 \| 5) · `GET /api/jobs[/:id]` | submit, watch progress                                        |
| `POST /api/jobs/:id/again` · `DELETE /api/jobs/:id`                              | retry or dismiss an interrupted job                           |
| `GET`/`DELETE` `/api/library[/:id]`                                              | what has been read or drawn                                   |
| `GET /feed.xml` · `GET /audio/:file`                                             | the private podcast feed, Range-capable                       |
| `GET /artifacts/:file`                                                           | a drawn page, served as a page                                |
| `POST /api/export/reconcile`                                                     | copy anything missing into Proton Drive now                   |
| `GET`/`POST`/`DELETE` `/api/podcasts…` `/api/feeds…`                             | subscriptions, both kinds                                     |
| `POST /api/feeds/poll` · `POST /api/feeds/import`                                | refresh; OPML-style import                                    |
| `GET /api/inbox` · `POST /api/inbox/:id/{listen,dismiss}`                        | the deliberate-choice gate                                    |
| `GET /api/positions`                                                             | resume points, shared across devices                          |
| `GET /text/:id` · `/cover.png` · `/manifest.webmanifest` · `/health`             | supporting                                                    |

## What it reads and writes

| Path                                                              | Direction  | What                                                      | Override                    |
| ----------------------------------------------------------------- | ---------- | --------------------------------------------------------- | --------------------------- |
| `~/Kiku/audio/*.mp3`                                              | write      | the readings                                              | `KIKU_HOME`                 |
| `~/Kiku/artifacts/*.html`                                         | write      | the drawings, one file each                               | `KIKU_HOME`                 |
| `~/Kiku/text/*.txt`                                               | write      | the cleaned source of each reading                        | `KIKU_HOME`                 |
| `~/Kiku/library.json`                                             | read+write | the library, written serially                             | `KIKU_HOME`                 |
| `~/Kiku/jobs.json`                                                | read+write | jobs, so an interrupted one is reported                   | `KIKU_HOME`                 |
| `~/Kiku/positions.json`                                           | read+write | resume points                                             | `KIKU_HOME`                 |
| `~/Kiku/public-token`                                             | read+write | the secret for `kiku-public`                              | `KIKU_HOME`                 |
| `~/Library/CloudStorage/ProtonDrive-*-folder/Kiku/`               | write      | copies of every reading and drawing                       | `KIKU_EXPORT_DIR`           |
| `~/.cache/huggingface/hub/models--mlx-community--Kokoro-82M-bf16` | read       | the voice; `HF_HUB_OFFLINE=1` once it is there            | `HF_HOME`, `HF_HUB_CACHE`   |
| `127.0.0.1:11434`                                                 | read       | Ollama; the largest installed model that fits ¾ of memory | `KIKU_OLLAMA`, `KIKU_MODEL` |
| `~/Library/Logs/kiku.log`                                         | write      | the LaunchAgent's log                                     | —                           |

Ports: `4747` (`KIKU_PORT`), `4748` for the public surface (`KIKU_PUBLIC_PORT`).

## Invariants

Nothing leaves the machine — the voice and the model that reads a document are both local,
and a drawn page carries its fonts inside it. Never deployed — the network boundary is the
LAN, widened only to a tailnet; the Proton Drive copy is a file written into a folder the
Proton app syncs, not a network path of kiku's own. No queue, no autoplay, no recommendation:
220 subscribed feeds land in an Inbox that must be acted on, and the friction is the feature.
Playback from `<enclosure>`, never `<link>`; artifacts never enter the feed. The library and
the jobs file are written serially. The copy never fails a reading: a reading is done when it
is in `~/Kiku`.

## Known sharp edges

`node --test` run directly skips the typecheck; `pnpm test` runs `tsc --noEmit` first. A green
run of the raw command proves less than it looks.

`src/clean.ts` failures are audible, not visible. Text that looks correct can still read
badly aloud. Listen.

`ui.ts` serves the whole page as a string. There is no framework and no bundler, which is why
the page loads instantly and why it will get unwieldy — a real decision, recorded in
`docs/DECISIONS.md`, not an oversight.

`assets/venn.html` is generated. Editing it by hand is lost on the next `bin/vendor-venn.mjs`;
a template whose anchors have moved fails that script rather than producing a broken page.

`Item.seconds`, `voice` and `speed` are optional now that an item can be a drawing. Code that
reads them must say what it does with an artifact; `feed.ts` filters, `ui.ts` branches.
