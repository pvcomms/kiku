#!/bin/sh
# setup-python.sh — build the Python environment the speech step runs in.
# src/tts.ts spawns `.venv/bin/python bin/tts.py`, so the environment is `.venv` at the repo
# root, no other path. Apple silicon only: mlx-audio is MLX. Needs uv on the PATH.
# The Kokoro weights are not installed here; mlx-audio downloads them from Hugging Face
# (mlx-community/Kokoro-82M-bf16) into ~/.cache/huggingface on the first reading.
set -eu
cd "$(dirname "$0")/.."
command -v uv >/dev/null 2>&1 || { echo "setup-python.sh: uv is not installed (brew install uv)" >&2; exit 1; }

[ -x .venv/bin/python ] || uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r pyproject.toml

# The spaCy pipeline comes from the wheel pinned in pyproject.toml; make sure it loads.
.venv/bin/python - <<'PY'
import importlib.metadata as m, spacy
for pkg in ("mlx-audio", "misaki", "soundfile", "numpy"):
    print(f"{pkg} {m.version(pkg)}")
spacy.load("en_core_web_sm")
print("en_core_web_sm", m.version("en_core_web_sm"))
print("ok: .venv is ready")
PY
