---
title: Show the spoken paragraphs beside the player, highlighted in sync
status: draft
created: 2026-09-19
---

# 006 — Show the spoken paragraphs beside the player, highlighted in sync

## Why

Every reading's cleaned text is already on disk (`~/Kiku/text/<id>.txt`, one paragraph per
line) and already served (`GET /text/:id`), but the page never shows it. A listener who wants
to re-read a sentence, copy a quotation or check how a name is spelled has to find the source
again. Text and audio are one thing here; the page should show them as one.

On the thesis: the whole text, in order, with the paragraph currently playing marked by the
playback position and nothing else. No summary, no key points, no highlight the tool picked.

## What changes

- Before: the player shows a title and the audio controls.
- After: a "text" toggle on the player opens the transcript below it. Paragraphs render in
  order; the one being spoken is highlighted and kept in view; clicking a paragraph seeks to
  its start. Items recorded before this feature, which have text but no times, show the text
  without a highlight.

## Where

| File               | Change                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `src/tts.ts`       | `speak` returns paragraph start times from the `PROGRESS` stream (shared with 005)            |
| `src/server.ts`    | write `~/Kiku/text/<id>.times.json` beside the text; `GET /api/library/:id/transcript` returns `{ paragraphs, starts }` |
| `src/ui.ts`        | the toggle, the pane, `timeupdate` → current index, click → `audio.currentTime`               |
| `test/ui.test.ts`  | new: `indexAt(starts, seconds)` as a pure function, including before the first and after the last |

## Out of scope

Transcripts for podcast episodes, which are the publisher's audio and have no text. Editing
the text. Word-level highlighting: Kokoro gives paragraph boundaries, not word timings. Search.

## Acceptance checks

```bash
pnpm test                                                                   # all pass, including indexAt
curl -s http://localhost:4747/api/library/<id>/transcript | \
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s);console.log(t.paragraphs.length===t.starts.length)})'   # true
```

- [ ] While playing, exactly one paragraph is highlighted and it changes at the paragraph boundary
- [ ] Clicking a paragraph moves playback to within a second of its start
- [ ] An item with no `.times.json` opens the transcript with no highlight and no console error

## Notes

Decide before building: whether the times live in a sidecar file (proposed) or on the library
`Item`, which would grow `library.json` with every reading; and whether items without times get
an estimate from word counts or, as proposed, no highlight at all.
