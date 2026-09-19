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

---

**2026-09-20 — kiku travels on the laptop; the SSD is a copy, never a dependency.**
The road machine is an M4 MacBook Pro. Everything a reading needs — Node, the MLX venv, the
Kokoro weights, one Ollama model, ffmpeg, poppler — is installed on its internal disk by
`bin/setup-road`, so a plane with no network and no SSD still reads. `bin/mirror-ssd` puts a
copy of all of it on `/Volumes/Go` so a wiped or borrowed Mac can be brought up offline; kiku
never looks for that volume. Hosting on Vercel was considered and is not possible rather than
merely unwanted: the speech step is MLX on Apple silicon and the analysis step is a local
model, neither of which exists in a serverless function.

---

**2026-09-20 — Proton Drive is an archive, not a sync channel.**
Finished readings are copied into the Proton Drive app's sync folder and nothing is ever read
back. Each machine keeps its own `library.json`; two machines exporting into the same folder
cannot collide because every file name starts with an id that is time plus randomness. A
two-way sync of the library would mean merging JSON written by two machines, which is the
kind of thing that silently loses readings. The copy is a separate step after the reading is
done, so a missing folder can never fail a reading.

---

**2026-09-20 — kiku is a stand, not only a reader.**
Submit now chooses _listen_ or _see_. The extraction, the library, the page, the LaunchAgent
and the Proton Drive copy are shared; only the last step differs — a voice or a diagram. A
second repo for the diagram would have duplicated all of that and imported `extract.ts` across
repositories that have no build step and no package boundary. The cost is that the opening
line of the README stopped being true and had to change: an input becomes something the
person owns, spoken or drawn. No queue, no autoplay and no recommendation apply to the drawn
half exactly as to the spoken one.

---

**2026-09-20 — The model that reads a document is local, as the voice is; it is asked for words and indices only.**
The analysis step runs on Ollama at 127.0.0.1, whichever installed model is largest and fits
in three quarters of memory, released the moment it answers. A cloud model would read better
and would mean every document a person draws passes through someone else's logs — the same
trade refused for speech, refused here for the same reason. The prompt asks for labels,
one-line descriptions and the names of the meetings, by index; colours, ids, sorted keys and
physics are the template's own and are filled in deterministically. One repair with the
problems named, then failure with them listed. A model that cannot draw a document after
being told what was wrong will not draw it on the third try either.

---

**2026-09-20 — The venn template is vendored and patched, not depended on.**
`assets/venn.html` is `interactive-venn-template/index.html` with two edits made by
`bin/vendor-venn.mjs`: the Google Fonts links become inline `@font-face` from `assets/fonts`,
and a four-line hook reads `window.KIKU_ARTIFACT` after the state is made. Each edit anchors
on text that must occur exactly once, so a template that drifts fails the vendor step rather
than producing a page that half works, and `assets/venn.source.txt` records which upstream
sha was vendored. Importing the sibling repo at run time was rejected: an artifact must be one
file that opens from `file://` on a plane, and the template's own feature to make zero
third-party requests was still `next` at the time.
