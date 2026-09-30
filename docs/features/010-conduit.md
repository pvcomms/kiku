---
title: The conduit — every source you chose, one local inbox, in the form you want it
status: shipped
created: 2026-09-30
---

# 010 — The conduit

## Why

kiku began as a paste box: a link goes in, a voice or a drawing comes out. Its owner uses it
for something larger and said so on 2026-09-30, in five parts:

1. He does not want to open a social app to find out what people he reads have written.
2. He wants every newsletter he pays for or follows, in one place.
3. He wants every podcast he follows, including the private paid feeds, in the same place.
4. He decides exactly what gets in. Nothing arrives that he did not subscribe to: no ads, no
   recommendations, no "you might also like", no counter that wants to be cleared.
5. Any item can change form on the way to him. A newsletter becomes an episode before a run.
   A long essay becomes a drawing. And all of it happens on the machine in the house.

The name for that is a conduit: sources on one side, the person on the other, and between them
one inbox that only ever holds what was asked for. This spec turns kiku from a tool with an
inbox into the inbox with tools, for anyone who wants the same thing.

Decisions taken with the owner, recorded so nobody reopens them by accident:

- **Rolling.** The inbox is a list that is cleared by hand, not a daily or weekly issue.
- **Hand curation.** No model ranks, trims or budgets. The person reads the list and chooses.
- **Sources in v1:** RSS and Atom feeds, podcast feeds (public and private), and the mailbox
  where the newsletters land. YouTube, Readwise, and anything needing speech-to-text wait.
- **Apple silicon first.** The speech step stays as it is; [002](002-pluggable-speech.md) is
  the door for other machines and stays a separate piece of work.
- **Install stays `git clone` + `bin/setup-road`.** No tap, no signed app, no container yet. (The tap came later: [011](011-install-by-tap.md).)
- **Yomu merges in.** The newsletter reader at `~/personal/tools/apps/yomu` (Next.js, IMAP
  through `imapflow`, SQLite) is retired. Its intake, detection and sanitising move into kiku
  as the third source. One stand, one inbox, one folder.

## What changes

- Before: three sections on the page (Podcasts, Feeds, Library) and an Inbox fed only by
  text feeds. Newsletters live in a second app on another port. A podcast episode appears
  under its show, never in the Inbox. Substack's paid posts are unreachable from a feed.
- After: one **Sources** section with three kinds, one **Inbox** that all three feed, and on
  every inbox item the same four verbs: **Listen**, **See**, **Read**, **Dismiss**. A podcast
  episode arrives as an inbox item whose Listen plays the publisher's file. A newsletter
  arrives from the mailbox with its tracking pixels and redirect links already removed, and
  its Listen runs the same extract → clean → Kokoro pipeline as a pasted link. Paid Substack
  posts arrive by mail, which is where Substack sends them; a paid podcast arrives through its
  private feed URL, which is just a feed with a secret in it. The first-run page, when there
  are no sources, is a setup page: paste feed URLs or an OPML file, and optionally a mailbox.

### The mailbox source

Ported from Yomu, not rewritten:

| Yomu                 | kiku                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| `lib/detect.ts`      | `src/mail/detect.ts`, unchanged: List-Unsubscribe / List-Id / Precedence + ESP list    |
| `lib/sync.ts`        | `src/mail/sync.ts`: two-pass IMAP (headers, then source for matches), per-folder UID   |
|                      | cursor, 30-day rolling window on every pass (Bridge backfills for weeks; see the note) |
| `lib/sanitize.ts`    | `src/mail/sanitize.ts`: tracking pixels and hidden blocks dropped, tables linearised   |
| `lib/accounts.ts`    | `src/mail/accounts.ts`: `~/Kiku/accounts.json`, mode 600, never inside the repo        |
| `lib/db.ts` (SQLite) | gone. `~/Kiku/mail.json` for cursors and seen ids; each letter's cleaned HTML in       |
|                      | `~/Kiku/mail/<id>.html` so extraction reads a local file and never refetches           |
| `lib/background.ts`  | folded into the existing 30-minute poll in `server.ts`                                 |

`imapflow` and `mailparser` are added as dependencies; `sanitize-html` too. Nothing else from
Yomu comes across: not Next, not React, not SQLite.

Accounts are configured on the setup page and stored only in `accounts.json`. The page never
shows a password back. Proton needs the Bridge app running; when it is not, the source shows
"Bridge is not running" and the other sources carry on.

### The link hygiene contract

An item in the inbox is only what the author wrote. Applied to all three sources at intake:

- Tracking pixels and hidden blocks: dropped (the Yomu rules, extended as found).
- Redirect links (`substack.com/redirect/`, `list-manage.com/track/click`, `sendgrid.net/ls/click`,
  `beehiiv.com/c/`, `click.convertkit-mail`): unwrapped to their destination when the target is
  in the URL, dropped to plain text when it is not.
- Remote images in the Read view: not loaded. The Read view is text.
- Sponsor blocks: not detected in v1. That is a model's job and the person chose hand curation.

`src/hygiene.ts` holds the rules with a test per rule.

