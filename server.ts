import express from 'express';
import dotenv from 'dotenv';
import { execFile } from 'child_process';
import fs from 'fs';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

dotenv.config();

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024;
const TARGET_SAMPLE_RATE = 16000;

interface FrequencyBand {
  band: string;
  energy: number;
}

interface ExtractedFeaturesPayload {
  rmsEnergy: number;
  zeroCrossingRate: number;
  spectralCentroid: number;
  spectralBandwidth: number;
  spectralRolloff: number;
  pitchVariance?: number;
  silenceRatio?: number;
  dynamicRange?: number;
  sampleRate: number;
  peakFrequency: number;
  frequencyBands?: FrequencyBand[];
}

interface AnalyzeVoiceRequestBody {
  fileName: string;
  fileType: string;
  fileSize: number;
  duration: number;
  sourceType: 'upload' | 'live_recording';
  extractedFeatures: ExtractedFeaturesPayload;
  audioBase64?: string;
}

type RiskClassification =
  | 'Authentic Voice'
  | 'Suspicious Voice'
  | 'Potential AI-Generated Voice'
  | 'High-Risk Voice';

type RiskLevel = 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Critical Risk';

interface InferenceResult {
  classification: RiskClassification;
  riskLevel: RiskLevel;
  riskScore: number;
  authenticityScore: number;
  confidence: number | null;
  analysisMode: 'experimental_signal_analysis' | 'external_model_inference';
  modelStatus: string;
  explanation: string;
  recommendations: string[];
  signalIndicators: Array<{
    label: string;
    finding: string;
    severity: 'normal' | 'caution' | 'elevated';
  }>;
}

interface AudioProcessingMetadata {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  originalSampleRate: number;
  processedSampleRate: number;
  originalChannels: number;
  processedChannels: number;
  durationSeconds: number;
  normalized: boolean;
  peakAmplitudeBeforeNorm: number;
  rmsLevel: number;
  sampleCount: number;
  language?: string | null;
}

