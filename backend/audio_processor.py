from __future__ import annotations

import os
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import librosa
import numpy as np
import soundfile as sf

from schemas import AudioMetadata

MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB
TARGET_SAMPLE_RATE = 16000
ALLOWED_EXTENSIONS = {".wav", ".mp3"}
ALLOWED_MIME_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "application/octet-stream",
}


class AudioValidationError(ValueError):
    """Raised when an uploaded audio file fails validation."""


class AudioProcessingError(RuntimeError):
    """Raised when audio decoding or signal preprocessing fails."""


@dataclass
class ProcessedAudio:
    waveform_16k_mono: np.ndarray
    metadata: AudioMetadata
    waveform_preview: List[float]


def _sanitize_filename(filename: str) -> str:
    base = Path(filename or "upload.wav").name
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "_", base)
    return cleaned[:180] or "upload.wav"


def _has_valid_magic_bytes(ext: str, header: bytes) -> bool:
    if len(header) < 4:
        return False
    if ext == ".wav":
        return header[:4] == b"RIFF" and len(header) >= 12 and header[8:12] == b"WAVE"
    if ext == ".mp3":
        if header[:3] == b"ID3":
            return True
        # MPEG audio frame sync: 11 set bits (0xFF followed by 0xE0..0xFF)
        return header[0] == 0xFF and (header[1] & 0xE0) == 0xE0
    return False


def validate_audio_upload(filename: str, content_type: Optional[str], data: bytes) -> str:
    if not data:
        raise AudioValidationError("Uploaded audio file is empty (0 bytes).")
    if len(data) > MAX_AUDIO_SIZE_BYTES:
        mb = len(data) / (1024 * 1024)
        raise AudioValidationError(f"Audio file exceeds the 25 MB size limit ({mb:.1f} MB provided).")

    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AudioValidationError("Unsupported audio format. Only WAV and MP3 files are accepted.")

    mime = (content_type or "").lower().split(";")[0].strip()
    if mime and mime not in ALLOWED_MIME_TYPES and not mime.startswith("audio/"):
        raise AudioValidationError(f"Invalid MIME type '{mime}'. Expected WAV or MP3 audio.")

    if not _has_valid_magic_bytes(ext, data[:16]):
        raise AudioValidationError(
            f"File header does not match a valid {ext.upper().lstrip('.')} audio container."
        )

    return ext


class SecureTempAudioFile:
    """Context manager creating an isolated temporary directory and deleting it on exit."""

    def __init__(self, filename: str, payload: bytes) -> None:
        self._safe_name = _sanitize_filename(filename)
        self._payload = payload
        self._temp_dir: Optional[str] = None
        self.file_path: Optional[Path] = None

    def __enter__(self) -> Path:
        self._temp_dir = tempfile.mkdtemp(prefix="voiceguard_audio_")
        os.chmod(self._temp_dir, 0o700)
        target = Path(self._temp_dir) / self._safe_name
        with open(target, "wb") as handle:
            handle.write(self._payload)
        os.chmod(target, 0o600)
        self.file_path = target
        return target

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._temp_dir and os.path.exists(self._temp_dir):
            shutil.rmtree(self._temp_dir, ignore_errors=True)
        self._temp_dir = None
        self.file_path = None


def _build_waveform_preview(samples: np.ndarray, bins: int = 48) -> List[float]:
    total = len(samples)
    if total == 0:
        return [0.0] * bins
    bucket_size = max(1, total // bins)
    preview: List[float] = []
    for idx in range(bins):
        start = idx * bucket_size
        end = min(total, start + bucket_size)
        if start >= total:
            preview.append(0.0)
        else:
            peak = float(np.max(np.abs(samples[start:end])))
            preview.append(round(peak, 4))
    return preview


def process_audio_bytes(
    filename: str,
    content_type: Optional[str],
    data: bytes,
    language: Optional[str] = None,
) -> ProcessedAudio:
    ext = validate_audio_upload(filename, content_type, data)
    safe_name = _sanitize_filename(filename)

    with SecureTempAudioFile(safe_name, data) as tmp_path:
        try:
            orig_channels = 1
            orig_sr = TARGET_SAMPLE_RATE

            try:
                info = sf.info(str(tmp_path))
                orig_sr = int(info.samplerate)
                orig_channels = int(info.channels)
            except Exception:
                # MP3 or container handled via librosa/audioread fallback
                pass

            audio_raw, loaded_sr = librosa.load(str(tmp_path), sr=None, mono=False)
            orig_sr = int(loaded_sr or orig_sr)

            if audio_raw.ndim > 1:
                orig_channels = int(audio_raw.shape[0])
                audio_mono = librosa.to_mono(audio_raw)
            else:
                audio_mono = audio_raw.astype(np.float32)

            if audio_mono.size < 160:
                raise AudioProcessingError("Audio stream is too short for processing (minimum 0.01s).")

            if orig_sr != TARGET_SAMPLE_RATE:
                audio_16k = librosa.resample(
                    audio_mono, orig_sr=orig_sr, target_sr=TARGET_SAMPLE_RATE
                ).astype(np.float32)
            else:
                audio_16k = audio_mono.astype(np.float32)

            peak_before = float(np.max(np.abs(audio_16k)))
            if peak_before > 1e-8:
                audio_norm = (audio_16k / peak_before).astype(np.float32)
            else:
                audio_norm = audio_16k

            duration_sec = round(float(audio_norm.size) / float(TARGET_SAMPLE_RATE), 3)
            rms_level = round(float(np.sqrt(np.mean(np.square(audio_norm)))), 5)

            metadata = AudioMetadata(
                fileName=safe_name,
                mimeType=content_type or ("audio/wav" if ext == ".wav" else "audio/mpeg"),
                fileSizeBytes=len(data),
                originalSampleRate=orig_sr,
                processedSampleRate=TARGET_SAMPLE_RATE,
                originalChannels=orig_channels,
                processedChannels=1,
                durationSeconds=duration_sec,
                normalized=True,
                peakAmplitudeBeforeNorm=round(peak_before, 5),
                rmsLevel=rms_level,
                sampleCount=int(audio_norm.size),
                language=language,
            )

            return ProcessedAudio(
                waveform_16k_mono=audio_norm,
                metadata=metadata,
                waveform_preview=_build_waveform_preview(audio_norm, bins=48),
            )
        except AudioValidationError:
            raise
        except AudioProcessingError:
            raise
        except Exception as exc:
            raise AudioProcessingError(f"Failed to decode or normalize audio stream: {exc}") from exc
