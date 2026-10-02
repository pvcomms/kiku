---
title: Prune a long subscription list, and choose light or dark
status: shipped
created: 2026-10-02
---

# 012 — Prune a long subscription list, and choose light or dark

## Why

At 220 feeds, 31 shows and 2 mailboxes the page stopped being usable for the one job the person
was about to do: decide what to keep. The Inbox drew all 2,000 items at once and could not be
narrowed. One news feed held 562 of them. 144 feeds had sent nothing since they were added, 7
were failing, and 4 titles were duplicated, but nothing on the page said which. Removing a
source took a browser `confirm()` per row.

The page also followed the system theme with no way to overrule it.

## What changes

- **Inbox.** Narrow by kind (writing, episodes, letters, each with its count), by words in the
  title or source, and by source: a source's name on any row narrows to that source. Fifty rows
  are drawn at a time. A narrowed view can be dismissed in one go: the button names the count,
  the first press arms it, the second does it. The count says when the inbox is at its cap and
  the oldest are falling off.
- **Sources.** One list with a tab per kind, a finder, and four orders: a to z, most waiting,
  longest quiet, failing first. Each row shows the feed's domain (so two feeds with one title
  can be told apart, and a feed with no title still has a name), how many of its items wait in
  the Inbox (pressing that narrows the Inbox to them), the date of its newest post, and its
  error if it is failing. Unsubscribing is two presses on the row, no dialog.
- **Theme.** A button in the header and on the read page: the system setting, then the other
  colour, then the system's own colour chosen explicitly, then back. Stored per browser, read in
  `<head>` before any style so a chosen theme never flashes the other, followed by other open
  tabs, crossfaded where the browser can.
- **Payloads.** `/api/inbox` leaves out each item's summary and `/api/sources` leaves out each
  source's `seen` ids; the page used neither. The inbox list went from 1,207,805 to 654,172 bytes.
- **Fix.** Row metadata was an inline span, so its ellipsis never applied and a long line widened
  the page sideways. It is a block now.

## Where

| File               | Change                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `src/ui.ts`        | theme tokens, button and script; inbox and sources toolbars, paging, two-press removal        |
| `src/textfeeds.ts` | `latest` on a feed; `removeManyFromInbox`; `INBOX_CAP` exported                               |
| `src/podcasts.ts`  | `latest` on a show; `latestOf`, shared with textfeeds.ts                                      |
| `src/server.ts`    | `POST /api/inbox/dismiss`; leaner `/api/inbox` and `/api/sources`; the cap passed to the page |

## Out of scope

Anything that chooses for the person. The orders sort by a fact the person picks; nothing is
hidden, ranked by default, or suggested for removal. Merging duplicate feeds, and an undo for an
unsubscribe (which would need the feed's `seen` set kept after removal), are not here.

## Acceptance checks

```bash
pnpm test                                                        # ℹ pass 81, ℹ fail 0
curl -s localhost:4747/api/inbox | grep -c '"summary"'           # 0
curl -s localhost:4747/api/sources | grep -c '"seen"'            # 0
curl -s -X POST localhost:4747/api/inbox/dismiss \
  -H 'content-type: application/json' -d '{"ids":[]}'           # {"error":"Nothing to dismiss."} 400
curl -s localhost:4747/ | grep -c 'id="theme"'                   # 1
```

- [x] All five ran on 2026-10-02 against the live instance with the output shown
- [x] After the first poll, 211 of 220 feeds and 31 of 31 shows carried a `latest` date
- [x] In the browser: the theme button cycled system, light, dark, system and survived a reload
- [x] In the browser: naming a source narrowed the inbox to its 562 items; one press on the bulk
      button armed it and it disarmed after four seconds with nothing dismissed
- [x] On a second instance with synthetic data (`KIKU_HOME`, `KIKU_PORT=4791`): bulk dismiss
      removed 120 and the source's waiting count fell to nothing; two presses unsubscribed a feed
      and took its 3 waiting items with it
- [x] At 375px wide there is no sideways scroll, and long source names end in an ellipsis
      instead of vanishing