interface AnalyzeAudioResponsePayload {
  detectionStatus: 'MODEL_NOT_CONFIGURED' | 'COMPLETED';
  classification: 'UNVERIFIED_NO_MODEL' | 'AUTHENTIC' | 'POTENTIALLY_SYNTHETIC';
  confidence: number | null;
  analysisTimestamp: string;
  audioMetadata: AudioProcessingMetadata;
  processingStatus: string;
  explanation: string;
  modelInfo: {
    name: string | null;
    architecture: string | null;
    ready: boolean;
  };
  waveformPreview: number[];
  serviceEngine: 'fastapi-librosa-pipeline' | 'node-ffmpeg-pipeline';
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function sanitizeAudioFilename(originalName: string): string {
  const base = path.basename(originalName || 'upload.wav');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  return cleaned || 'upload.wav';
}

function validateWavOrMp3Buffer(
  fileName: string,
  mimeType: string,
  buffer: Buffer
): { ext: '.wav' | '.mp3'; safeName: string } {
  if (!buffer || buffer.length === 0) {
    throw new Error('VALIDATION:Uploaded audio file is empty (0 bytes).');
  }
  if (buffer.length > MAX_AUDIO_UPLOAD_BYTES) {
    throw new Error(
      `VALIDATION:Audio file exceeds 25 MB limit (${(buffer.length / (1024 * 1024)).toFixed(1)} MB provided).`
    );
  }

  const safeName = sanitizeAudioFilename(fileName);
  const ext = path.extname(safeName).toLowerCase();
  if (ext !== '.wav' && ext !== '.mp3') {
    throw new Error('VALIDATION:Unsupported file format. Only WAV and MP3 audio files are supported.');
  }

  const normalizedMime = (mimeType || '').toLowerCase().split(';')[0].trim();
  const allowedMimes = new Set([
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/mpeg',
    'audio/mp3',
    'application/octet-stream',
  ]);
  if (normalizedMime && !allowedMimes.has(normalizedMime) && !normalizedMime.startsWith('audio/')) {
    throw new Error(`VALIDATION:Invalid MIME type '${normalizedMime}'. Expected WAV or MP3 audio.`);
  }

  if (buffer.length < 12) {
    throw new Error('VALIDATION:Audio file header is too short to be valid WAV or MP3.');
  }

  if (ext === '.wav') {
    const isRiffWave =
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WAVE';
    if (!isRiffWave) {
      throw new Error('VALIDATION:File header does not match a valid WAV (RIFF/WAVE) container.');
    }
  } else {
    const isId3 = buffer.subarray(0, 3).toString('ascii') === 'ID3';
    const isMpegSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    if (!isId3 && !isMpegSync) {
      throw new Error('VALIDATION:File header does not match a valid MP3 (ID3/MPEG frame) stream.');
    }
  }

  return { ext, safeName };
}

function buildWaveformPreview(samples: Float32Array, bins = 48): number[] {
  const total = samples.length;
  if (total === 0) return new Array(bins).fill(0);
  const bucketSize = Math.max(1, Math.floor(total / bins));
  const out: number[] = [];
  for (let b = 0; b < bins; b++) {
    const start = b * bucketSize;
    const end = Math.min(total, start + bucketSize);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
    out.push(Number(peak.toFixed(4)));
  }
  return out;
}

async function processAudioWithTempHandling(params: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  language: string | null;
}): Promise<{
  normalizedPcm: Float32Array;
  metadata: AudioProcessingMetadata;
  waveformPreview: number[];
}> {
  const { ext, safeName } = validateWavOrMp3Buffer(params.fileName, params.mimeType, params.buffer);
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vg-audio-'));
  await fs.promises.chmod(tempDir, 0o700);

  const inputPath = path.join(tempDir, `input${ext}`);
  const pcmOutPath = path.join(tempDir, 'mono_16k.f32');

  try {
    await fs.promises.writeFile(inputPath, params.buffer, { mode: 0o600 });

    // 1. Extract original sample rate, channels, and duration via ffprobe
    let originalSampleRate = TARGET_SAMPLE_RATE;
    let originalChannels = 1;
    let probedDuration = 0;

    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=sample_rate,channels:format=duration',
        '-of',
        'json',
        inputPath,
      ]);
      const probeJson = JSON.parse(stdout) as {
        streams?: Array<{ sample_rate?: string; channels?: number }>;
        format?: { duration?: string };
      };
      const stream = probeJson.streams?.[0];
      if (!stream) {
        throw new Error('No decodable audio stream found.');
      }
      if (stream.sample_rate) originalSampleRate = Number(stream.sample_rate) || TARGET_SAMPLE_RATE;
      if (stream.channels) originalChannels = Number(stream.channels) || 1;
      if (probeJson.format?.duration) probedDuration = Number(probeJson.format.duration) || 0;
    } catch (err) {
      throw new Error(
        `PROCESSING:Could not inspect audio stream (${err instanceof Error ? err.message : 'corrupted file'}).`
      );
    }

    // 2. Convert to mono + resample to 16 kHz raw float32 PCM via ffmpeg
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-v',
        'error',
        '-i',
        inputPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(TARGET_SAMPLE_RATE),
        '-f',
        'f32le',
        pcmOutPath,
      ]);
    } catch {
      throw new Error('PROCESSING:Audio decoding or resampling to 16 kHz mono failed.');
    }

    const rawPcmBuf = await fs.promises.readFile(pcmOutPath);
    const sampleCount = Math.floor(rawPcmBuf.byteLength / 4);
    if (sampleCount < 160) {
      throw new Error('PROCESSING:Audio clip is too short or silent for processing.');
    }

    const samples = new Float32Array(
      rawPcmBuf.buffer,
      rawPcmBuf.byteOffset,
      sampleCount
    );

    // 3. Peak normalization
    let peakBefore = 0;
    for (let i = 0; i < sampleCount; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peakBefore) peakBefore = abs;
    }

    const normalized = new Float32Array(sampleCount);
    let sumSq = 0;
    const scale = peakBefore > 1e-8 ? 1 / peakBefore : 1;
    for (let i = 0; i < sampleCount; i++) {
      const v = samples[i] * scale;
      normalized[i] = v;
      sumSq += v * v;
    }

    const rmsLevel = Number(Math.sqrt(sumSq / sampleCount).toFixed(5));
    const durationSeconds = Number(
      (probedDuration > 0 ? probedDuration : sampleCount / TARGET_SAMPLE_RATE).toFixed(3)
    );

    return {
      normalizedPcm: normalized,
      waveformPreview: buildWaveformPreview(normalized, 48),
      metadata: {
        fileName: safeName,
        mimeType: params.mimeType || (ext === '.wav' ? 'audio/wav' : 'audio/mpeg'),
        fileSizeBytes: params.buffer.length,
        originalSampleRate,
        processedSampleRate: TARGET_SAMPLE_RATE,
        originalChannels,
        processedChannels: 1,
        durationSeconds,
        normalized: true,
        peakAmplitudeBeforeNorm: Number(peakBefore.toFixed(5)),
        rmsLevel,
        sampleCount,
        language: params.language,
      },
    };
  } finally {
    // Guaranteed cleanup of temporary audio files
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runModularAudioDetector(
  normalizedPcm: Float32Array,
  metadata: AudioProcessingMetadata
): Promise<Omit<AnalyzeAudioResponsePayload, 'analysisTimestamp' | 'audioMetadata' | 'processingStatus' | 'waveformPreview' | 'serviceEngine'>> {
  const endpoint = process.env.DEEPFAKE_MODEL_ENDPOINT?.trim();
  const apiKey = process.env.DEEPFAKE_MODEL_API_KEY?.trim();

  if (endpoint) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      // Send preprocessed 16 kHz mono float32 waveform (base64) + metadata to AASIST/Wav2Vec2 endpoint
      const pcmBytes = Buffer.from(
        normalizedPcm.buffer,
        normalizedPcm.byteOffset,
        normalizedPcm.byteLength
      );

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sampleRate: metadata.processedSampleRate,
          channels: metadata.processedChannels,
          durationSeconds: metadata.durationSeconds,
          fileName: metadata.fileName,
          pcmFloat32Base64: pcmBytes.toString('base64'),
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          classification?: string;
          confidence?: number;
          explanation?: string;
          modelName?: string;
          architecture?: string;
        };

        const cls =
          data.classification === 'POTENTIALLY_SYNTHETIC' || data.classification === 'SYNTHETIC'
            ? 'POTENTIALLY_SYNTHETIC'
            : data.classification === 'AUTHENTIC'
              ? 'AUTHENTIC'
              : null;

        if (cls) {
          return {
            detectionStatus: 'COMPLETED',
            classification: cls,
            confidence:
              typeof data.confidence === 'number' && Number.isFinite(data.confidence)
                ? Number(clamp(data.confidence, 0, 100).toFixed(1))
                : null,
            explanation:
              data.explanation ||
              `Model inference completed on normalized 16 kHz mono audio (${metadata.durationSeconds.toFixed(2)}s).`,
            modelInfo: {
              name: data.modelName || 'External Deepfake Model',
              architecture: data.architecture || 'Configured Inference Endpoint',
              ready: true,
            },
          };
        }
      }
    } catch (err) {
      console.warn('Configured DEEPFAKE_MODEL_ENDPOINT failed during /api/analyze-audio:', err);
    }
  }

  return {
    detectionStatus: 'MODEL_NOT_CONFIGURED',
    classification: 'UNVERIFIED_NO_MODEL',
    confidence: null,
    explanation:
      `Audio validation and preprocessing completed (${metadata.durationSeconds.toFixed(2)}s, converted from ` +
      `${metadata.originalSampleRate} Hz / ${metadata.originalChannels}ch to ${metadata.processedSampleRate} Hz mono, ` +
      `peak-normalized). No pretrained deepfake model (such as AASIST or Wav2Vec2) is currently configured, ` +
      `so AI voice-cloning detection is not active.`,
    modelInfo: {
      name: null,
      architecture: null,
      ready: false,
    },
  };
}

