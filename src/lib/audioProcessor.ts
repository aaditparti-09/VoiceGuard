import type { ExtractedFeatures, FrequencyBand } from '../types/voiceguard';

export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.flac', '.aac'];

export interface ProcessedAudioResult {
  duration: number;
  extractedFeatures: ExtractedFeatures;
  waveformPreview: number[];
  spectrumPreview: number[];
  spectrogramMatrix: number[][];
}

export function validateAudioFile(file: File): string | null {
  if (file.size === 0) {
    return 'The selected file is empty (0 bytes).';
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `File exceeds the 25 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB provided).`;
  }
  const lowerName = file.name.toLowerCase();
  const hasSupportedExt = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasSupportedMime =
    file.type.startsWith('audio/') || file.type === 'video/webm' || file.type === 'application/ogg';

  if (!hasSupportedExt && !hasSupportedMime) {
    return 'Unsupported file format. Please upload MP3, WAV, OGG, M4A, WEBM, or FLAC audio.';
  }
  return null;
}

export function validateWavMp3File(file: File): string | null {
  if (file.size === 0) {
    return 'The selected file is empty (0 bytes).';
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `File exceeds the 25 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB provided).`;
  }
  const lowerName = file.name.toLowerCase();
  const hasValidExt = lowerName.endsWith('.wav') || lowerName.endsWith('.mp3');
  const validMimes = new Set([
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/mpeg',
    'audio/mp3',
  ]);
  const hasValidMime = !file.type || validMimes.has(file.type.toLowerCase());

  if (!hasValidExt || !hasValidMime) {
    return 'Invalid file type. Only WAV (.wav) and MP3 (.mp3) audio files are supported.';
  }
  return null;
}

// Radix-2 Cooley-Tukey FFT (in-place)
function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tmpRe = re[i];
      re[i] = re[j];
      re[j] = tmpRe;
      const tmpIm = im[i];
      im[i] = im[j];
      im[j] = tmpIm;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(angle);
    const wlenIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}

function getMonoSamples(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const numChannels = buffer.numberOfChannels;
  if (numChannels === 1) {
    return buffer.getChannelData(0);
  }
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] / numChannels;
    }
  }
  return mono;
}

