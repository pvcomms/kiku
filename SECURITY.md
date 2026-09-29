# Security and privacy

kiku's claim is that what you read stays with you. This page says exactly what the software
reads, writes and sends, so you can check the claim instead of trusting it, and how to report a
hole in it.

## What it reads

- The links you paste. Each is fetched once, from your Mac, by `src/extract.ts`.
- The files you drop. They are read on your Mac by `pdftotext`, `markitdown` or `textutil`.
- The text you paste.
- The feeds and shows you subscribe to, fetched from your Mac every 30 minutes.
- The mailboxes you set up, over IMAP from your Mac every 30 minutes: headers of every message
  in the last thirty days, the full source of only those that carry a mailing-list header or
  come from a known newsletter platform. Nothing else in the mailbox is fetched, and nothing is
  ever written to it. Proton goes through the Bridge app on `127.0.0.1:1143`, whose certificate
  is self-signed and is accepted only for that loopback address.
- The output of `tailscale status` on your Mac, to learn your tailnet name if you have one.

## What it writes

Everything lives under `~/Kiku/`, or wherever `KIKU_HOME` points:

| File                       | What                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `audio/*.mp3`              | the readings                                                         |
| `text/*.txt`               | the cleaned paragraphs of each reading, one per line                 |
| `library.json`             | title, author, source, duration and voice of each reading            |
| `positions.json`           | where you stopped in each one                                        |
| `podcasts.json`            | show subscriptions and the episode ids already surfaced              |
| `textfeeds.json`           | text-feed subscriptions and the Inbox, all three kinds               |
| `accounts.json`            | mailboxes with their passwords, mode 0600, never sent back by the API|
| `mail.json`                | a UID cursor per mailbox folder and the message ids already taken    |
| `mail/*.html`              | each newsletter, cleaned: no scripts, styles, images or trackers     |
| `public-token`             | the secret for the public feed link, mode 0600                       |

Outside that folder: a WAV file in the system temp directory while a reading is being encoded,
deleted afterwards; the Kokoro weights, about 340 MB, in `~/.cache/huggingface/hub/`; and,
when the server runs under launchd, `~/Library/Logs/kiku.log`. The log records each request's
method, path, status and the first 70 characters of the user agent, apart from asset and library
polls, plus the progress of each reading. Paths include audio file names, which carry the
reading's title, so the log is as private as the library. The public feed's log lines mask the
token.

## What goes over the network

Outbound, from your Mac: the links you gave it, the feeds and shows you subscribed to, the
mailboxes you set up, and one download of the Kokoro model from Hugging Face
(`mlx-community/Kokoro-82M-bf16`) the first time it speaks, with the hub's telemetry switched
off. Nothing else. A publisher whose feed you poll sees a fetch from your address every 30
minutes, as it would from any reader; it does not learn that you read anything, because the
open-tracking pixel in a letter is dropped before the letter is stored and a click tracker is
reduced to its text. A mailbox provider sees what it always saw — your mail — so a provider
that cannot read it (Proton, or your own server) keeps the claim whole where Gmail does not. There is no cloud speech, no API key anywhere in the code, no telemetry,
no analytics and no error reporting. The page requests nothing from any other host: the fonts
are six `.woff2` files in `assets/fonts/` served by kiku itself. `src/ui.ts` and `src/server.ts`
are the places to verify this.

Podcast episodes play in your browser straight from the publisher's server, so the publisher
sees a request from your device, as it would from any podcast app.

Inbound: the page and its API listen on every interface on port 4747 (`KIKU_PORT`) with no
login. Anyone on your Wi-Fi can read your library, queue readings, delete them and manage
subscriptions. Your home network is the trust boundary. `bin/kiku-remote` widens it to your
tailnet with `tailscale serve`, still without a login; every device on your tailnet is trusted.

## The public feed

`bin/kiku-public` exists for players such as Pocket Casts that fetch feeds from their own
servers, so cannot reach your LAN or tailnet. It runs `tailscale funnel` in front of a second
listener that binds only `127.0.0.1:4748` (`KIKU_PUBLIC_PORT`) and answers only three routes:
`/p/<token>/feed.xml`, `/p/<token>/audio/<file>` and `/p/<token>/cover.png`. Enabling it means:

- Whoever has the link can list every reading's title, author and description and download
  every audio file. They cannot add, delete or subscribe to anything.
- The cloud player's operator sees the same, since it fetches the feed for you.
- The token is 18 random bytes, base64url, generated on first start into `~/Kiku/public-token`.
  Rotate it by deleting that file and restarting kiku. Turn the whole thing off with
  `kiku-public off`.

Anything that widens this surface is a security change, not a feature, and should be reviewed as
one.

## Reporting

Open an issue at github.com/pvcomms/kiku/issues without the content that triggered it: no
links, text or titles from your own library. If it needs to stay private, write to
hello@paramv.com. Fixes land on `master`; there are no maintained release branches.