function getRiskBand(score: number): { classification: RiskClassification; riskLevel: RiskLevel } {
  if (score <= 30) {
    return { classification: 'Authentic Voice', riskLevel: 'Low Risk' };
  }
  if (score <= 65) {
    return { classification: 'Suspicious Voice', riskLevel: 'Medium Risk' };
  }
  if (score <= 85) {
    return { classification: 'Potential AI-Generated Voice', riskLevel: 'High Risk' };
  }
  return { classification: 'High-Risk Voice', riskLevel: 'Critical Risk' };
}

function getRecommendations(riskLevel: RiskLevel): string[] {
  if (riskLevel === 'Low Risk') {
    return [
      'Low-risk signal profile observed. Continue following standard identity verification practices.',
      'Never disclose one-time passcodes (OTPs), PINs, or credentials over voice channels.',
      'Verify any material financial or access request through an established secondary channel.',
    ];
  }
  if (riskLevel === 'Medium Risk') {
    return [
      'Suspicious acoustic anomalies detected. Independently verify the speaker before sharing sensitive information.',
      'Initiate a fresh callback using a previously stored trusted phone number.',
      'Do not approve wire transfers, credential resets, or policy overrides based solely on voice confirmation.',
      'Confirm identity with a pre-shared organizational or family verification phrase.',
    ];
  }
  if (riskLevel === 'High Risk') {
    return [
      'Elevated risk indicators consistent with potential synthetic or heavily processed speech. Pause the interaction.',
      'Do not transfer funds or disclose authentication codes under any urgency pressure.',
      'Escalate to an out-of-band verification channel (saved corporate directory or in-person confirmation).',
      'Flag the session in Threat Detection and retain the PDF report for incident review.',
    ];
  }
  return [
    'Critical voice impersonation risk indicators detected. Terminate the interaction immediately.',
    'Block any pending financial authorization, account recovery, or privileged access request.',
    'Contact the purported speaker via a known, verified out-of-band communication channel.',
    'Document the detection ID, attach investigation notes in Threat Detection, and notify your security operations team.',
  ];
}

