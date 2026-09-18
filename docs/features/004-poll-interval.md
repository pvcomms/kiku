---
title: A poll interval per text feed instead of one global 30 minutes
status: next
created: 2026-09-19
---

# 004 — A poll interval per text feed instead of one global 30 minutes

## Why

One `setInterval` in `src/server.ts` polls every text feed every 30 minutes, six at a time. A
monthly newsletter is fetched 1,440 times for each post it publishes, and a wire feed that
posts hourly cannot be checked more often. The person has no say, and the publishers carry the
load. The interval should be the person's choice, per feed.

On the thesis: the interval is set by hand and stays where it is set. Nothing here learns a
feed's rhythm or adjusts on its own; an adaptive schedule would be the tool deciding, and it is
out of scope by design.

## What changes

- Before: every feed, every 30 minutes, nothing stored about it.
- After: each feed carries `pollMinutes` (default 30, allowed 5 to 10080) in `textfeeds.json`.
  The poller ticks every 5 minutes and fetches only the feeds whose `lastPolled` is older than
  their `pollMinutes`. `PATCH /api/feeds/:id` with `{ "pollMinutes": 1440 }` changes it and
  returns the feed; a value outside the range is a 400. Each feed row in the page gets a small
  select: 30 min, 1 h, 6 h, daily, weekly. "Check now" (`POST /api/feeds/poll`) still polls
  every feed regardless of interval.

## Where

| File                     | Change                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `src/textfeeds.ts`       | `pollMinutes?: number` on `TextFeed`; `setPollMinutes(id, n)`; `isDue(feed, now): boolean` |
| `src/server.ts`          | the interval becomes a 5-minute tick that filters with `isDue`; `PATCH /api/feeds/:id`     |
| `src/ui.ts`              | the select in `feedRowHtml` and its change handler                                         |
| `test/textfeeds.test.ts` | `isDue` for a missing field, a never-polled feed and a feed polled a minute ago            |

## Out of scope

Adaptive or learned intervals. Backoff after errors (`lastError` exists; a separate spec can
use it). Intervals for podcast subscriptions, which have no poller and fetch on demand. Any
change to what happens to a new item once polled: it lands in the Inbox as today.

## Acceptance checks

```bash
pnpm test                                                                 # all pass, including the isDue tests
curl -s -X PATCH -H 'content-type: application/json' -d '{"pollMinutes":1440}' \
  http://localhost:4747/api/feeds/<id> | grep -o '"pollMinutes":1440'      # "pollMinutes":1440
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH -H 'content-type: application/json' \
  -d '{"pollMinutes":1}' http://localhost:4747/api/feeds/<id>              # 400
```

- [ ] A feed set to daily keeps its `lastPolled` unchanged across the next two 5-minute ticks
- [ ] A feed with no `pollMinutes` in an existing `textfeeds.json` behaves as 30 minutes
- [ ] "Check now" fetches every feed, including one set to weekly
- [ ] The select shows the stored value after a reload

## Notes

`applyPoll` already writes `lastPolled` on success and on error, so `isDue` needs no new
bookkeeping. Keep `mapLimit(…, 6)` for the feeds that are due.
