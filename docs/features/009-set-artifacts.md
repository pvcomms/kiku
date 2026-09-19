---
title: Draw a document as a set diagram, on this machine, into one file
status: shipped
created: 2026-09-20
---

# 009 — Draw a document as a set diagram, on this machine, into one file

## Why

kiku turned anything readable into audio. The person also thinks in sets — the diagram on
paramv.com is `interactive-venn-template`, a single file with a config contract — and wanted
the same input to be able to come out as that diagram instead of a voice: three or five
overlapping sets, the places where they meet, where the author stands, and the set the
document never draws. Locally, like the voice: a document a person is reading must not pass
through anyone else's model.

## What changes

- Before: submit produced a reading.
- After: submit chooses _listen_ or _see_. _See_ runs the same extraction, hands the markdown
  to the largest installed Ollama model that fits in memory, asks it for the smallest thing
  that can become a diagram (labels, one-line descriptions, names for the meetings — indices,
  no colours, no geometry), validates the answer, repairs it once with the problems named,
  then writes the vendored venn template with that config into `~/Kiku/artifacts/<id>-<slug>.html`.
  One file, no network in it, the customise panel still live, copied to Proton Drive like a
  reading. Artifacts never enter the podcast feed.

## Where

| File                                            | Change                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/analyze.ts`                                | new. `SCHEMA`, `PAIRS` per layout, `validate()`, `excerpt()`, `toSets()` with one repair                    |
| `src/artifact.ts`                               | new. `toVenn()` spec → `{layout, config}`; `render()` on three anchors that must occur once                 |
| `src/ollama.ts`                                 | `chatJson()` — `format: schema`, `keep_alive: 0`, `temperature: 0.2`                                        |
| `bin/vendor-venn.mjs`                           | new. patches the template: Google Fonts → inline `@font-face`; the `window.KIKU_ARTIFACT` hook              |
| `assets/venn.html`                              | generated, never hand-edited; `assets/venn.source.txt` records the upstream sha                             |
| `assets/fonts/`                                 | Newsreader 300/300i, IBM Plex Mono 400/500 — OFL, latin subsets                                             |
| `src/library.ts`                                | `kind`, `artifactKind`, `sets`, `model`; `seconds`/`voice`/`speed` optional; `pathOf()`                     |
| `src/feed.ts`                                   | only `kind === "audio"` becomes an enclosure                                                                |
| `src/server.ts`                                 | `mode` and `sets` on `POST /api/jobs`; `see()`; `GET /artifacts/:file`; export into `Artifacts/`            |
| `src/ui.ts`                                     | the listen / see control; drawn rows open the page                                                          |
| `bin/kiku`                                      | `--see`, `--see5`                                                                                           |
| `test/analyze.test.ts`, `test/artifact.test.ts` | new — validation, repair against a fake model, the mapping, the anchors, the vendored page requests nothing |

## Out of scope

A cloud model, ever, as with the voice. A second artifact kind: `artifactKind` is the seam and
`venn` is the only value. Letting the model choose three or five: the person chooses. Word
timings, transcripts, anything on the audio side. Editing the diagram inside kiku — the file
carries the template's own customise panel and its export button for that.

## Acceptance checks

```bash
node bin/vendor-venn.mjs                                   # assets/venn.html … from interactive-venn-template <sha>
grep -c "fonts.googleapis.com" assets/venn.html            # 0
pnpm test                                                  # green
curl -s -X POST localhost:4747/api/jobs -H 'content-type: application/json' \
  -d '{"url":"https://mechanize.work/life-after-work","mode":"see"}'
# wait for status "done", then:
curl -s localhost:4747/feed.xml | grep -c '\.html'        # 0
ls ~/Kiku/artifacts/                                        # <id>-<slug>.html
ls ~/Library/CloudStorage/ProtonDrive-*-folder/Kiku/Artifacts/   # the same file
```

- [ ] The artifact opens from `file://` with the network off and draws three named sets
- [ ] The Network tab shows no request but the page itself
- [ ] With Ollama stopped, `mode:"see"` fails with the start command and `mode:"listen"` still works
- [ ] A model answer with a missing pair is repaired once; one that stays wrong fails with the problems listed

## Notes

The model is asked for indices and words only because that is what a 7B model gets right.
Colours, ids, sorted pair keys and physics are the template's own and are filled in by
`toVenn()`. Five circles draw seven of the ten pairs — the template's honesty about its own
geometry — and the prompt names exactly those seven.

## Ran — 2026-09-20, on the Studio

`node bin/vendor-venn.mjs` → `assets/venn.html 153KB, from interactive-venn-template fd841ff`.
`grep -c fonts.googleapis.com assets/venn.html` → 0. `pnpm test` → 51 pass, including the test
that loads the vendored page and asserts no `<link>`, `<script src>` or CSS `url()` leaves it.
Submitted `https://www.mechanize.work/blog/life-after-work/` with `mode: see`: `thinking ·
gpt-oss:120b is reading 1,558 words` for 124 s (the Studio picks its largest model), then
`done · drawn`. The model's three sets: FULL AUTOMATION / HUMAN LABOR / SOCIAL WELFARE;
meetings "automation wage tension", "automation welfare synergy", "labor welfare link"; triple
"post automation contract"; marker "future optimist"; the undrawn set "meaningful purpose
beyond work". `feed.xml | grep -c .html` → 0. The page opened at `/artifacts/…html` with the
brand line reading LIFE AFTER WORK, the customise panel live, and the browser's network log
showing one request: the page itself. The copy reached `Kiku/Artifacts/`.

Not run: the with-Ollama-stopped check (the Studio's Ollama is under a KeepAlive agent; the
path is covered by `installed()` throwing in `see()`), and the repair path against a real
model — it is covered against a fake in `test/analyze.test.ts`.
