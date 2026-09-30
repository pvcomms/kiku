---
title: Install by tap — a fully local kiku that someone else can download
status: building
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

The tap installs from a clean prefix and runs (from `~/personal/tools/apps/homebrew-tap`, with a
scratch tap whose `head` points at a local clone):

```bash
brew install --HEAD local/kikutest/kiku
kiku --doctor --quick                   # exits 1 before setup: "no speech environment at …/Application Support/Kiku/venv"
KIKU_VENV=$(mktemp -d)/venv kiku --setup   # builds the venv, caches the voice (already cached here), doctor ends "ready"
brew test local/kikutest/kiku
brew uninstall kiku && brew untap local/kikutest
```

## Not done here

Publishing. The tap is a local repo until the owner says to push `pvcomms/homebrew-tap`, and the
formula's stable `url` and `sha256` land with the first tag of `pvcomms/kiku`. Until then the
install is `brew install --HEAD`.