export async function processAudioBlob(blob: Blob): Promise<ProcessedAudioResult> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const audioContext = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new Error('Audio stream is empty.');
    }

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch {
      throw new Error('Could not decode audio file. The file may be corrupted or use an unsupported codec.');
    }

    const duration = Number(audioBuffer.duration.toFixed(2));
    const sampleRate = audioBuffer.sampleRate;
    const samples = getMonoSamples(audioBuffer);
    const totalSamples = samples.length;

    if (totalSamples < 128 || duration <= 0.05) {
      throw new Error('Audio clip is too short for signal feature extraction (minimum 0.1s).');
    }

    // 1. Time-domain metrics: RMS Energy, Zero-Crossing Rate, Silence Ratio, Dynamic Range
    let sumSquares = 0;
    let zeroCrossings = 0;
    for (let i = 0; i < totalSamples; i++) {
      const s = samples[i];
      sumSquares += s * s;
      if (i > 0 && ((s >= 0 && samples[i - 1] < 0) || (s < 0 && samples[i - 1] >= 0))) {
        zeroCrossings++;
      }
    }
    const rmsEnergy = Number(Math.sqrt(sumSquares / totalSamples).toFixed(5));
    const zeroCrossingRate = Number((zeroCrossings / totalSamples).toFixed(5));

    // Waveform preview (48 buckets)
    const previewBuckets = 48;
    const bucketSize = Math.max(1, Math.floor(totalSamples / previewBuckets));
    const waveformPreview: number[] = [];
    for (let b = 0; b < previewBuckets; b++) {
      const start = b * bucketSize;
      const end = Math.min(totalSamples, start + bucketSize);
      let peak = 0;
      for (let i = start; i < end; i++) {
        const abs = Math.abs(samples[i]);
        if (abs > peak) peak = abs;
      }
      waveformPreview.push(Number(peak.toFixed(4)));
    }

    // Frame-level RMS for silence ratio & dynamic range
    const hopSamples = Math.max(256, Math.floor(sampleRate * 0.02));
    const frameRmsValues: number[] = [];
    let silentFrames = 0;
    for (let start = 0; start + hopSamples <= totalSamples; start += hopSamples) {
      let fSum = 0;
      for (let i = 0; i < hopSamples; i++) {
        const v = samples[start + i];
        fSum += v * v;
      }
      const fRms = Math.sqrt(fSum / hopSamples);
      frameRmsValues.push(fRms);
      if (fRms < 0.01) {
        silentFrames++;
      }
    }
    const silenceRatio =
      frameRmsValues.length > 0 ? Number((silentFrames / frameRmsValues.length).toFixed(4)) : 0;

    let dynamicRange = 20;
    if (frameRmsValues.length >= 4) {
      const sorted = [...frameRmsValues].sort((a, b) => a - b);
      const lowFloor = Math.max(1e-5, sorted[Math.floor(sorted.length * 0.1)]);
      const highPeak = Math.max(lowFloor * 1.1, sorted[Math.floor(sorted.length * 0.95)]);
      dynamicRange = Number((20 * Math.log10(highPeak / lowFloor)).toFixed(2));
    }

    // 2. Frequency-domain analysis via Radix-2 FFT (N = 1024)
    const fftSize = 1024;
    const halfFft = fftSize / 2;
    const numTimeFrames = Math.min(64, Math.max(8, Math.floor(totalSamples / fftSize)));
    const frameStep = Math.max(1, Math.floor((totalSamples - fftSize) / Math.max(1, numTimeFrames - 1)));

    const avgMagnitudes = new Float64Array(halfFft);
    const frameCentroids: number[] = [];
    const spectrogramMatrix: number[][] = [];
    const hannWindow = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }

    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    const binHz = sampleRate / fftSize;

    for (let frame = 0; frame < numTimeFrames; frame++) {
      const offset = Math.min(Math.max(0, totalSamples - fftSize), frame * frameStep);
      for (let i = 0; i < fftSize; i++) {
        re[i] = (samples[offset + i] || 0) * hannWindow[i];
        im[i] = 0;
      }
      fftRadix2(re, im);

      let frameMagSum = 0;
      let frameWeightedFreq = 0;
      const specBins = 32;
      const binsPerGroup = Math.max(1, Math.floor(halfFft / specBins));
      const specRow: number[] = [];

      for (let k = 0; k < halfFft; k++) {
        const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / halfFft;
        avgMagnitudes[k] += mag / numTimeFrames;
        frameMagSum += mag;
        frameWeightedFreq += mag * (k * binHz);
      }

      if (frameMagSum > 1e-8) {
        frameCentroids.push(frameWeightedFreq / frameMagSum);
      }

      for (let b = 0; b < specBins; b++) {
        let bandSum = 0;
        for (let j = 0; j < binsPerGroup; j++) {
          const idx = b * binsPerGroup + j;
          if (idx < halfFft) {
            const mag = Math.sqrt(re[idx] * re[idx] + im[idx] * im[idx]) / halfFft;
            bandSum += mag;
          }
        }
        const dbNorm = Math.max(0, Math.min(1, (20 * Math.log10(bandSum / binsPerGroup + 1e-6) + 90) / 70));
        specRow.push(Number(dbNorm.toFixed(3)));
      }
      spectrogramMatrix.push(specRow);
    }

    // Spectral centroid, bandwidth, rolloff, peak frequency
    let totalMag = 0;
    let weightedSum = 0;
    let peakBin = 1;
    let peakMag = 0;
    for (let k = 1; k < halfFft; k++) {
      const mag = avgMagnitudes[k];
      const freq = k * binHz;
      totalMag += mag;
      weightedSum += mag * freq;
      if (mag > peakMag) {
        peakMag = mag;
        peakBin = k;
      }
    }

    const spectralCentroid = totalMag > 1e-8 ? weightedSum / totalMag : 1000;
    let varianceSum = 0;
    let cumulative = 0;
    let spectralRolloff = sampleRate * 0.25;
    const rolloffThreshold = totalMag * 0.85;
    let rolloffFound = false;

    for (let k = 1; k < halfFft; k++) {
      const mag = avgMagnitudes[k];
      const freq = k * binHz;
      varianceSum += mag * Math.pow(freq - spectralCentroid, 2);
      cumulative += mag;
      if (!rolloffFound && cumulative >= rolloffThreshold) {
        spectralRolloff = freq;
        rolloffFound = true;
      }
    }

    const spectralBandwidth = totalMag > 1e-8 ? Math.sqrt(varianceSum / totalMag) : 500;
    const peakFrequency = peakBin * binHz;

    // Normalized centroid variance across frames (pitch/modulation proxy)
    let pitchVariance = 0.15;
    if (frameCentroids.length > 2) {
      const meanC = frameCentroids.reduce((a, b) => a + b, 0) / frameCentroids.length;
      const varC =
        frameCentroids.reduce((acc, c) => acc + Math.pow(c - meanC, 2), 0) / frameCentroids.length;
      pitchVariance = Number(Math.min(1, Math.sqrt(varC) / Math.max(100, meanC)).toFixed(4));
    }

    // 10 frequency bands for clear chart display
    const bandRanges = [
      { label: '0-300Hz', min: 0, max: 300 },
      { label: '300-600Hz', min: 300, max: 600 },
      { label: '600-1kHz', min: 600, max: 1000 },
      { label: '1-2kHz', min: 1000, max: 2000 },
      { label: '2-3kHz', min: 2000, max: 3000 },
      { label: '3-4kHz', min: 3000, max: 4000 },
      { label: '4-6kHz', min: 4000, max: 6000 },
      { label: '6-8kHz', min: 6000, max: 8000 },
      { label: '8-12kHz', min: 8000, max: 12000 },
      { label: '12kHz+', min: 12000, max: sampleRate / 2 },
    ];

    const rawBandEnergies = bandRanges.map((range) => {
      let sum = 0;
      let count = 0;
      for (let k = 1; k < halfFft; k++) {
        const freq = k * binHz;
        if (freq >= range.min && freq < range.max) {
          sum += avgMagnitudes[k];
          count++;
        }
      }
      return count > 0 ? sum / count : 0;
    });

    const maxBandEnergy = Math.max(1e-7, ...rawBandEnergies);
    const frequencyBands: FrequencyBand[] = bandRanges.map((range, idx) => ({
      band: range.label,
      energy: Number(((rawBandEnergies[idx] / maxBandEnergy) * 100).toFixed(1)),
    }));

    // 24-bin spectrum preview for compact storage
    const spectrumPreview: number[] = [];
    const previewSpecBins = 24;
    const binsPerPreview = Math.max(1, Math.floor(halfFft / previewSpecBins));
    let maxPrevMag = 1e-7;
    const rawPreviewMags: number[] = [];
    for (let b = 0; b < previewSpecBins; b++) {
      let sum = 0;
      for (let j = 0; j < binsPerPreview; j++) {
        const idx = b * binsPerPreview + j;
        if (idx < halfFft) sum += avgMagnitudes[idx];
      }
      const avg = sum / binsPerPreview;
      if (avg > maxPrevMag) maxPrevMag = avg;
      rawPreviewMags.push(avg);
    }
    for (const val of rawPreviewMags) {
      spectrumPreview.push(Number((val / maxPrevMag).toFixed(4)));
    }

    return {
      duration,
      waveformPreview,
      spectrumPreview,
      spectrogramMatrix,
      extractedFeatures: {
        rmsEnergy,
        zeroCrossingRate,
        spectralCentroid: Number(spectralCentroid.toFixed(1)),
        spectralBandwidth: Number(spectralBandwidth.toFixed(1)),
        spectralRolloff: Number(spectralRolloff.toFixed(1)),
        pitchVariance,
        silenceRatio,
        dynamicRange,
        sampleRate,
        peakFrequency: Number(peakFrequency.toFixed(1)),
        frequencyBands,
      },
    };
  } finally {
    await audioContext.close().catch(() => {});
  }
}