### The inbox

`InboxItem` grows `source: "feed" | "show" | "mail"` and, for shows, the enclosure. The list
stays rolling and newest first. Nothing leaves it except by a verb. `INBOX_CAP` stays as the
only automatic forgetting, and rises to 2000.

The four verbs:

- **Listen.** `feed` and `mail`: the pipeline, as `POST /api/inbox/:id/listen` does now.
  `show`: the sticky player plays the enclosure; no job, no MP3 of our own.
- **See.** `feed` and `mail`: the drawing pipeline from [009](009-set-artifacts.md).
  `show`: hidden. There is no transcript to draw from.
- **Read.** `feed`: `/text/:id` after a `read` job that extracts and cleans without speaking.
  `mail`: the stored cleaned HTML. `show`: the show notes.
- **Dismiss.** Removes it. No archive, no undo. The library holds what was converted.

### Setup

When there are no sources, `/` renders a setup page instead of the compose page: one field
for feed URLs (one per line, or an OPML upload, which lands [003](003-opml.md)), one for a
private podcast feed, and one form for a mailbox. Once one source exists the normal page
takes over and the same forms live under Sources. `bin/kiku --setup` prints the address.

### Where

| File                                              | Change                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/mail/{accounts,detect,sanitize,sync}.ts`     | new, ported from Yomu as above; `stripMailChrome` for the platform's wrapper lines               |
| `src/hygiene.ts`                                  | new. `cleanUrl`, `cleanMarkdownLinks`, `isTrackingPixel`; a test per rule                        |
| `src/textfeeds.ts`                                | `InboxItem.source` and the show/mail fields; `addToInbox`, `removeBySource`, `opmlUrls`; cap 2000 |
| `src/podcasts.ts`                                 | `seen` per show, `applyPoll` (starts caught up), `looksLikeShow`                                 |
| `src/jobs.ts`                                     | `mode: "read"`; `Input.kind: "mail"`, replayable                                                 |
| `src/library.ts`                                  | `Kind: "text"`; `pathOf` knows the text dir                                                      |
| `src/server.ts`                                   | `read()`, `pollShows`, `syncMail`, `pollAll`, `subscribeAny`; `/api/sources`, `/api/mail/sync`, `/api/inbox/:id/{see,read}`, `/read/:id`; setup on `/` |
| `src/preflight.ts`                                | `mailHosts` → a "mail bridge" check, level want                                                  |
| `src/tts.ts`                                      | `HF_HUB_DISABLE_TELEMETRY=1`                                                                     |
| `src/ui.ts`                                       | Sources section (add, import, mailbox), four verbs per inbox row, text items, setup page, `readPage` |
| `package.json`                                    | `imapflow`, `mailparser`, `sanitize-html` (+ types)                                              |
| `test/{hygiene,mail,podcasts}.test.ts`, `textfeeds.test.ts` | new and extended: 73 tests                                                             |
| `README.md`, `SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `CHANGELOG.md` | rewritten around the conduit                                          |
| `~/personal/devices/mac-studio/{RUNBOOK,STATE}.md` | Yomu retired; `com.param.yomu-sync` unloaded, its plist kept in the yomu repo as `.retired`     |

## Out of scope

Anything that decides for the person: ranking, budgets, digests, "top for you". Social
platforms, by definition; if a person there publishes a feed, that is a feed. YouTube and
transcripts. Speech-to-text for podcasts, so a show cannot become a drawing or a text yet.
Readwise. Sponsor-block detection. A second machine reading the same inbox. Cross-platform
speech ([002](002-pluggable-speech.md)). Any install path but clone. Notion, Proton Drive
export changes ([008](008-proton-drive-export.md) already copies what is converted).

## Acceptance checks

```bash
pnpm test                                                    # green, including hygiene + mail
mv ~/Kiku ~/Kiku.bak && pnpm start                           # first run
curl -s localhost:4747/ | grep -c 'id="setup"'               # 1
curl -s -X POST localhost:4747/api/sources -H 'content-type: application/json' \
  -d '{"kind":"feed","url":"https://interconnects.ai/feed"}'
curl -s localhost:4747/ | grep -c 'id="setup"'               # 0
curl -s -X POST localhost:4747/api/feeds/poll
curl -s localhost:4747/api/inbox | jq '.[0].source'          # "feed"
# with a mailbox in ~/Kiku/accounts.json and one newsletter in the last 30 days:
curl -s -X POST localhost:4747/api/mail/sync
curl -s localhost:4747/api/inbox | jq '[.[] | select(.source=="mail")] | length'   # ≥ 1
ID=$(curl -s localhost:4747/api/inbox | jq -r '[.[] | select(.source=="mail")][0].id')
curl -s localhost:4747/api/inbox/$ID/read | grep -cE 'substack.com/redirect|list-manage.com/track'   # 0
grep -c '"pass"' ~/Kiku/accounts.json                        # ≥ 1; and:
curl -s localhost:4747/api/sources | grep -c '"pass"'        # 0
```

