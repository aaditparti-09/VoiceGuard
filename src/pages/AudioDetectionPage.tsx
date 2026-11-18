import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  ExternalLink,
  FileAudio,
  Info,
  Loader2,
  Pause,
  Play,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardLayout } from '../components/DashboardLayout';
import {
  RiskScoreGauge,
  SpectrogramCanvas,
  WaveformPreviewCanvas,
} from '../components/WaveformAndSpectrogram';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { processAudioBlob, validateWavMp3File } from '../lib/audioProcessor';
import {
  buildLocalDetectionRecord,
  runServerAnalysis,
  saveDetectionAndAlert,
  uploadAndAnalyzeAudio,
} from '../lib/detectionService';
import {
  SUPPORTED_LANGUAGES,
  type AnalyzeAudioApiResponse,
  type SignalIndicator,
  type SupportedLanguage,
  type VoiceDetectionRecord,
} from '../types/voiceguard';

export function AudioDetectionPage() {
  const { user, userProfile, setActiveReport } = useAuth();
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [duration, setDuration] = useState(0);
  const [sampleRate, setSampleRate] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);

  const [processingStatus, setProcessingStatus] = useState<string>('Idle');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [analyzingBackend, setAnalyzingBackend] = useState(false);
  const [analyzingDemo, setAnalyzingDemo] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(() => {
    const paramLang = searchParams.get('language');
    return paramLang && (SUPPORTED_LANGUAGES as readonly string[]).includes(paramLang)
      ? (paramLang as SupportedLanguage)
      : 'English';
  });

  // Real backend /api/analyze-audio result state
  const [backendResult, setBackendResult] = useState<AnalyzeAudioApiResponse | null>(null);

  // Separate experimental heuristic demo result state
  const [resultRecord, setResultRecord] = useState<VoiceDetectionRecord | null>(null);
  const [resultSpectrogram, setResultSpectrogram] = useState<number[][] | undefined>(undefined);
  const [resultIndicators, setResultIndicators] = useState<SignalIndicator[]>([]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleSelectedFile = async (selected: File) => {
    setFileError(null);
    setBackendResult(null);
    setResultRecord(null);
    setUploadProgress(0);

    const validationErr = validateWavMp3File(selected);
    if (validationErr) {
      setFileError(validationErr);
      return;
    }

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const nextUrl = URL.createObjectURL(selected);
    setFile(selected);
    setAudioUrl(nextUrl);
    setIsPlaying(false);
    setCurrentTime(0);
    setProcessingStatus('Decoding audio preview...');

    try {
      const processed = await processAudioBlob(selected);
      setDuration(processed.duration);
      setSampleRate(processed.extractedFeatures.sampleRate);
      setWaveformPeaks(processed.waveformPreview);
      setProcessingStatus('Validated & Decoded — Ready for Processing');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Unable to decode audio file.');
      setFile(null);
      URL.revokeObjectURL(nextUrl);
      setAudioUrl(null);
      setWaveformPeaks([]);
      setProcessingStatus('Decode Failed');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) void handleSelectedFile(dropped);
  };

  const handleRemoveFile = () => {
    if (audioRef.current) audioRef.current.pause();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setFile(null);
    setAudioUrl(null);
    setWaveformPeaks([]);
    setDuration(0);
    setSampleRate(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setFileError(null);
    setBackendResult(null);
    setResultRecord(null);
    setUploadProgress(0);
    setProcessingStatus('Idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const togglePlayPause = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      void el.play();
      setIsPlaying(true);
    }
  };

  const handleAnalyzeBackendAudio = async () => {
    if (!file) return;
    setAnalyzingBackend(true);
    setFileError(null);
    setBackendResult(null);
    setUploadProgress(0);
    setProcessingStatus('Uploading WAV/MP3 audio to backend...');

    try {
      const response = await uploadAndAnalyzeAudio({
        file,
        language: selectedLanguage,
        onProgress: (pct) => {
          setUploadProgress(pct);
          if (pct < 100) {
            setProcessingStatus(`Uploading audio (${pct}%)...`);
          } else {
            setProcessingStatus('Converting to mono, resampling to 16 kHz & normalizing...');
          }
        },
      });

      setUploadProgress(100);
      setBackendResult(response);
      if (response.waveformPreview?.length > 0) {
        setWaveformPeaks(response.waveformPreview);
      }

      if (response.detectionStatus === 'MODEL_NOT_CONFIGURED') {
        setProcessingStatus('Preprocessed (Mono 16 kHz Normalized) — Model Not Configured');
        pushToast(
          'Audio preprocessed on server',
          'info',
          'Mono 16 kHz normalization succeeded. No pretrained deepfake model is configured yet.'
        );
      } else {
        setProcessingStatus('Model Analysis Complete');
        pushToast(
          'Voice detection complete',
          response.classification === 'POTENTIALLY_SYNTHETIC' ? 'warning' : 'success',
          `Classification: ${response.classification}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backend audio processing failed.';
      setFileError(msg);
      setProcessingStatus('Processing Failed');
      pushToast('Audio processing error', 'error', msg);
    } finally {
      setAnalyzingBackend(false);
    }
  };

  const handleAnalyseExperimentalDemo = async () => {
    if (!file || !user) return;
    setAnalyzingDemo(true);
    setFileError(null);

    try {
      setProcessingStatus('Extracting experimental FFT spectral features...');
      const processed = await processAudioBlob(file);

      setProcessingStatus('Running experimental signal-analysis heuristic...');
      const analysis = await runServerAnalysis({
        fileName: file.name,
        fileType: file.type || 'audio/unknown',
        fileSize: file.size,
        duration: processed.duration,
        sourceType: 'upload',
        extractedFeatures: processed.extractedFeatures,
      });

      setProcessingStatus('Persisting demonstration scan to Cloud Firestore...');
      const saved = await saveDetectionAndAlert({
        userId: user.uid,
        fileName: file.name,
        fileType: file.type || 'audio/unknown',
        fileSize: file.size,
        duration: processed.duration,
        sourceType: 'upload',
        language: selectedLanguage,
        extractedFeatures: processed.extractedFeatures,
        waveformPreview: processed.waveformPreview,
        spectrumPreview: processed.spectrumPreview,
        analysis,
        createAlerts: userProfile?.highRiskAlerts ?? true,
      });

      const localRecord = buildLocalDetectionRecord({
        id: saved.detectionId,
        userId: user.uid,
        fileName: file.name,
        fileType: file.type || 'audio/unknown',
        fileSize: file.size,
        duration: processed.duration,
        sourceType: 'upload',
        language: selectedLanguage,
        extractedFeatures: processed.extractedFeatures,
        waveformPreview: processed.waveformPreview,
        spectrumPreview: processed.spectrumPreview,
        analysis,
      });

      setResultRecord(localRecord);
      setResultSpectrogram(processed.spectrogramMatrix);
      setResultIndicators(analysis.signalIndicators);
      setProcessingStatus(
        saved.savedToCloud
          ? 'Experimental Demo Complete & Saved to Firestore'
          : 'Experimental Demo Complete (Local Preview)'
      );

      setActiveReport({
        record: localRecord,
        spectrogramMatrix: processed.spectrogramMatrix,
        signalIndicators: analysis.signalIndicators,
        savedToCloud: saved.savedToCloud,
      });

      pushToast(
        'Experimental signal analysis complete',
        localRecord.riskScore > 30 ? 'warning' : 'success',
        saved.alertCreated
          ? 'Demo detection saved and security alert generated.'
          : saved.savedToCloud
            ? 'Demo detection saved to Call History.'
            : 'Verify your email to save scans to Firestore.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze audio.';
      setFileError(msg);
      setProcessingStatus('Analysis Failed');
      pushToast('Analysis failed', 'error', msg);
    } finally {
      setAnalyzingDemo(false);
    }
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const isBusy = analyzingBackend || analyzingDemo;

  return (
    <DashboardLayout
      title="Voice Analysis"
      subtitle="Upload WAV or MP3 recordings for server-side 16 kHz mono preprocessing and modular deepfake detection"
    >
      <div className="space-y-6">
        {/* Audio Upload & Preprocessing Workspace */}
        <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Audio Upload &amp; Preprocessing Module
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Accepts WAV and MP3 files up to 25 MB · Status:{' '}
                <span className="font-mono text-cyan-400">{processingStatus}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="upload-language" className="text-xs text-slate-400 whitespace-nowrap">
                Spoken Language
              </label>
              <select
                id="upload-language"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as SupportedLanguage)}
                disabled={isBusy}
                className="px-3 py-1.5 rounded-lg border border-[#1E2D44] bg-[#070C14] text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {fileError && (
            <div className="mt-4 rounded-lg border border-red-500/35 bg-red-500/10 p-3.5 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{fileError}</span>
            </div>
          )}

          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              className={`mt-5 rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-[#1E2D44] bg-[#070C14] hover:border-slate-600'
              }`}
            >
              <UploadCloud className="w-9 h-9 text-cyan-400 mx-auto" />
              <p className="text-sm font-semibold text-white mt-3">
                Drag and drop a WAV or MP3 audio file here, or click to select
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Server pipeline validates, converts to mono, resamples to 16 kHz, normalizes, and cleans up temp files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,audio/wav,audio/mpeg"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) void handleSelectedFile(chosen);
                }}
                className="hidden"
              />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#18253A]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                    <FileAudio className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{file.name}</p>
                    <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB · {file.type || 'audio'} · {duration.toFixed(2)}s ·{' '}
                      {sampleRate ? `${sampleRate} Hz` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    className="px-3 py-1.5 rounded-lg border border-[#1E2D44] text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-xs font-medium text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".wav,.mp3,audio/wav,audio/mpeg"
                    onChange={(e) => {
                      const chosen = e.target.files?.[0];
                      if (chosen) void handleSelectedFile(chosen);
                    }}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Audio Waveform & Playback Controls */}
              <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-4 space-y-3">
                <WaveformPreviewCanvas peaks={waveformPeaks} progress={progress} height={88} />

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    className="w-9 h-9 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center shrink-0 transition-colors"
                    aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.05}
                    value={currentTime}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setCurrentTime(next);
                      if (audioRef.current) audioRef.current.currentTime = next;
                    }}
                    className="flex-1 accent-cyan-500 cursor-pointer"
                    aria-label="Playback position"
                  />

                  <span className="font-mono text-xs text-slate-300 tabular-nums shrink-0">
                    {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                  </span>
                </div>

                {audioUrl && (
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    onTimeUpdate={() => {
                      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
                    }}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                )}
              </div>

              {/* Upload & Backend Processing Progress Bar */}
              {(analyzingBackend || uploadProgress > 0) && (
                <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">{processingStatus}</span>
                    <span className="font-mono text-cyan-400 tabular-nums">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#162235] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions: Real Audio Pipeline vs Separate Experimental Demo Heuristic */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs text-slate-400 max-w-xl">
                  Runs server-side audio validation, mono 16 kHz resampling, normalization, and modular anti-spoofing interface (<code className="text-cyan-300">/api/analyze-audio</code>).
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleAnalyseExperimentalDemo}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#1E2D44] bg-[#09101C] hover:bg-[#132036] text-slate-200 text-xs font-semibold transition-colors disabled:opacity-60"
                  >
                    {analyzingDemo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {analyzingDemo ? 'Running Heuristic...' : 'Run Experimental Heuristic (Demo)'}
                  </button>

                  <button
                    type="button"
                    onClick={handleAnalyzeBackendAudio}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                  >
                    {analyzingBackend && <Loader2 className="w-4 h-4 animate-spin" />}
                    {analyzingBackend ? 'Processing Audio...' : 'Analyze Audio (Backend Pipeline)'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Backend /api/analyze-audio Detection Result Card */}
        {backendResult && (
          <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#18253A]">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
                    backendResult.detectionStatus === 'MODEL_NOT_CONFIGURED'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                      : backendResult.classification === 'POTENTIALLY_SYNTHETIC'
                        ? 'border-red-500/40 bg-red-500/10 text-red-400'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  {backendResult.detectionStatus === 'MODEL_NOT_CONFIGURED' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : backendResult.classification === 'POTENTIALLY_SYNTHETIC' ? (
                    <AlertCircle className="w-5 h-5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs uppercase tracking-wider text-cyan-400">
                      {backendResult.detectionStatus}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono text-xs text-slate-400">
                      {backendResult.processingStatus}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-white mt-1">
                    {backendResult.classification === 'UNVERIFIED_NO_MODEL'
                      ? 'Audio Preprocessed — Model Not Configured'
                      : backendResult.classification === 'POTENTIALLY_SYNTHETIC'
                        ? 'Potentially Synthetic Voice Detected'
                        : 'Authentic Voice Classification'}
                  </h3>
                </div>
              </div>

              <div className="text-left sm:text-right font-mono text-xs">
                <p className="text-slate-400">Model Confidence</p>
                <p className="text-sm font-semibold text-white mt-0.5 tabular-nums">
                  {backendResult.confidence !== null
                    ? `${backendResult.confidence.toFixed(1)}%`
                    : 'N/A (MODEL_NOT_CONFIGURED)'}
                </p>
              </div>
            </div>

            {/* Explanation */}
            <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-4 flex items-start gap-3 text-xs text-slate-200 leading-relaxed">
              <Cpu className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>{backendResult.explanation}</p>
                <p className="font-mono text-[11px] text-slate-400">
                  Timestamp: {new Date(backendResult.analysisTimestamp).toLocaleString()} · Pipeline:{' '}
                  {backendResult.serviceEngine || 'node-ffmpeg-pipeline'} · Model:{' '}
                  {backendResult.modelInfo.name || 'None (Ready for AASIST / Wav2Vec2)'}
                </p>
              </div>
            </div>

            {/* Server Audio Metadata Grid */}
            <div>
              <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Processed Audio Metadata (Mono 16 kHz Normalized)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3">
                  <span className="text-slate-400">Original Sample Rate</span>
                  <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                    {backendResult.audioMetadata.originalSampleRate.toLocaleString()} Hz
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3">
                  <span className="text-slate-400">Processed Sample Rate</span>
                  <p className="font-mono font-semibold text-cyan-300 mt-0.5 tabular-nums">
                    {backendResult.audioMetadata.processedSampleRate.toLocaleString()} Hz
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3">
                  <span className="text-slate-400">Channels</span>
                  <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                    {backendResult.audioMetadata.originalChannels} ch → Mono (
                    {backendResult.audioMetadata.processedChannels} ch)
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3">
                  <span className="text-slate-400">Duration</span>
                  <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                    {backendResult.audioMetadata.durationSeconds.toFixed(2)}s
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3">
                  <span className="text-slate-400">Normalization</span>
                  <p className="font-mono font-semibold text-emerald-400 mt-0.5">
                    {backendResult.audioMetadata.normalized ? 'Peak Normalized' : 'Raw'}
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3">
                  <span className="text-slate-400">Peak Before Norm</span>
                  <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                    {backendResult.audioMetadata.peakAmplitudeBeforeNorm.toFixed(4)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3">
                  <span className="text-slate-400">Normalized RMS</span>
                  <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                    {backendResult.audioMetadata.rmsLevel.toFixed(5)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3">
                  <span className="text-slate-400">16 kHz Sample Count</span>
                  <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                    {backendResult.audioMetadata.sampleCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Separate Experimental Signal Heuristic Demo Result Workspace */}
        {resultRecord && (
          <div className="space-y-6">
            <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-6">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
                <RiskScoreGauge
                  score={resultRecord.riskScore}
                  riskLevel={resultRecord.riskLevel}
                  label="Demo Risk Score"
                />

                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-cyan-400">
                        EXPERIMENTAL DEMO · {resultRecord.classification} · {resultRecord.riskLevel}
                      </p>
                      <h3 className="font-display text-xl font-bold text-white mt-0.5">
                        Authenticity Score: {resultRecord.authenticityScore}/100
                      </h3>
                    </div>
                    <Link
                      to={`/reports/${resultRecord.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#1E2D44] hover:bg-slate-800 text-xs font-semibold text-white transition-colors"
                    >
                      Open Full Report &amp; PDF
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  <p className="text-xs font-mono text-slate-400 tabular-nums">
                    ID: {resultRecord.id} · Language: {resultRecord.language || selectedLanguage} · Timestamp:{' '}
                    {resultRecord.createdAt.toLocaleString()} · Confidence:{' '}
                    {resultRecord.confidence !== null
                      ? `${resultRecord.confidence}%`
                      : 'N/A (Experimental Signal-Analysis Mode)'}
                  </p>

                  <p className="text-xs text-slate-200 leading-relaxed">{resultRecord.explanation}</p>

                  <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-3 flex items-start gap-2 text-[11px] text-slate-300">
                    <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Model Status:</strong> {resultRecord.modelStatus}. Separate from the production{' '}
                      <code className="text-cyan-300">/api/analyze-audio</code> model pipeline.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Extracted Features & Recommendations */}
              <div className="lg:col-span-5 rounded-xl border border-[#18253A] bg-[#0C1524] p-5 space-y-5">
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">Extracted Audio Features</h3>
                  <div className="grid grid-cols-2 gap-2.5 mt-3 text-xs">
                    <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-2.5">
                      <span className="text-slate-400">RMS Energy</span>
                      <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                        {resultRecord.extractedFeatures.rmsEnergy.toFixed(4)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-2.5">
                      <span className="text-slate-400">Zero-Crossing Rate</span>
                      <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                        {resultRecord.extractedFeatures.zeroCrossingRate.toFixed(4)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-2.5">
                      <span className="text-slate-400">Spectral Centroid</span>
                      <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                        {Math.round(resultRecord.extractedFeatures.spectralCentroid)} Hz
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-2.5">
                      <span className="text-slate-400">Spectral Bandwidth</span>
                      <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                        {Math.round(resultRecord.extractedFeatures.spectralBandwidth)} Hz
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-2.5">
                      <span className="text-slate-400">Spectral Rolloff</span>
                      <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                        {Math.round(resultRecord.extractedFeatures.spectralRolloff)} Hz
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#18253A] bg-[#070C14] p-2.5">
                      <span className="text-slate-400">Dynamic Range</span>
                      <p className="font-mono font-semibold text-white mt-0.5 tabular-nums">
                        {resultRecord.extractedFeatures.dynamicRange.toFixed(1)} dB
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-display text-sm font-semibold text-white">Prevention Recommendations</h4>
                  <ul className="mt-2.5 space-y-2">
                    {resultRecord.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Frequency Analysis + Spectrogram */}
              <div className="lg:col-span-7 rounded-xl border border-[#18253A] bg-[#0C1524] p-5 space-y-5">
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">Frequency-Domain Distribution</h3>
                  <div className="h-48 w-full mt-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={resultRecord.extractedFeatures.frequencyBands}
                        margin={{ top: 6, right: 6, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                        <XAxis dataKey="band" stroke="#64748B" fontSize={10} tickLine={false} />
                        <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#060B14',
                            borderColor: '#1E293B',
                            borderRadius: '8px',
                            color: '#F8FAFC',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="energy" name="Relative Energy (%)" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-sm font-semibold text-white mb-2.5">Spectrogram Visualization</h3>
                  <SpectrogramCanvas
                    matrix={resultSpectrogram}
                    spectrumPreview={resultRecord.spectrumPreview}
                    height={150}
                  />
                </div>

                {resultIndicators.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {resultIndicators.map((ind) => (
                      <div key={ind.label} className="rounded-lg border border-[#18253A] bg-[#070C14] p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{ind.label}</span>
                          <span
                            className={`font-mono text-[10px] uppercase ${
                              ind.severity === 'elevated'
                                ? 'text-red-400'
                                : ind.severity === 'caution'
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                            }`}
                          >
                            {ind.severity}
                          </span>
                        </div>
                        <p className="text-slate-400 mt-1 leading-relaxed">{ind.finding}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
