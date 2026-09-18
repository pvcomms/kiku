# Decisions

Append-only. Newest last. One entry per decision that would otherwise be re-litigated.

---

**2026-09 — Local speech, not an API.**
Kokoro-82M through MLX on Apple silicon, ~19× realtime on the M3 Ultra. A cloud TTS API would
be better-sounding and would mean every article a person reads passes through someone else's
logs. For a tool whose entire claim is that attention is the person's own, that trade is not
available.

---

**2026-09 — No build step.**
Node 25 strips types and runs the TypeScript directly. The cost is explicit `.ts` extensions
on imports and no typecheck; the gain is that the service starts instantly, the LaunchAgent
has nothing to compile, and there is no bundler to break in a year.

---

**2026-09 — The page is a string in `ui.ts`, with no framework.**
It loads instantly, ships no JavaScript framework, and requests nothing from a CDN. It will
get unwieldy as the page grows. That is a known and accepted cost, revisited only when the
page actually becomes unmaintainable rather than when it first looks unusual.

---

**2026-09 — Playback always from `<enclosure url>`, never `<link>`.**
Publishers point `<link>` at marketing pages, sometimes hardcoded to the same promo URL on
every item. Using it for playback silently broke episodes.

---

**2026-09-18 — Text feeds land in an Inbox, not a queue.**
220 subscribed feeds would make an autoplaying queue trivially easy and would recreate exactly
the always-on supply the tool exists against. New items wait in an Inbox; the person presses
listen or dismisses. The friction is the product. No autoplay, no next-up, no recommendation
will be added.

---

**2026-09 — The network boundary is the LAN, widened only to a tailnet.**
`bin/kiku-remote` runs `tailscale serve`, giving a real certificate and reachability on
cellular without exposing anything publicly. `tailscale funnel` is possible and deliberately
not used: a public URL would let anyone with the link queue work on the Studio.
`bin/kiku-public` exists only for players that crawl feeds from their own cloud, and hands out
a secret link for that narrow case.

---

**2026-09-19 — Doc set adopted.**
Repo joined the `cfap` constellation standard: `AGENTS.md`, `docs/ARCHITECTURE.md`, this
file, `docs/TEMPLATE.md`, `docs/features/`. `~/Code/cfap/bin/scan.py` reports on it.

---

**2026-09-19 — Brought to FOSS standard; the typecheck is on.**
`pnpm typecheck` runs `tsc --noEmit` with the `nodenext` and `erasableSyntaxOnly` settings that
match Node's type stripping, and runs before every `pnpm test` as `pretest`. The first run was
clean, so the "no typecheck" cost recorded above is paid off; `typescript` and `@types/node`
are the only new dependencies, both dev-only, taken because a green test run that ignored types
was the sharp edge every reader of this repo tripped on. The Python half is declared in
`pyproject.toml` and built by `bin/setup-python.sh`, pinned to the versions the reference
machine runs. The launchd plist became a template rendered by `bin/install-launchd`, so no home
directory is tracked. Personal network names left the docs for placeholders; the page prints
its own addresses. Screenshots come from a second instance seeded with synthetic entries, never
from the library someone listens to. `CONTRIBUTING.md`, `SECURITY.md` and `CHANGELOG.md` say
the rest.
