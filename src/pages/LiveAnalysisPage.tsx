import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ExternalLink,
  Info,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { RiskScoreGauge, WaveformPreviewCanvas } from '../components/WaveformAndSpectrogram';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { processAudioBlob } from '../lib/audioProcessor';
import {
  buildLocalDetectionRecord,
  runServerAnalysis,
  saveDetectionAndAlert,
} from '../lib/detectionService';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  type VoiceDetectionRecord,
} from '../types/voiceguard';

type MonitoringStatus =
  | 'Idle'
  | 'Monitoring (Mic Active)'
  | 'Paused'
  | 'Stopped — Ready to Analyze'
  | 'Processing'
  | 'Complete';

export function LiveAnalysisPage() {
  const { user, userProfile, systemHealth, setActiveReport } = useAuth();
  const { pushToast } = useToast();

  const [status, setStatus] = useState<MonitoringStatus>('Idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('English');
  const [latestResult, setLatestResult] = useState<VoiceDetectionRecord | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);

  const stopLiveCanvas = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const cleanupRecordingHandles = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopLiveCanvas();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupRecordingHandles();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const drawLiveWaveform = () => {
    const canvas = liveCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 640;
      const h = 140;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = '#060B14';
      ctx.fillRect(0, 0, w, h);

      const barCount = 52;
      const gap = 4;
      const barWidth = (w - gap * (barCount - 1)) / barCount;
      const step = Math.max(1, Math.floor(bufferLength / barCount));

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] / 255;
        const barH = Math.max(6, val * (h * 0.84));
        const x = i * (barWidth + gap);
        const y = (h - barH) / 2;
        ctx.fillStyle = val > 0.65 ? '#22D3EE' : '#0284C7';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
  };

  const startMonitoring = async () => {
    setErrorMsg(null);
    setLatestResult(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Browser MediaRecorder or microphone access is unavailable in this environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        cleanupRecordingHandles();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        const nextUrl = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(nextUrl);
        setStatus('Stopped — Ready to Analyze');

        try {
          const processed = await processAudioBlob(blob);
          setWaveformPeaks(processed.waveformPreview);
        } catch {
          setWaveformPeaks([]);
        }
      };

      recorder.start(200);
      setElapsedSec(0);
      setRecordedBlob(null);
      setStatus('Monitoring (Mic Active)');
      drawLiveWaveform();

      timerRef.current = window.setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Enable microphone access in browser permissions and retry.'
          : 'Unable to open microphone device. Confirm a microphone is connected.';
      setErrorMsg(msg);
      setStatus('Idle');
    }
  };

  const pauseMonitoring = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === 'recording') {
      rec.pause();
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setStatus('Paused');
    }
  };

  const resumeMonitoring = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === 'paused') {
      rec.resume();
      timerRef.current = window.setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
      setStatus('Monitoring (Mic Active)');
    }
  };

  const stopMonitoring = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  };

  const handleRetake = () => {
    if (playbackRef.current) playbackRef.current.pause();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setWaveformPeaks([]);
    setLatestResult(null);
    setElapsedSec(0);
    setIsPlaying(false);
    setErrorMsg(null);
    setStatus('Idle');
  };

  const handleAnalyseRecording = async () => {
    if (!recordedBlob || !user) return;
    setStatus('Processing');
    setErrorMsg(null);

    try {
      const processed = await processAudioBlob(recordedBlob);
      const fileName = `live-mic-session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;

      const analysis = await runServerAnalysis({
        fileName,
        fileType: recordedBlob.type || 'audio/webm',
        fileSize: recordedBlob.size,
        duration: processed.duration,
        sourceType: 'live_recording',
        extractedFeatures: processed.extractedFeatures,
      });

      const saved = await saveDetectionAndAlert({
        userId: user.uid,
        fileName,
        fileType: recordedBlob.type || 'audio/webm',
        fileSize: recordedBlob.size,
        duration: processed.duration,
        sourceType: 'live_recording',
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
        fileName,
        fileType: recordedBlob.type || 'audio/webm',
        fileSize: recordedBlob.size,
        duration: processed.duration,
        sourceType: 'live_recording',
        language: selectedLanguage,
        extractedFeatures: processed.extractedFeatures,
        waveformPreview: processed.waveformPreview,
        spectrumPreview: processed.spectrumPreview,
        analysis,
      });

      setLatestResult(localRecord);
      setActiveReport({
        record: localRecord,
        spectrogramMatrix: processed.spectrogramMatrix,
        signalIndicators: analysis.signalIndicators,
        savedToCloud: saved.savedToCloud,
      });
      setStatus('Complete');

      pushToast(
        'Recording analyzed',
        localRecord.riskScore > 30 ? 'warning' : 'success',
        saved.savedToCloud
          ? 'Detection stored in Firestore.'
          : 'Verify your email to save detections in Firestore.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze recorded audio.';
      setErrorMsg(msg);
      setStatus('Stopped — Ready to Analyze');
      pushToast('Analysis failed', 'error', msg);
    }
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <DashboardLayout
      title="Live Call Monitoring"
      subtitle="Experimental local microphone capture and signal risk assessment"
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Honest Scope Notice */}
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] p-4 flex items-start gap-3 text-xs text-slate-200 leading-relaxed">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong>Experimental Audio Monitoring Notice:</strong> Browser microphone capture records local audio input only and does not automatically intercept cellular or VoIP telephone calls.{' '}
            {!systemHealth.modelConfigured &&
              'Real-time neural inference is not configured; analysis executes in experimental signal-analysis mode.'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Microphone Signal Capture Console
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Capture live audio via MediaRecorder &amp; Web Audio API, preview playback, and inspect signal risk.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="live-language" className="text-xs text-slate-400 whitespace-nowrap">
                  Language
                </label>
                <select
                  id="live-language"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value as SupportedLanguage)}
                  disabled={status === 'Processing'}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-[#060B14] text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400">Session Status</p>
                <p className="font-mono text-xs font-semibold text-cyan-400 mt-0.5 flex items-center justify-end gap-2">
                  {status === 'Monitoring (Mic Active)' && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                  )}
                  {status}
                </p>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-5 rounded-lg border border-red-500/35 bg-red-500/10 p-3.5 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Waveform / Amplitude Area */}
          <div className="mt-5 rounded-xl border border-slate-800 bg-[#060B14] p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-slate-400">
                {status === 'Monitoring (Mic Active)' || status === 'Paused'
                  ? 'Live Frequency Amplitude Spectrum'
                  : recordedBlob
                    ? 'Captured Audio Waveform'
                    : 'Audio Input Monitor'}
              </span>
              <span className="font-mono text-xl font-bold text-white tabular-nums">
                {formatTimer(elapsedSec)}
              </span>
            </div>

            {status === 'Monitoring (Mic Active)' || status === 'Paused' ? (
              <canvas ref={liveCanvasRef} className="w-full h-[140px] block rounded-lg" />
            ) : recordedBlob ? (
              <div className="space-y-4">
                <WaveformPreviewCanvas peaks={waveformPeaks} progress={0} height={100} />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const el = playbackRef.current;
                      if (!el) return;
                      if (isPlaying) {
                        el.pause();
                        setIsPlaying(false);
                      } else {
                        void el.play();
                        setIsPlaying(true);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 bg-[#0B1220] hover:bg-slate-800 text-xs font-medium text-white transition-colors"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {isPlaying ? 'Pause Preview' : 'Play Recorded Audio'}
                  </button>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {(recordedBlob.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                {recordedUrl && (
                  <audio
                    ref={playbackRef}
                    src={recordedUrl}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                )}
              </div>
            ) : (
              <div className="h-[140px] flex flex-col items-center justify-center text-slate-500 text-xs">
                <Mic className="w-7 h-7 mb-2 text-slate-600" />
                <span>Click Start Monitoring to request microphone access and begin capture</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {status === 'Idle' && !recordedBlob && (
                <button
                  type="button"
                  onClick={startMonitoring}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
                >
                  <Mic className="w-4 h-4" />
                  Start Monitoring
                </button>
              )}

              {status === 'Monitoring (Mic Active)' && (
                <>
                  <button
                    type="button"
                    onClick={pauseMonitoring}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 bg-[#101A2E] hover:bg-slate-800 text-xs font-medium text-white transition-colors"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={stopMonitoring}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    Stop Monitoring
                  </button>
                </>
              )}

              {status === 'Paused' && (
                <>
                  <button
                    type="button"
                    onClick={resumeMonitoring}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={stopMonitoring}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    Stop Monitoring
                  </button>
                </>
              )}

              {recordedBlob && status !== 'Monitoring (Mic Active)' && status !== 'Paused' && (
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={status === 'Processing'}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retake
                </button>
              )}
            </div>

            {recordedBlob && status !== 'Monitoring (Mic Active)' && status !== 'Paused' && (
              <button
                type="button"
                onClick={handleAnalyseRecording}
                disabled={status === 'Processing'}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
              >
                {status === 'Processing' && <Loader2 className="w-4 h-4 animate-spin" />}
                {status === 'Processing' ? 'Analysing Recorded Audio...' : 'Analyse Recorded Audio'}
              </button>
            )}
          </div>
        </div>

        {/* Inline Risk Assessment Result */}
        {latestResult && (
          <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <RiskScoreGauge score={latestResult.riskScore} riskLevel={latestResult.riskLevel} />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-cyan-400">
                      {latestResult.classification} · {latestResult.riskLevel}
                    </p>
                    <h3 className="font-display text-lg font-bold text-white mt-0.5">
                      Authenticity Score: {latestResult.authenticityScore}/100
                    </h3>
                  </div>
                  <Link
                    to={`/reports/${latestResult.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-white transition-colors"
                  >
                    View Full Report
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{latestResult.explanation}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
