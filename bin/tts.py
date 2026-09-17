"""Kiku TTS driver: paragraphs in (one per line), one WAV out. Prints PROGRESS lines to stdout."""
import argparse, sys, time
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

p = argparse.ArgumentParser()
p.add_argument("--in", dest="inp", required=True)
p.add_argument("--out", required=True)
p.add_argument("--voice", default="af_heart")
p.add_argument("--speed", type=float, default=1.0)
p.add_argument("--lang", default="a")
p.add_argument("--model", default="mlx-community/Kokoro-82M-bf16")
p.add_argument("--gap", type=float, default=0.45, help="silence between paragraphs, seconds")
a = p.parse_args()

paras = [l.strip() for l in open(a.inp, encoding="utf-8").read().split("\n") if l.strip()]
print(f"PARAS {len(paras)}", flush=True)
t0 = time.time()
model = load_model(a.model)
sr = 24000
chunks = []
for i, para in enumerate(paras):
    for r in model.generate(text=para, voice=a.voice, speed=a.speed, lang_code=a.lang, split_pattern=None, verbose=False):
        sr = r.sample_rate
        chunks.append(np.asarray(r.audio, dtype=np.float32))
    chunks.append(np.zeros(int(sr * a.gap), dtype=np.float32))
    done = sum(len(c) for c in chunks) / sr
    print(f"PROGRESS {i + 1} {len(paras)} {done:.1f}", flush=True)
audio = np.concatenate(chunks) if chunks else np.zeros(sr, dtype=np.float32)
sf.write(a.out, audio, sr)
print(f"DONE {len(audio) / sr:.1f} {time.time() - t0:.1f}", flush=True)
