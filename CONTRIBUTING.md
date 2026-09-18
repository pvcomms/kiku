# Contributing

kiku is one person's reading machine, published so that anyone can run their own and so that a
coding agent can build it out one feature spec at a time. Small, specified changes are welcome.
This page is the whole process.

## Run it

Prerequisites and the first run are in the README. In short:

```bash
pnpm install
bin/setup-python.sh        # .venv for the speech step; Apple silicon only
pnpm dev                   # http://localhost:4747, restarts when a file changes
```

To run a second instance beside one you listen to, give it another home and other ports:
`KIKU_HOME=$(mktemp -d) KIKU_PORT=4749 KIKU_PUBLIC_PORT=4750 pnpm dev`. Never test against
the real library.

## Prove it

```bash
pnpm test        # tsc --noEmit first, then node --test over test/**/*.test.ts: 24 tests today
pnpm typecheck   # the typecheck alone
```

Node strips the types and runs the TypeScript directly, so there is no build and imports carry
explicit `.ts` extensions. A change to `src/clean.ts` needs listening to, not only tests:
Kokoro reads whatever the cleaner leaves behind, and a stray marker is audible.

## How work is specified

Every piece of work is a feature spec in `docs/features/`, one file each, `NNN-slug.md`,
numbered in creation order and never renumbered. `001-typecheck.md` is the shape. The
frontmatter carries a `status`:

| status     | meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `draft`    | written down, not thought through, not ready to hand to anyone |
| `next`     | specified well enough that someone could start now             |
| `building` | someone is on it                                               |
| `shipped`  | the acceptance checks were run and passed; output in the spec  |
| `parked`   | deliberately not doing this; the reason is in the body         |

Acceptance checks are commands with expected output, never adjectives. A bug becomes a spec
before it becomes a fix. Pick a `next` spec, set it to `building`, and open a pull request that
cites it. Read `AGENTS.md` and `docs/ARCHITECTURE.md` first; together they are shorter than
this repo's tests and they are the map.

Three things are declined however well they are built: a queue, autoplay or anything else that
fills the slot after the chosen item; a recommendation of any kind; a cloud speech backend,
even behind a flag. The refusals are the product.

## Privacy rules

Nothing leaves the machine. A feature that needs the network fetches the thing the person asked
for and nothing else, and its spec names the host. No fonts, scripts or images from a CDN. No
analytics, no error reporting to anyone. A new dependency needs a written reason in
`docs/DECISIONS.md`.

Nothing personal enters the repo: no home-directory paths, hostnames, LAN addresses, tailnet
names or email addresses, and no titles from a real library in tests, fixtures or screenshots.
Screenshots come from a second instance seeded with synthetic entries (`bin/shot.mjs`). Before
you push, grep for your own machine:

```bash
git grep -niE "$HOME|$(hostname -s)"     # prints nothing
```

## Commits

Small. The subject says what changed and why it mattered, in one line, for example
`launchd: a template plus an installer, so no home directory is tracked`. No conventional-commit
prefixes. If an agent wrote the change, its `Co-Authored-By` line says so. Docs and commit
messages are plain prose: no emoji, no summary paragraph that restates the diff.