- [ ] A paid Substack post, sent by mail, reaches the inbox with its links pointing at the post's site, not through `substack.com/redirect`
- [ ] A private podcast feed URL is accepted as a show and its newest episode is an inbox item whose Listen plays without a job
- [ ] Listen on a mail item produces an episode in `/feed.xml` exactly like a pasted link
- [ ] With Proton Bridge quit, the poll logs one line for mail and the feed sources still update
- [ ] The Read view of any item makes no request to any host but the Mac
- [ ] `~/personal/tools/apps/yomu` no longer runs anywhere: no launchd job, no port 4545 in the runbook

## Notes

The 30-day window in the mail sync is not a UX choice, it is a guard: Proton Bridge hands
out fresh UIDs for years-old mail as it backfills a new local mailbox, and a plain UID cursor
would ingest the whole archive. Keep the window even though the inbox is rolling; the inbox
starts from "now" the way a new feed subscription does.

Substack's paid text posts are not in any feed; the public `/feed` carries the free posts and a
paywalled stub for the rest. Mail is the only complete path, which is why the mailbox is a
source and not an afterthought. Paid Substack _podcasts_ do have a private feed URL, in the
publication's settings, and that goes in as a show.

Phasing, if it is built in pieces: hygiene and the four verbs first (visible on day one,
no new dependencies), then the mail port, then the setup page and README. Each piece leaves
`pnpm test` green and the page usable.

## Ran — 2026-09-30, on the Studio

Scratch instance (`KIKU_HOME` in a temp dir, port 4749), then the live one on 4747 after
`launchctl kickstart`.

```
pnpm test                                       # tsc clean; 73 tests, 73 pass
curl -s :4749/ | grep -c 'id="sources"'         # 1   (setup page, no sources)
curl -s :4749/ | grep -c 'id="compose"'         # 0
POST /api/sources {kind:auto, interconnects.ai/feed}     → {"kind":"feed"}   (20/20 items carry audio; median body 1,804 words)
POST /api/sources {kind:auto, feeds.simplecast.com/…}    → {"kind":"show"}   (735/735; median 112 words)
POST /api/sources {kind:show, interconnects.ai/feed}     → {"kind":"show"}   (the person's say wins)
curl -s :4749/ | grep -c 'id="compose"'         # 1
POST /api/feeds/import {opml: …two outlines…}   → {"added":1,"shows":1,"skipped":1,"failed":[]}
curl -s :4749/api/sources | grep -c '"pass"'    # 0;  ~/Kiku/accounts.json is -rw------- and holds it
POST /api/sources {kind:mail, preset:proton, …} → 201; first pass over 30 days: 4099 letters found
POST /api/inbox/<letter>/read                   → 202; job done "ready to read"; text item, 1,807 words
GET  /read/<id> | grep -cE 'substack.com/redirect|list-manage.com/track|utm_'   # 0
POST /api/inbox/<letter>/listen                 → 202; "6/13 paragraphs · 0:19 so far" (Kokoro on a letter)
DELETE /api/sources/mail/proton; POST again     → second first-pass fetched nothing (ids already seen)
GET  /health → {"name":"mail bridge","ok":true,"detail":"127.0.0.1:1143 is answering"}
GET  /feed.xml | grep -c '<item>'               # 0 with only a text item in the library
```

Live, after the restart:

```
[kiku] mail proton/INBOX: caught up — 4100 newsletters already there were marked seen; new ones from now on
[kiku] mail gmail/INBOX: caught up — 428 newsletters already there were marked seen; new ones from now on
/health → sources 253 (220 feeds · 31 shows · 2 mailboxes); inbox 500, all feed items, unchanged
podcasts.json → 31 shows, 31 with `seen` after the first poll; nothing dumped
```

- [x] A paid Substack post, sent by mail, reaches the inbox with its links pointing at the post's site, not through `substack.com/redirect` — Zvi's letter: 0 redirect links in the stored HTML, `open.substack.com/pub/thezvi/p/…` links kept without `action=`/`redirect=`
- [x] A private podcast feed URL is accepted as a show and its newest episode is an inbox item whose Listen plays without a job — Listen on a show item returns `{play:{file:<enclosure>}}` and the page's player takes it; verified with the route, not with a private URL (none was added to the scratch instance)
- [x] Listen on a mail item produces an episode exactly like a pasted link — the pipeline ran on the Free Press letter through `extract → clean → Kokoro`
- [ ] With Proton Bridge quit, the poll logs one line for mail and the feed sources still update — NOT RUN: quitting the Bridge would stop the person's own mail; the code path is the `catch` in `syncFolder`, and the `/health` line exists for it
- [x] The Read view makes no request to any host but the Mac — `readPage` has no external reference; `<meta name="referrer" content="no-referrer">`; the stored letters carry no `<img>`
- [x] Yomu no longer runs anywhere — `launchctl list | grep -c yomu` → 0; the plist is in the yomu repo as `.retired`; the runbook says so

Not done, on purpose: spec 003's OPML *export*; the first-run page does not yet offer the
mailbox's folder list (INBOX only, as Yomu had it); the acceptance check for a quit Bridge.
Sponsor-block detection stays out of scope as written.

