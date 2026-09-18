---
title: Import and export the text-feed subscriptions as OPML
status: next
created: 2026-09-19
---

# 003 — Import and export the text-feed subscriptions as OPML

## Why

The Feeds section takes one URL at a time, and the only bulk route, `POST /api/feeds/import`,
wants a JSON body that nobody's reader produces. Moving a few hundred subscriptions in means
writing a script; moving them out is impossible, so the list a person has built lives only in
`textfeeds.json`. Every feed reader exports and imports OPML. kiku should speak it in both
directions.

This does not touch the thesis. An OPML file is a list the person already chose; nothing here
suggests a feed, ranks one or subscribes to anything the file does not name.

## What changes

- Before: import is JSON only (`{ "feeds": [url, …] }`), reached with `curl`. There is no export.
- After: `GET /api/feeds/opml` downloads `kiku-feeds.opml`, one `<outline type="rss">` per
  text feed with `text`, `title`, `xmlUrl` and, when known, `htmlUrl`. `POST /api/feeds/import`
  also accepts an OPML document (content type `text/xml`, `text/x-opml` or
  `application/xml`, or a multipart `file` field) and subscribes to every `xmlUrl` in it,
  nested outlines included, skipping URLs already subscribed. The Feeds section gains an
  "import OPML" file button and an "export OPML" link. Imported feeds start caught up, exactly
  as a pasted URL does today.

## Where

| File                     | Change                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/textfeeds.ts`       | `toOpml(feeds: TextFeed[]): string` and `parseOpml(xml: string): string[]`; both pure, use `attrFrom` |
| `src/server.ts`          | `GET /api/feeds/opml`; `POST /api/feeds/import` sniffs the content type and calls `parseOpml`      |
| `src/ui.ts`              | a file input and an export link beside `#feedSubscribeForm`; reuse the import result message        |
| `test/textfeeds.test.ts` | `parseOpml` reads nested outlines and ignores outlines without `xmlUrl`; `toOpml` round-trips       |

## Out of scope

Podcast subscriptions (`src/podcasts.ts`) stay out; they are a separate list and can get their
own spec. Folders and categories are flattened on import and not written on export. No polling
happens at import time beyond what `subscribeFeed` already does.

## Acceptance checks

```bash
pnpm test                                                     # all pass, including the two new OPML tests
curl -s http://localhost:4747/api/feeds/opml | head -c 60     # <?xml version="1.0" encoding="UTF-8"?><opml version="2.0">
curl -s http://localhost:4747/api/feeds/opml | xmllint --noout -   # prints nothing
curl -s -X POST -H 'content-type: text/xml' --data-binary @some.opml \
  http://localhost:4747/api/feeds/import                      # {"added":N,"skipped":M,"failed":[]}
```

- [ ] Exporting, deleting every feed, then importing the export restores the same `feedUrl` list
- [ ] Importing the same file twice reports every feed as `skipped` the second time
- [ ] An OPML file with nested `<outline>` folders imports every leaf with an `xmlUrl`
- [ ] The existing JSON import body still works unchanged

## Notes

`attrFrom` and `tag` in `src/podcasts.ts` already parse attributes out of feed XML without a
DOM; use them rather than adding an XML dependency. Escape `&`, `<` and `"` in `toOpml`.
