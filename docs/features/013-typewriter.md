---
title: One face, and a front page that is only the players and the articles
status: shipped
created: 2026-10-02
---

# 013 — One face, and a front page that is only the players and the articles

## Why

Three typefaces on one small page read as decoration, and the person said so. The page also
put the compose box, the sources and the phone instructions above and below the inbox on every
visit, when the daily visit is for two things: what arrived, and what is already made.

## What changes

- **One typeface.** IBM Plex Mono, 400 and 500, already in `assets/fonts/`. Nothing else is
  declared, so the serif and sans files stay on disk unused and no new file was fetched.
- **Two pages.** `/` is the inbox and the library with the player. `/sources` is the compose
  box, the sources and the phone feed address. A two-word nav in the header moves between
  them. With nothing subscribed, either is the setup page. The focus page hides the rest with
  `hidden` rather than leaving it out, so one script serves both and a link shared to the page
  (`?u=`) still has a form to submit through.
- **Rows.** A square to press (play, open or read), the title, and the verbs as words at the
  far edge: `see`, `read`, `×`. Where there is a pointer the verbs appear on hover; on touch
  they are always there. An article's title is a link to the article, opened in its own tab
  with no referrer. An episode's title plays it.
- **Gone.** The status pill, the footer line, the lede on the inbox page, the drop cap and the
  closing line on the read view. The inbox filter bar appears only once eight or more items
  are waiting, or while a filter is in use.

## Where

| File            | Change                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| `src/ui.ts`     | the face, the two views, the rows; `view` on `PageProps`; `readPage`    |
| `src/server.ts` | `GET /sources`; both routes render through one `renderPage`             |

## Acceptance checks

```bash
pnpm test                                                        # ℹ pass 82, ℹ fail 0
curl -s localhost:4747/sources -o /dev/null -w '%{http_code}\n'  # 200
curl -s localhost:4747/ | grep -o 'font-family: "[^"]*"' | sort -u   # font-family: "IBM Plex Mono"
curl -s localhost:4747/ | grep -c 'id="sources" hidden'          # 1
curl -s localhost:4747/sources | grep -c 'id="inboxSec" hidden'  # 1
```

- [x] All five ran on 2026-10-02 against the live instance with the output shown
- [x] In the browser, light and dark, desktop and 375px: `/` shows the inbox and the library
      only; `/sources` shows the compose box, the sources and the phone section
- [x] An article title opens the article in a new tab and does not start a reading
