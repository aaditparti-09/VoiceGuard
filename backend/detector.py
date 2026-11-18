from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

import numpy as np

from schemas import (
    AudioMetadata,
    DetectionClassification,
    DetectionStatus,
    ModelInfo,
)


@dataclass
class DetectionOutput:
    detection_status: DetectionStatus
    classification: DetectionClassification
    confidence: Optional[float]
    explanation: str
    model_info: ModelInfo


class VoiceDeepfakeDetector(ABC):
    """
    Common detection interface for VoiceGuard AI anti-spoofing models
    (e.g., AASIST graph attention or Wav2Vec2 fine-tuned classifiers).
    """

    @property
    @abstractmethod
    def info(self) -> ModelInfo:
        raise NotImplementedError

    @abstractmethod
    def detect(
        self,
        waveform_16k: np.ndarray,
        sample_rate: int,
        metadata: AudioMetadata,
    ) -> DetectionOutput:
        raise NotImplementedError


class UnconfiguredModelDetector(VoiceDeepfakeDetector):
    """
    Honest fallback detector used when no pretrained deepfake weights are loaded.
    Never fabricates random predictions or confidence scores.
    """

    @property
    def info(self) -> ModelInfo:
        return ModelInfo(name=None, architecture=None, ready=False)

    def detect(
        self,
        waveform_16k: np.ndarray,
        sample_rate: int,
        metadata: AudioMetadata,
    ) -> DetectionOutput:
        return DetectionOutput(
            detection_status="MODEL_NOT_CONFIGURED",
            classification="UNVERIFIED_NO_MODEL",
            confidence=None,
            explanation=(
                f"Audio preprocessing completed ({metadata.durationSeconds:.2f}s, converted from "
                f"{metadata.originalSampleRate} Hz / {metadata.originalChannels}ch to "
                f"{sample_rate} Hz mono, peak-normalized). No pretrained deepfake model "
                f"(such as AASIST or Wav2Vec2) is currently configured, so synthetic vs. "
                f"authentic classification cannot be claimed."
            ),
            model_info=self.info,
        )


def get_detector() -> VoiceDeepfakeDetector:
    """
    Factory resolving the active anti-spoofing detector backend.
    Extend here to instantiate AASISTDetector or Wav2Vec2AntiSpoofDetector
    when model weights and inference runtime are installed.
    """
    backend = os.getenv("VOICEGUARD_MODEL_BACKEND", "").strip().lower()
    if backend in {"aasist", "wav2vec2"}:
        # Placeholder hook for future pretrained model integration:
        # return AASISTDetector(...) or Wav2Vec2Detector(...)
        return UnconfiguredModelDetector()
    return UnconfiguredModelDetector()
