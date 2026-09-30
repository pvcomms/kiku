---
title: Install by tap — a fully local kiku that someone else can download
status: shipped
created: 2026-09-30
---

# 011 — Install by tap

## Why

kiku is already local end to end: no keys, no cloud voice, one model download. What kept it from
being downloadable was the install, which assumed the repo was writable, the network was the
owner's, and every optional piece was present. [010](010-conduit.md) left the install as
`git clone` + `bin/setup-road` and ruled out a tap for the time being. The owner reversed that
on 2026-09-30.

## What changes

1. **The speech venv can live outside the repo.** `KIKU_VENV` (default `.venv` at the repo
   root) is read in `src/config.ts` by `src/tts.ts` and `src/preflight.ts`, and by
   `bin/setup-python.sh` and `bin/warm-voice`. Homebrew keeps code read-only, so the tap points
   it at `~/Library/Application Support/Kiku/venv`.
2. **The page answers on loopback by default.** `KIKU_HOST` unset means `127.0.0.1`. The
   addresses shown to the person are the ones that can reach the page: `localhost` on loopback,
   the LAN names and the tailnet address otherwise. `bin/install-launchd --lan` writes an agent
   with `KIKU_HOST=0.0.0.0`; an agent already installed keeps what its plist says.
3. **Drawing is optional.** With no Ollama, or no model that fits, the page renders
   `data-see="off"` and hides the form's _see_ choice and the inbox's _see_ button, and
   `/health` says what is off and the command that turns it on. Listening and reading are
   unchanged.
4. **A tap.** `~/personal/tools/apps/homebrew-tap` is the source of `pvcomms/homebrew-tap`.
   `Formula/kiku.rb` installs the code and its production `node_modules` under `libexec`, depends
   on `node`, `uv`, `ffmpeg` and `poppler`, and offers `brew services`. It does not build the
   Python environment, install `markitdown` or download the voice at install time; `kiku --setup`
   does, from the person's own shell, where the network and the disk are theirs to see.
   (`markitdown` is not a Homebrew formula. `bin/doctor` and `bin/setup-road` used to say
   `brew install markitdown`, which fails for anyone who has not made their own shim; both now
   use `uv tool install "markitdown[all]"`, through `bin/setup-python.sh`.)
5. **`bin/kiku` grows `--serve`, `--setup` and `--doctor`**, and the extracted `bin/warm-voice`
   is shared by `--setup` and `bin/setup-road`.

Refused, on purpose: bundling the venv (1.1 GB, and it carries absolute paths, so it cannot be
moved), bundling the voice, depending on Ollama, and a signed `.app` (needs a paid developer
account). `Kiku.app` stays a local build for the clone install; the launcher hard-codes the
`com.param.kiku` label and is not part of the tap.

## Acceptance

Run from the repo root unless a line says otherwise.

```bash
pnpm test                               # typecheck, then 77+ tests, all passing
node --test test/config.test.ts         # loopback default, KIKU_VENV, data-see on and off
```

A scratch instance answers on loopback only, and reports drawing off when Ollama is not there:

```bash
KIKU_PORT=4790 KIKU_PUBLIC_PORT=4791 KIKU_HOME=$(mktemp -d) KIKU_OLLAMA=http://127.0.0.1:9 node src/server.ts &
lsof -nP -iTCP:4790 -sTCP:LISTEN | awk 'NR>1{print $9}'      # 127.0.0.1:4790
curl -s http://127.0.0.1:4790/ | grep -o '<html[^>]*>'       # <html lang="en" data-see="off">
```

The formula is clean under Homebrew's own checks, run on a scratch tap whose `head` points at a
local clone:

```bash
brew tap-new local/kikutest --no-git    # then copy Formula/kiku.rb in, head → file:///…/kiku
brew style local/kikutest/kiku          # no offenses
brew audit --strict --formula local/kikutest/kiku    # silent, exit 0
brew install --HEAD --dry-run local/kikutest/kiku   # resolves; would install pnpm and 10 others, upgrade 45
```

Its steps run outside Homebrew, in a scratch directory (`git clone`, `pnpm install
--frozen-lockfile --prod --config.node-linker=hoisted`, copy to a `libexec`, the same wrapper):

```bash
HOME=$(mktemp -d) ./bin/kiku --doctor --quick    # exit 1: "no speech environment at …/Application Support/Kiku/venv"
KIKU_VENV=$S/venv ./bin/kiku --setup             # builds the venv, doctor ends "ready: everything a reading needs is here."
KIKU_VENV=$S/venv KIKU_PORT=4790 ./bin/kiku --serve    # 127.0.0.1:4790 only; /health ok; a pasted-text reading finishes, 0:11
```

Then on a clean Apple silicon runner (GitHub Actions, `macos-15`), from the tap's own workflow,
run 36718056695 on 2026-09-30, every step green:

```bash
brew tap pvcomms/tap "$GITHUB_WORKSPACE"
brew audit --strict --online pvcomms/tap/kiku
brew install --HEAD --verbose pvcomms/tap/kiku
brew test pvcomms/tap/kiku       # the formula's test: doctor exits 1 with "no speech environment", then serve answers /health
```

Not run: a `brew install` on the owner's own Mac. It would upgrade 45 outdated dependencies (node and
ffmpeg among them) and install Homebrew's `pnpm` next to the npm-global one already linked in
`/opt/homebrew/bin`, so `--ignore-dependencies` (which also drops node from the build PATH and
fails at the pnpm step) is not a shortcut either. Run `brew upgrade` and remove the npm `pnpm`
first, or install on another machine.

## Published

`pvcomms/kiku` (from `4fc48ba`) and `pvcomms/homebrew-tap` (public, `main`) on 2026-09-30. The
formula's stable `url` and `sha256` still wait for the first tag of `pvcomms/kiku`; until then the
install is `brew install --HEAD pvcomms/tap/kiku`.
