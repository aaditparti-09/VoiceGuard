from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from audio_processor import (
    AudioProcessingError,
    AudioValidationError,
    TARGET_SAMPLE_RATE,
    process_audio_bytes,
)
from detector import get_detector
from schemas import AnalyzeAudioResponse

app = FastAPI(
    title="VOICEGUARD AI Audio Processing Service",
    description="Modular audio preprocessing and anti-spoofing detection gateway",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    detector = get_detector()
    return {
        "status": "ok",
        "service": "voiceguard-fastapi-audio",
        "modelConfigured": detector.info.ready,
        "modelInfo": detector.info.model_dump(),
        "targetSampleRate": TARGET_SAMPLE_RATE,
    }


@app.post("/api/analyze-audio", response_model=AnalyzeAudioResponse)
async def analyze_audio(
    audio: UploadFile = File(..., description="WAV or MP3 audio recording"),
    language: Optional[str] = Form(default=None),
):
    try:
        payload = await audio.read()
        processed = process_audio_bytes(
            filename=audio.filename or "upload.wav",
            content_type=audio.content_type,
            data=payload,
            language=language,
        )
    except AudioValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AudioProcessingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        await audio.close()

    detector = get_detector()
    result = detector.detect(
        waveform_16k=processed.waveform_16k_mono,
        sample_rate=TARGET_SAMPLE_RATE,
        metadata=processed.metadata,
    )

    return AnalyzeAudioResponse(
        detectionStatus=result.detection_status,
        classification=result.classification,
        confidence=result.confidence,
        analysisTimestamp=datetime.now(timezone.utc).isoformat(),
        audioMetadata=processed.metadata,
        processingStatus="PROCESSED_MONO_16KHZ_NORMALIZED",
        explanation=result.explanation,
        modelInfo=result.model_info,
        waveformPreview=processed.waveform_preview,
    )
