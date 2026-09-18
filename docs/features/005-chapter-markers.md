---
title: Write chapter markers into the MP3 from the document's headings
status: draft
created: 2026-09-19
---

# 005 — Write chapter markers into the MP3 from the document's headings

## Why

A long article or a book chapter has section headings. `src/clean.ts` strips the `#` markers
and Kokoro reads the heading text as one more sentence, so in the MP3 the structure is gone: a
listener who wants the third section of an hour-long reading scrubs for it. Podcast players
show ID3v2 chapter frames as a chapter list. The headings are already in the document; they
should reach the file.

This does not choose anything for the person. The markers are the document's own structure,
in the document's own order, nothing added and nothing left out.

## What changes

- Before: no chapters in the MP3. Heading text is spoken like any paragraph.
- After: each heading becomes a chapter marker at the second its paragraph starts, titled with
  the heading text; the intro paragraph (title, author, site) is chapter one. Players that read
  ID3v2 `CHAP` frames list them. A document without headings produces the same MP3 as today.

## Where

| File                 | Change                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `src/clean.ts`       | `markdownToParagraphs` must say which paragraphs were headings without changing what is spoken |
| `bin/tts.py`         | already prints `PROGRESS i n seconds` after each paragraph, which is each paragraph's end time |
| `src/tts.ts`         | `speak` collects paragraph start times from the progress stream; `encodeMp3` takes `chapters` and writes an `ffmetadata` file with `[CHAPTER]` blocks, passed with `-i` and `-map_metadata` |
| `src/server.ts`      | threads the heading flags and the times from `speak` into `encodeMp3`                       |
| `test/clean.test.ts` | heading paragraphs are flagged; the spoken text is unchanged                                |

## Out of scope

A chapter list in the page's own player (that is 006's territory once times exist). Splitting
into separate episodes, which `splitIntoParts` already does above about 9,000 words. Markers
from anything but headings. Re-encoding items already in the library.

## Acceptance checks

```bash
pnpm test                                                        # all pass, including the heading-flag test
ffprobe -v error -show_chapters out.mp3 | grep -c '^\[CHAPTER\]'  # one per heading, plus one for the intro
ffprobe -v error -show_chapters out.mp3 | grep start_time         # strictly increasing
```

- [ ] A reading with no headings produces an MP3 whose audio stream is byte-identical to before
- [ ] Apple Podcasts on iOS shows the chapter list for an episode of the private feed
- [ ] Chapter titles are the cleaned heading text, not the raw Markdown

## Notes

Open before this leaves draft: how `markdownToParagraphs` returns the flags without breaking
its `string[]` contract, which the tests and `server.ts` rely on (a parallel array, or a
second function that runs on the same input); whether ffmpeg 8 writes `CHAP` and `CTOC` frames
into MP3 when `-id3v2_version 3` is set, and whether iOS Podcasts reads them from a private
feed. Try it with one file before writing any code.
