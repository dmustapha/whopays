#!/usr/bin/env python3
# Single-voice Gemini TTS (voice=Charon) -> WAV. One (engine,voice) pair for the whole render.
# Usage: GEMINI_API_KEY=... python3 scripts/gemini_tts.py "text" out.wav
import os, sys, json, base64, struct, urllib.request

KEY = os.environ.get("GEMINI_API_KEY", "").strip()
VOICE = os.environ.get("GEMINI_VOICE", "Charon")
MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")

def synth(text, out_path):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={KEY}"
    body = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}},
        },
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        resp = json.load(r)
    part = resp["candidates"][0]["content"]["parts"][0]
    data = part["inlineData"]["data"]
    mime = part["inlineData"].get("mimeType", "audio/L16;rate=24000")
    pcm = base64.b64decode(data)
    rate = 24000
    for tok in mime.split(";"):
        if "rate=" in tok:
            rate = int(tok.split("rate=")[1])
    # wrap raw PCM16 mono into WAV
    with open(out_path, "wb") as f:
        n = len(pcm)
        f.write(b"RIFF"); f.write(struct.pack("<I", 36 + n)); f.write(b"WAVE")
        f.write(b"fmt "); f.write(struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16))
        f.write(b"data"); f.write(struct.pack("<I", n)); f.write(pcm)
    return rate, n

if __name__ == "__main__":
    text, out = sys.argv[1], sys.argv[2]
    rate, n = synth(text, out)
    print(f"OK voice={VOICE} model={MODEL} rate={rate} bytes={n} -> {out}")