function runExperimentalSignalAnalysis(body: AnalyzeVoiceRequestBody): InferenceResult {
  const f = body.extractedFeatures;
  const silenceRatio = f.silenceRatio ?? 0.15;
  const dynamicRange = f.dynamicRange ?? 24;
  const pitchVariance = f.pitchVariance ?? 0.18;

  let heuristicScore = 16;
  const indicators: InferenceResult['signalIndicators'] = [];

  const nyquist = Math.max(4000, f.sampleRate / 2);
  const rolloffRatio = f.spectralRolloff / nyquist;
  if (rolloffRatio < 0.25 || rolloffRatio > 0.88) {
    heuristicScore += 24;
    indicators.push({
      label: 'Spectral Rolloff Boundary',
      finding: `85% spectral rolloff at ${Math.round(f.spectralRolloff)} Hz (${Math.round(rolloffRatio * 100)}% of Nyquist) deviates from typical wideband speech.`,
      severity: 'elevated',
    });
  } else if (rolloffRatio < 0.36 || rolloffRatio > 0.78) {
    heuristicScore += 12;
    indicators.push({
      label: 'Spectral Rolloff Boundary',
      finding: `Moderate spectral rolloff skew measured at ${Math.round(f.spectralRolloff)} Hz.`,
      severity: 'caution',
    });
  } else {
    indicators.push({
      label: 'Spectral Rolloff Boundary',
      finding: `Spectral rolloff (${Math.round(f.spectralRolloff)} Hz) falls within typical wideband vocal range.`,
      severity: 'normal',
    });
  }

  if (dynamicRange < 12 || silenceRatio > 0.58) {
    heuristicScore += 26;
    indicators.push({
      label: 'Dynamic Range & Noise Floor',
      finding: `Compressed dynamic range (${dynamicRange.toFixed(1)} dB) or elevated digital silence floor (${Math.round(silenceRatio * 100)}%) detected.`,
      severity: 'elevated',
    });
  } else if (dynamicRange < 19 || silenceRatio > 0.42) {
    heuristicScore += 13;
    indicators.push({
      label: 'Dynamic Range & Noise Floor',
      finding: `Slightly uniform amplitude envelope (${dynamicRange.toFixed(1)} dB dynamic range).`,
      severity: 'caution',
    });
  } else {
    indicators.push({
      label: 'Dynamic Range & Noise Floor',
      finding: `Natural vocal amplitude variation observed (${dynamicRange.toFixed(1)} dB dynamic range).`,
      severity: 'normal',
    });
  }

  if (f.zeroCrossingRate < 0.022 || f.zeroCrossingRate > 0.27 || pitchVariance < 0.055) {
    heuristicScore += 22;
    indicators.push({
      label: 'Zero-Crossing & Modulation',
      finding: `Irregular ZCR (${f.zeroCrossingRate.toFixed(3)}) or suppressed frame modulation variance (${pitchVariance.toFixed(3)}) indicates waveform periodicity.`,
      severity: 'elevated',
    });
  } else if (pitchVariance < 0.11) {
    heuristicScore += 11;
    indicators.push({
      label: 'Zero-Crossing & Modulation',
      finding: `Moderate periodicity uniformity measured across frames (variance ${pitchVariance.toFixed(3)}).`,
      severity: 'caution',
    });
  } else {
    indicators.push({
      label: 'Zero-Crossing & Modulation',
      finding: `Organic zero-crossing cadence (${f.zeroCrossingRate.toFixed(3)}) with natural frame-to-frame variation.`,
      severity: 'normal',
    });
  }

  const centroidBandwidthRatio = f.spectralBandwidth > 0 ? f.spectralCentroid / f.spectralBandwidth : 1;
  if (centroidBandwidthRatio < 0.42 || centroidBandwidthRatio > 2.45) {
    heuristicScore += 14;
    indicators.push({
      label: 'Spectral Centroid Balance',
      finding: `Spectral centroid (${Math.round(f.spectralCentroid)} Hz) vs bandwidth (${Math.round(f.spectralBandwidth)} Hz) shows concentrated formant energy.`,
      severity: 'caution',
    });
  } else {
    indicators.push({
      label: 'Spectral Centroid Balance',
      finding: `Balanced spectral centroid (${Math.round(f.spectralCentroid)} Hz) across ${Math.round(f.spectralBandwidth)} Hz bandwidth.`,
      severity: 'normal',
    });
  }

  if (f.rmsEnergy < 0.006 || f.rmsEnergy > 0.48) {
    heuristicScore += 8;
  }
  if (body.duration < 1.5) {
    heuristicScore += 6;
  }

  const riskScore = Math.round(clamp(heuristicScore, 4, 96));
  const authenticityScore = 100 - riskScore;
  const { classification, riskLevel } = getRiskBand(riskScore);
  const recommendations = getRecommendations(riskLevel);

  const summaryPrefix =
    riskLevel === 'Low Risk'
      ? 'Measured signal characteristics align with natural speech dynamics.'
      : riskLevel === 'Medium Risk'
        ? 'The audio exhibits moderate acoustic deviations in spectral distribution or amplitude dynamics that warrant verification.'
        : riskLevel === 'High Risk'
          ? 'Multiple acoustic anomalies were observed in spectral rolloff, modulation variance, and dynamic range.'
          : 'Severe signal-level anomalies detected across spectral boundaries, modulation uniformity, and noise floor.';

  const explanation =
    `${summaryPrefix} Measured RMS energy ${f.rmsEnergy.toFixed(4)}, spectral centroid ${Math.round(f.spectralCentroid)} Hz, ` +
    `spectral rolloff ${Math.round(f.spectralRolloff)} Hz, and dynamic range ${dynamicRange.toFixed(1)} dB over ${body.duration.toFixed(1)}s. ` +
    `Experimental Signal-Analysis Notice: No trained PyTorch/TensorFlow deepfake model is currently connected; signal features alone cannot reliably establish whether a voice is AI-generated.`;

  return {
    classification,
    riskLevel,
    riskScore,
    authenticityScore,
    confidence: null,
    analysisMode: 'experimental_signal_analysis',
    modelStatus: 'Experimental Signal-Analysis Mode (No Trained ML Model Configured)',
    explanation,
    recommendations,
    signalIndicators: indicators,
  };
}

