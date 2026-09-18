# Running your own

kiku is close to generic already — the seam is mostly hostnames and one hardware assumption.

## What is Param's

| Thing                                    | Where                           | Replace with                                    |
| ---------------------------------------- | ------------------------------- | ----------------------------------------------- |
| `mac-studio.local` throughout the README | docs only                       | your own machine's hostname                     |
| `192.168.68.115`                         | README                          | your LAN address                                |
| `tail497a8a.ts.net`                      | README                          | your own tailnet                                |
| `~/Kiku` as the data directory           | `KIKU_HOME`                     | anywhere                                        |
| Ports 4747 / 4748                        | `KIKU_PORT`, `KIKU_PUBLIC_PORT` | anything free                                   |
| `com.param.kiku` LaunchAgent label       | `launchd/com.param.kiku.plist`  | your own reverse-DNS label                      |
| The 220 subscribed feeds                 | `~/Kiku/`, not the repo         | your own; `POST /api/feeds/import` takes a list |
| Cover art and icon                       | `assets/`                       | yours                                           |
| Default voice `af_heart`                 | `src/tts.ts`                    | any of the bundled Kokoro voices                |

## What is the instrument

`src/extract.ts`, `src/clean.ts`, `src/tts.ts`, `src/library.ts`, `src/feed.ts`,
`src/podcasts.ts`, `src/textfeeds.ts` — the whole pipeline is person-agnostic. It takes a
source, produces audio, and publishes a feed. Nothing in `src/` knows whose machine it is on
beyond `KIKU_HOME`.

The refusals are part of the instrument, not the configuration: no queue, no autoplay, no
recommendation, nothing leaving the machine. A fork that adds a queue is a different tool.

## Running it against your own life

1. Apple silicon Mac. `pnpm install`, then create the Python venv and install `mlx-audio`
   (Kokoro-82M downloads on first run).
2. `ffmpeg` on the PATH.
3. `pnpm start`, open `http://<your-host>.local:4747`.
4. Follow `http://<your-host>.local:4747/feed.xml` in any podcast player on the network.
5. Optional: `bin/kiku-remote` for a tailnet address that works on cellular.
6. Optional: `app/build.sh` for the Mac wrapper, and the LaunchAgent plist to keep it up.

## What will not work yet

**Apple silicon only.** `mlx-audio` is MLX, which is Apple's. On any other machine the TTS
step has no backend and nothing else in the pipeline can compensate. Making the speech step
pluggable is the single change that would make this genuinely portable, and it is unbuilt.

The venv path is hardcoded to `.venv/bin/python` inside the repo.

`markitdown` and `pdftotext` are assumed present for file extraction; their absence fails at
use time rather than at startup with a clear message.

There is no first-run setup: the directories under `KIKU_HOME` are created on demand, but
nothing checks the Python environment or `ffmpeg` before the first job fails.
