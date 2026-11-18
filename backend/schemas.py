from typing import List, Literal, Optional
from pydantic import BaseModel, Field


DetectionStatus = Literal["MODEL_NOT_CONFIGURED", "COMPLETED"]
DetectionClassification = Literal[
    "UNVERIFIED_NO_MODEL",
    "AUTHENTIC",
    "POTENTIALLY_SYNTHETIC",
]


class AudioMetadata(BaseModel):
    fileName: str
    mimeType: str
    fileSizeBytes: int
    originalSampleRate: int
    processedSampleRate: int = 16000
    originalChannels: int
    processedChannels: int = 1
    durationSeconds: float
    normalized: bool = True
    peakAmplitudeBeforeNorm: float
    rmsLevel: float
    sampleCount: int
    language: Optional[str] = None


class ModelInfo(BaseModel):
    name: Optional[str] = None
    architecture: Optional[str] = None
    ready: bool = False


class AnalyzeAudioResponse(BaseModel):
    detectionStatus: DetectionStatus
    classification: DetectionClassification
    confidence: Optional[float] = Field(
        default=None,
        description="Model confidence percentage (0-100), strictly null unless a real model ran.",
    )
    analysisTimestamp: str
    audioMetadata: AudioMetadata
    processingStatus: str
    explanation: str
    modelInfo: ModelInfo
    waveformPreview: List[float] = Field(default_factory=list)
