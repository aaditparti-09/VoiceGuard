# VOICEGUARD AI — Python FastAPI Audio Processing Service

Modular audio preprocessing and anti-spoofing detection gateway designed for pretrained deepfake detectors (such as **AASIST** or **Wav2Vec2** anti-spoofing classifiers).

## Pipeline Steps (`POST /api/analyze-audio`)
1. **Validation**: Verifies `.wav` / `.mp3` extension, MIME type, non-empty payload, <= 25 MB limit, and container magic bytes (`RIFF/WAVE`, `ID3` / MPEG sync).
2. **Secure Temporary Handling**: Writes uploads inside an isolated `0o700` temporary directory (`SecureTempAudioFile`) and deletes all temporary files immediately in a `finally` block.
3. **Preprocessing (`librosa` + `soundfile`)**:
   - Extracts original sample rate, channel count, and duration
   - Converts multi-channel audio to mono (`librosa.to_mono`)
   - Resamples to `16,000 Hz` (`librosa.resample`)
   - Applies peak normalization
4. **Detector Interface (`detector.py`)**:
   - Exposes `VoiceDeepfakeDetector` abstract base class for plugging in AASIST or Wav2Vec2 models.
   - When no model is configured, returns `detectionStatus: "MODEL_NOT_CONFIGURED"` and `confidence: null` without fabricating predictions.

## Running Locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Then set `FASTAPI_AUDIO_SERVICE_URL="http://127.0.0.1:8000"` in your Node server environment so `server.ts` proxies `POST /api/analyze-audio` directly to FastAPI.
