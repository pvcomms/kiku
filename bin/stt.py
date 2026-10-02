"""Kiku speech-to-text driver: one 16 kHz mono WAV in, its words out on stdout. Runs inside the speech venv."""
import argparse
from mlx_audio.stt.utils import load_model

p = argparse.ArgumentParser()
p.add_argument("--in", dest="inp", required=True)
p.add_argument("--model", default="mlx-community/parakeet-tdt-0.6b-v3")
a = p.parse_args()

model = load_model(a.model)
result = model.generate(a.inp)
print("TEXT " + " ".join((result.text or "").split()), flush=True)
