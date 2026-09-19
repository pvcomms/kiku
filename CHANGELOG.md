# Changelog

Notable changes to kiku, newest first. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Seeing. Submit chooses _listen_ or _see_. _See_ hands the extracted markdown to the largest
  installed Ollama model that fits in memory, asks it for three or five sets, the meetings
  between them, where the author stands and the set the document never draws, validates the
  answer, repairs it once with the problems named, and writes the interactive venn template
  with that config into `~/Kiku/artifacts/<id>-<slug>.html` — one file, fonts inside, no
  network in it. Drawn items never enter the podcast feed. `bin/kiku --see`, `--see5`.
- Proton Drive. Every finished reading and drawing is copied into the Proton Drive app's sync
  folder under `Kiku/Audio/` and `Kiku/Artifacts/`, after it is done, retried on boot and
  every fifteen minutes, never failing a reading. An archive, not a sync: nothing is read back.
- Readiness. `/health` is a full report — node, ffmpeg, poppler, markitdown, the speech venv,
  the Kokoro weights, Ollama and its model, the Proton folder, free disk — each with the exact
  fix. `bin/doctor` prints it; the page shows one line per missing thing.
- Jobs survive a restart. `~/Kiku/jobs.json`; a job interrupted mid-reading comes back as an
  error with an _again_ button, and a file job says its file must be submitted again.
- The road. `bin/setup-road` takes a bare Apple-silicon Mac to a green doctor. `bin/mirror-ssd`
  and `bin/restore-from-ssd` carry the library, the weights, one model, the Python runtime
  and the repo to and from `/Volumes/Go/kiku-road`, deleting nothing. A laptop-tuned
  `com.param.ollama` launchd template, installed only where none exists.
- `bin/vendor-venn.mjs` writes `assets/venn.html` from `interactive-venn-template` with its
  Google Fonts links replaced by inline `@font-face` (Newsreader, IBM Plex Mono — OFL) and a
  `window.KIKU_ARTIFACT` hook; it fails if a template anchor has moved.
- Tests over preflight, jobs, export, analysis (with a fake model) and rendering; 51 in all.

### Changed

- `HF_HUB_OFFLINE` defaults to `1` once the Kokoro weights are on disk, so a reading with no
  network no longer hangs on a Hugging Face lookup.
- `Item` grew `kind`, `artifactKind`, `sets`, `model` and `exportedAt`; `seconds`, `voice`
  and `speed` are optional now that an item can be a drawing.
- The opening line of this README: kiku is no longer only a reader.

## [0.1.0] - 2026-09-19

The first tagged state: everything below exists and runs on one Apple-silicon Mac.

### Added

- Extraction. A link (fetched once, read with defuddle), a file (Markdown, text, HTML, PDF
  through pdftotext, EPUB, DOCX and RTF through markitdown and textutil) or pasted text becomes
  Markdown with a title, author and site. Books over about 9,000 words with headings split
  into one episode per chapter.
- Cleaning. Markdown becomes prose Kokoro reads well: links to their text, code blocks and
  footnote markers dropped, common abbreviations expanded, paragraphs kept.
- Speech. Kokoro-82M through mlx-audio on Apple silicon, five voices, speed from 0.9 to 1.3,
  progress streamed to the page while it reads.
- Audio and feed. 96k mono MP3 with ID3 tags and cover art, and a private RSS feed with iTunes
  tags and Range-capable audio that any podcast player on the home network can follow.
- The page. One HTML document with a player, the library, the jobs in progress, fonts served
  from the repo, no framework and no request to anyone else. Playback speed control.
- Positions kept on the server, so a phone, a tablet and the Mac resume the same spot.
- Podcast subscriptions that play the publisher's own enclosure, never converted.
- Text feeds. RSS and Atom feeds polled every 30 minutes; new posts land in an Inbox to be read
  aloud through the same pipeline or dismissed. Bulk import of a list of feed URLs.
- Away from home. `bin/kiku-remote` publishes the page to your tailnet over HTTPS with
  `tailscale serve`; `bin/kiku-public` hands out a token-gated feed link through `tailscale
funnel` for players that crawl from their own cloud.
- On the Mac. A WebKit window onto the page (`app/`), a launchd agent that keeps the server up,
  the `bin/kiku` command line, and an iOS Shortcut for the share sheet.
- Tests. 24 tests over cleaning, extraction and text feeds under `node --test`, with a
  typecheck (`tsc --noEmit`) before them, and CI on GitHub Actions.
- Docs. The constellation doc set (`AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
  `docs/TEMPLATE.md`, `docs/features/`), `CONTRIBUTING.md`, `SECURITY.md`, this file, a pinned
  `pyproject.toml` with `bin/setup-python.sh` for the Python half, and a launchd template with
  `bin/install-launchd`.

[Unreleased]: https://github.com/pvcomms/kiku/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/pvcomms/kiku/releases/tag/v0.1.0
