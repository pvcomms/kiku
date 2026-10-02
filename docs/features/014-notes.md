---
title: Mark a moment while listening, say what it made you think, keep both as notes
status: shipped
created: 2026-10-02
---

# 014 — Mark a moment while listening, say what it made you think, keep both as notes

## Why

Listening is the one way of taking in a text that leaves no trace. Reading, a person underlines;
listening on a walk, the sentence that mattered is gone by the next paragraph, and finding it again
means scrubbing. The moment should be keepable at the moment, with the hands busy, and with
whatever it prompted said aloud rather than typed.

On the thesis: a note holds the second the person chose, the words that were playing then, and the
words the person said. Nothing is extracted, summarised or picked by the tool.

## What changes

- **Mark.** One gesture saves `{ reading, second, the paragraph being spoken }`. The gesture is the
  player's `mark` button, `m` on a keyboard, or the media session's _next track_ action (headphone
  double-tap, the lock screen, a Mac's media key). There is no next track in kiku, so that slot
  is free.
- **Speak.** The player's `speak` button pauses playback, marks, records the person until they
  press it again, resumes, and transcribes what they said on this machine. The transcript becomes
  the note's words. Recording needs a secure origin, so it works on `localhost` and the tailnet
  `https` address, not on `http://<mac>.local`; there the button says why it is off.
- **The words at the mark.** A reading's paragraph start times are kept beside its text
  (`text/<id>.times.json`), from the progress lines the speech step already prints. A reading made
  before this has no times, so its paragraph is estimated from where the second falls in the text
  by length, and the note says it is approximate. The paragraph is the one playing two seconds
  before the mark, because a person marks after hearing.
- **Episodes.** A show's episode has no text, so the thirty seconds before the mark are fetched
  from the enclosure and transcribed, after the fact, into the note's quote.
- **Notes.** `/notes` lists every note by reading, newest reading first. A timestamp plays the
  reading from that second. A note's words can be typed or corrected there, and a note is removed
  with two presses. Each reading's notes are also written as `~/Kiku/notes/<id>.md` and copied into
  Proton Drive's `Kiku/Notes/`, for reading anywhere; those files are written, never read back.
- **Mac app.** The WebKit window grants the microphone to the page it serves.

The voice model is Parakeet TDT 0.6b v3 (`mlx-community/parakeet-tdt-0.6b-v3`), run through the
`mlx-audio` already in the speech environment: no new dependency. `KIKU_STT_MODEL` names another
mlx-audio speech-to-text model. Without the weights the page hides `speak`; marks still work.

## Where

| File                               | Change                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/notes.ts`                     | new: `Notes` (`~/Kiku/notes.json`, written serially), `indexAt`, `estimateStarts`, `startsFromEnds`, `toMarkdown`   |
| `src/stt.ts`                       | new: `toWav` (ffmpeg, optionally a window of a remote file), `transcribe`, one at a time                            |
| `bin/stt.py`                       | new: one wav in, its text out, through mlx-audio                                                                    |
| `src/preflight.ts`                 | `snapshotOf(repo)`; a `want`-level check for the voice-notes model                                                  |
| `src/server.ts`                    | keep paragraph times; `/notes`; `GET/POST /api/notes`, `POST /api/notes/:id/voice`, `PATCH`/`DELETE /api/notes/:id` |
| `src/library.ts`                   | removing a reading removes its times file                                                                           |
| `src/ui.ts`                        | `mark` and `speak` in the player; the notes view; the nav link                                                      |
| `app/main.swift`, `app/Info.plist` | the microphone usage string and the WebKit capture grant                                                            |
| `test/notes.test.ts`               | new: the pure functions, the store's markdown                                                                       |

## Acceptance

```bash
pnpm test
# → tsc clean; notes.test.ts passes alongside the rest

curl -s -X POST localhost:4747/api/notes -H 'content-type: application/json' \
  -d '{"itemId":"<a reading id>","at":95}' | jq '.note | {at, quote: (.quote|length > 0), approx}'
# → { "at": 95, "quote": true, "approx": true }   (a reading made before this spec)

say -o /tmp/n.aiff "a note said aloud" && curl -s -X POST localhost:4747/api/notes/<note id>/voice \
  -H 'content-type: audio/aiff' --data-binary @/tmp/n.aiff | jq -r .note.said
# → A note said aloud.

ls ~/Kiku/notes/
# → <reading id>.md, with the timestamp, the quoted paragraph and the words
```

## What was run

On 2026-10-02, against a second instance (`KIKU_PORT=4757`) holding a copy of the library:
`pnpm test` passed 89 of 89. A mark at 95 s on a reading made before this spec returned its
paragraph with `approx: true`; transcribing the audio around 1:35, 20:00 and 50:00 showed the
estimate on the right paragraph twice and one paragraph late at a boundary. A new reading wrote
`text/<id>.times.json` and its marks quoted the exact paragraph. A `say` clip posted to
`/voice` came back word for word in 3.6 s and landed in `notes/<id>.md` and the export folder.
A mark at 30:00 of a Dwarkesh episode transcribed the half minute before it from the enclosure.
In the browser: mark, a timestamp playing from its second, write, two-press remove, the phone
layout in light mode, and `speak` end to end with a synthetic microphone stream.

Not verified here: a real microphone in Brave on the phone over the tailnet, the rebuilt Mac
app's permission prompt, and whether iOS shows track buttons in place of the skip buttons on
the lock screen now that _next track_ has a handler.

## Out of scope

Notes on the `/read/:id` page (no audio, so no second to anchor to; selecting text is a different
feature). Recording while the phone is locked: iOS gives a web page no microphone in the
background, so a locked phone marks and the words are added at `/notes`. Marks made inside Apple
Podcasts or any other player, which offer no hook. Search across notes.