async function runInferencePipeline(body: AnalyzeVoiceRequestBody): Promise<InferenceResult> {
  const endpoint = process.env.DEEPFAKE_MODEL_ENDPOINT?.trim();
  const apiKey = process.env.DEEPFAKE_MODEL_API_KEY?.trim();

  if (endpoint) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: body.fileName,
          fileType: body.fileType,
          duration: body.duration,
          extractedFeatures: body.extractedFeatures,
          audioBase64: body.audioBase64,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          riskScore?: number;
          confidence?: number;
          explanation?: string;
          modelName?: string;
        };
        if (typeof data.riskScore === 'number' && Number.isFinite(data.riskScore)) {
          const riskScore = Math.round(clamp(data.riskScore, 0, 100));
          const authenticityScore = 100 - riskScore;
          const { classification, riskLevel } = getRiskBand(riskScore);
          return {
            classification,
            riskLevel,
            riskScore,
            authenticityScore,
            confidence: typeof data.confidence === 'number' ? Math.round(clamp(data.confidence, 0, 100)) : null,
            analysisMode: 'external_model_inference',
            modelStatus: data.modelName || 'External Inference API Connected',
            explanation:
              data.explanation ||
              `External model inference completed: ${classification} (${riskLevel}, risk ${riskScore}/100).`,
            recommendations: getRecommendations(riskLevel),
            signalIndicators: runExperimentalSignalAnalysis(body).signalIndicators,
          };
        }
      }
      console.warn('External model endpoint returned non-OK or invalid payload; falling back to experimental signal analysis.');
    } catch (err) {
      console.warn('External model endpoint unreachable; falling back to experimental signal analysis.', err);
    }
  }

  return runExperimentalSignalAnalysis(body);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AUDIO_UPLOAD_BYTES,
    files: 1,
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  app.get('/api/health', (_req, res) => {
    const hasModel = Boolean(process.env.DEEPFAKE_MODEL_ENDPOINT?.trim());
    const hasFastApi = Boolean(process.env.FASTAPI_AUDIO_SERVICE_URL?.trim());
    res.json({
      status: 'ok',
      analysisMode: hasModel ? 'external_model_inference' : 'experimental_signal_analysis',
      modelConfigured: hasModel,
      fastApiConfigured: hasFastApi,
      engineLabel: hasModel
        ? 'External FastAPI/ML Inference Connected'
        : 'Experimental Signal-Analysis Mode',
    });
  });

  // New modular audio upload, preprocessing (mono 16 kHz normalized), & anti-spoofing endpoint
  app.post('/api/analyze-audio', (req, res) => {
    upload.single('audio')(req, res, async (uploadErr) => {
      if (uploadErr) {
        if (uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'Audio file exceeds the 25 MB upload limit.' });
          return;
        }
        res.status(400).json({ error: uploadErr.message || 'Invalid multipart audio upload.' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No audio file uploaded under form field "audio".' });
        return;
      }

      const language =
        typeof req.body?.language === 'string' && req.body.language.trim()
          ? req.body.language.trim().slice(0, 40)
          : null;

      // Optional proxy to standalone Python FastAPI service when configured
      const fastApiUrl = process.env.FASTAPI_AUDIO_SERVICE_URL?.trim().replace(/\/+$/, '');
      if (fastApiUrl) {
        try {
          const form = new FormData();
          form.append(
            'audio',
            new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'application/octet-stream' }),
            file.originalname
          );
          if (language) form.append('language', language);

          const fastApiResp = await fetch(`${fastApiUrl}/api/analyze-audio`, {
            method: 'POST',
            body: form,
          });
          if (fastApiResp.ok) {
            const payload = (await fastApiResp.json()) as Record<string, unknown>;
            res.json({ ...payload, serviceEngine: 'fastapi-librosa-pipeline' });
            return;
          }
          const errJson = (await fastApiResp.json().catch(() => null)) as { detail?: string } | null;
          if (fastApiResp.status >= 400 && fastApiResp.status < 500) {
            res.status(fastApiResp.status).json({ error: errJson?.detail || 'FastAPI audio validation failed.' });
            return;
          }
        } catch (err) {
          console.warn('FASTAPI_AUDIO_SERVICE_URL unreachable; falling back to local FFmpeg audio processor.', err);
        }
      }

      try {
        const processed = await processAudioWithTempHandling({
          fileName: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
          language,
        });

        const detection = await runModularAudioDetector(processed.normalizedPcm, processed.metadata);

        const responsePayload: AnalyzeAudioResponsePayload = {
          detectionStatus: detection.detectionStatus,
          classification: detection.classification,
          confidence: detection.confidence,
          analysisTimestamp: new Date().toISOString(),
          audioMetadata: processed.metadata,
          processingStatus: 'PROCESSED_MONO_16KHZ_NORMALIZED',
          explanation: detection.explanation,
          modelInfo: detection.modelInfo,
          waveformPreview: processed.waveformPreview,
          serviceEngine: 'node-ffmpeg-pipeline',
        };

        res.json(responsePayload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to process uploaded audio.';
        if (msg.startsWith('VALIDATION:')) {
          res.status(400).json({ error: msg.slice('VALIDATION:'.length) });
          return;
        }
        if (msg.startsWith('PROCESSING:')) {
          res.status(422).json({ error: msg.slice('PROCESSING:'.length) });
          return;
        }
        console.error('Error in /api/analyze-audio:', err);
        res.status(500).json({ error: 'Internal error during audio preprocessing.' });
      }
    });
  });

  // Existing signal-heuristic / live recording endpoint preserved
  app.post('/api/analyze-voice', async (req, res) => {
    try {
      const body = req.body as Partial<AnalyzeVoiceRequestBody>;
      if (
        !body ||
        typeof body.fileName !== 'string' ||
        typeof body.fileType !== 'string' ||
        typeof body.fileSize !== 'number' ||
        typeof body.duration !== 'number' ||
        !body.extractedFeatures ||
        typeof body.extractedFeatures.rmsEnergy !== 'number' ||
        typeof body.extractedFeatures.spectralCentroid !== 'number'
      ) {
        res.status(400).json({ error: 'Invalid audio feature payload.' });
        return;
      }

      const sanitized: AnalyzeVoiceRequestBody = {
        fileName: body.fileName.slice(0, 200),
        fileType: body.fileType.slice(0, 64),
        fileSize: Math.max(0, body.fileSize),
        duration: Math.max(0, body.duration),
        sourceType: body.sourceType === 'live_recording' ? 'live_recording' : 'upload',
        extractedFeatures: body.extractedFeatures,
        audioBase64: typeof body.audioBase64 === 'string' ? body.audioBase64 : undefined,
      };

      const result = await runInferencePipeline(sanitized);
      res.json(result);
    } catch (error) {
      console.error('Error in /api/analyze-voice:', error);
      res.status(500).json({ error: 'Failed to process voice analysis request.' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VOICEGUARD AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
