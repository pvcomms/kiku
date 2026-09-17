# kiku · 聞く

Paste a link, a file, or the words themselves. The Studio reads it aloud with Kokoro and hands the audio to your phone as a private podcast episode. Nothing leaves the machine: no API keys, no cloud voices, no font requests, no analytics.

- **Page:** http://mac-studio.local:4747 (also http://192.168.68.115:4747)
- **Feed:** http://mac-studio.local:4747/feed.xml
- **Library:** `~/Kiku/audio/*.mp3`, `~/Kiku/text/*.txt`, `~/Kiku/library.json`
- **Log:** `~/Library/Logs/kiku.log`

## Use it

**Phone.** Share a link from Brave to the **Kiku** shortcut. Or open the page in Brave, paste, press _Read it to me_. New readings show up in Apple Podcasts once you follow the feed: Podcasts → Library → ⋯ → _Follow a Show by URL_ → paste the feed address. The page itself also plays audio, remembers your place, and works with the lock screen. (Verified on the Mac Podcasts app: the plain-http `.local` feed is accepted and both episodes appear.)

**Mac.** `/Applications/Kiku.app` opens the page in its own window and starts the service if it is asleep. Or the terminal:

```bash
kiku https://aeon.co/essays/…          # a page
kiku ~/Downloads/chapter.epub          # md, txt, html, pdf, epub, docx, rtf
kiku "Some text to hear"               # pasted text
kiku                                   # library + feed address
kiku --open                            # the page
```

Long books (over ~9,000 words with chapter headings) become one episode per chapter.

## How it works

```
link ──▶ fetch + defuddle ─┐
file ──▶ markitdown/pdftotext ─┼─▶ clean.ts (markdown → spoken paragraphs)
text ──────────────────────┘          │
                                      ▼
                        bin/tts.py  Kokoro-82M via mlx-audio (Apple silicon)
                                      │  ~19× realtime on the M3 Ultra
                                      ▼
                        ffmpeg → mp3 (96k mono, ID3 tags, cover art)
                                      │
                                      ▼
                   ~/Kiku/library.json → /feed.xml (RSS + iTunes tags, Range-capable audio)
```

- `src/server.ts` — Hono on Node 25 (type-stripped TypeScript, no build step). Routes: `/`, `/api/jobs`, `/api/library`, `/feed.xml`, `/audio/:file`, `/cover.png`.
- `src/extract.ts` — URL / file / text → `{ title, author, site, markdown }`; chapter splitting for books.
- `src/clean.ts` — markdown to prose Kokoro reads well (links to their text, no code, no footnote markers, abbreviations expanded).
- `src/tts.ts` + `bin/tts.py` — spawns the MLX driver, streams progress, encodes.
- `src/ui.ts` — the page. Instrument Serif / General Sans / JetBrains Mono, self-hosted in `assets/fonts`.

## The Mac app

`app/main.swift` is a 150-line WebKit window onto the page: native file picker, confirm dialogs, mp3 downloads handed to the browser, and a self-heal that kicks the launchd agent if the server is not answering. Rebuild and reinstall with `app/build.sh` (needs the Xcode Command Line Tools; ad-hoc signed, so it only runs on this Mac).

## Run / restart

Installed as a launchd agent (`~/Library/LaunchAgents/com.param.kiku.plist`, starts at login, restarts on crash).

```bash
launchctl kickstart -k gui/$(id -u)/com.param.kiku    # restart
tail -f ~/Library/Logs/kiku.log                        # watch
node src/server.ts                                     # run by hand (stop the agent first)
```

Python side lives in `.venv` (uv, Python 3.12): `mlx-audio`, `misaki[en]`, `soundfile`, `en_core_web_sm`. The Kokoro weights cache in `~/.cache/huggingface/hub/models--mlx-community--Kokoro-82M-bf16`.

## Voices

Kokoro grades its own voices; the page offers the good ones: Heart (default), Bella, Emma (British), Michael, George (British). Speed is best left at 1.0 and changed in the podcast app.

## Away from home

Everything binds to the home network. To use it anywhere, log into Tailscale on the Studio (menu bar app) and on the phone (App Store app), then:

```bash
kiku-remote
```

That runs `tailscale serve` and prints an `https://mac-studio.<tailnet>.ts.net/` address with a real certificate. Follow that feed in Podcasts instead of the `.local` one and it works on cellular. Nothing is exposed to the public internet; only devices on your tailnet can reach it. (A truly public URL is possible with `tailscale funnel`, but then anyone with the link can queue readings on your Studio, so it would need a password first.)

## Shortcut (build once on the phone, two actions)

Shortcuts can't be signed on this Mac (no iCloud), so make it by hand. Shortcuts app → + → name it **Kiku**, turn on *Show in Share Sheet*, then add:

1. **URL Encode** — input: *Shortcut Input*.
2. **Open URLs** — `http://mac-studio.local:4747/?u=` followed by the *URL Encoded Text* variable.

Sharing a page from Brave now opens Kiku with the link already submitted. Once you are on Tailscale, swap the host for the `ts.net` one so it works away from home too. The quieter variant (no browser tab) is three actions: *Get URLs from Input* → *Get Contents of URL* (POST, JSON body `{ "url": URLs, "text": Shortcut Input }` to `/api/jobs`) → *Show Notification*. `shortcut/Kiku.plist` is that variant as a plist, for reference.
