import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Download,
  FileAudio,
  FileText,
  Info,
  ShieldAlert,
  ShieldCheck,
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
import { toggleSaveReport } from '../lib/detectionService';
import { downloadDetectionPdf } from '../lib/pdfReport';

export function RiskReportPage() {
  const { detectionId } = useParams<{ detectionId?: string }>();
  const { user, detections, activeReport, dataMode } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [savingReport, setSavingReport] = useState(false);

  const selectedRecord = useMemo(() => {
    if (detectionId) {
      const match = detections.find((d) => d.id === detectionId);
      if (match) return match;
      if (activeReport?.record.id === detectionId) return activeReport.record;
    }
    if (activeReport?.record) return activeReport.record;
    return detections[0] || null;
  }, [detectionId, detections, activeReport]);

  const spectrogramMatrix =
    selectedRecord && activeReport?.record.id === selectedRecord.id
      ? activeReport.spectrogramMatrix
      : undefined;

  const signalIndicators =
    selectedRecord && activeReport?.record.id === selectedRecord.id
      ? activeReport.signalIndicators
      : undefined;

  const handleSaveReport = async () => {
    if (!selectedRecord) return;
    if (dataMode === 'demo') {
      pushToast('Demo report previewed', 'info', 'Switch to Live Mode to bookmark Firestore records.');
      return;
    }
    if (!user || !user.emailVerified) {
      pushToast('Verification required', 'warning', 'Verify your email to bookmark reports in Firestore.');
      return;
    }
    setSavingReport(true);
    try {
      const next = !selectedRecord.isSavedReport;
      await toggleSaveReport(user.uid, selectedRecord.id, next);
      pushToast(next ? 'Report bookmarked' : 'Bookmark removed', 'success');
    } catch {
      pushToast('Failed to update report state', 'error');
    } finally {
      setSavingReport(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!selectedRecord) return;
    try {
      downloadDetectionPdf(selectedRecord);
      pushToast('PDF report downloaded', 'success');
    } catch {
      pushToast('Failed to generate PDF report', 'error');
    }
  };

  if (!selectedRecord) {
    return (
      <DashboardLayout title="Reports" subtitle="Explainable risk assessments and PDF audit exports">
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-10 text-center max-w-xl mx-auto">
          <FileText className="w-10 h-10 text-cyan-400 mx-auto" />
          <h2 className="font-display text-lg font-semibold text-white mt-4">No Reports Available</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Run Voice Analysis or Live Call Monitoring to generate an explainable risk assessment and PDF export.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <Link
              to="/voice-analysis"
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
            >
              Open Voice Analysis
            </Link>
            <Link
              to="/live-monitoring"
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-100 text-xs font-semibold transition-colors"
            >
              Live Call Monitoring
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isSevere =
    selectedRecord.riskLevel === 'Critical Risk' || selectedRecord.riskLevel === 'High Risk';
  const isMedium = selectedRecord.riskLevel === 'Medium Risk';

  const statusStyles = isSevere
    ? 'border-red-500/35 bg-red-500/10 text-red-300'
    : isMedium
      ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
      : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300';

  const StatusIcon = isSevere ? ShieldAlert : isMedium ? AlertTriangle : ShieldCheck;
  const f = selectedRecord.extractedFeatures;

  return (
    <DashboardLayout
      title="Reports"
      subtitle="Explainable signal telemetry, risk scoring, and PDF compliance export"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {detections.length > 0 && (
              <select
                value={selectedRecord.id}
                onChange={(e) => navigate(`/reports/${e.target.value}`)}
                aria-label="Select detection report"
                className="px-3 py-2 rounded-lg border border-slate-700 bg-[#0B1220] text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {detections.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fileName} — {d.riskLevel} ({d.riskScore}/100)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleSaveReport}
              disabled={savingReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#0B1220] hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
            >
              {selectedRecord.isSavedReport ? (
                <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Bookmark className="w-3.5 h-3.5" />
              )}
              {selectedRecord.isSavedReport ? 'Bookmarked' : 'Bookmark Report'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF Report
            </button>
            <Link
              to="/voice-analysis"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
            >
              <FileAudio className="w-3.5 h-3.5" />
              New Analysis
            </Link>
          </div>
        </div>

        {/* Report Summary Hero */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
            <RiskScoreGauge
              score={selectedRecord.riskScore}
              riskLevel={selectedRecord.riskLevel}
              label="Risk Score"
            />

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-semibold ${statusStyles}`}
                >
                  <StatusIcon className="w-4 h-4" />
                  {selectedRecord.classification} · {selectedRecord.riskLevel}
                </div>
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  Authenticity: {selectedRecord.authenticityScore}/100
                </span>
                <span className="font-mono text-xs text-slate-500">ID: {selectedRecord.id}</span>
              </div>

              <h2 className="font-display text-xl font-bold text-white truncate">
                {selectedRecord.fileName}
              </h2>

              <p className="text-xs font-mono text-slate-400 tabular-nums">
                Duration: {selectedRecord.duration.toFixed(2)}s · Timestamp:{' '}
                {selectedRecord.createdAt.toLocaleString()} · Source:{' '}
                {selectedRecord.sourceType === 'live_recording' ? 'Live Mic Monitoring' : 'Audio Upload'}
              </p>

              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                {selectedRecord.explanation}
              </p>

              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    <strong>Engine:</strong> {selectedRecord.modelStatus}
                  </span>
                </div>
                <span className="font-mono text-slate-400 tabular-nums">
                  {selectedRecord.confidence !== null
                    ? `Confidence: ${selectedRecord.confidence}%`
                    : 'Confidence: N/A (Experimental Heuristic)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations & Acoustic Features */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0B1220] p-5">
            <h3 className="font-display text-sm font-semibold text-white">Prevention Recommendations</h3>
            <ul className="mt-4 space-y-2.5">
              {selectedRecord.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0B1220] p-5">
            <h3 className="font-display text-sm font-semibold text-white">Extracted Signal Metrics</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-xs">
              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
                <span className="text-slate-400">RMS Energy</span>
                <p className="font-mono font-semibold text-white mt-1 tabular-nums">
                  {f.rmsEnergy.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
                <span className="text-slate-400">Zero-Crossing Rate</span>
                <p className="font-mono font-semibold text-white mt-1 tabular-nums">
                  {f.zeroCrossingRate.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
                <span className="text-slate-400">Spectral Centroid</span>
                <p className="font-mono font-semibold text-white mt-1 tabular-nums">
                  {Math.round(f.spectralCentroid)} Hz
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
                <span className="text-slate-400">Spectral Bandwidth</span>
                <p className="font-mono font-semibold text-white mt-1 tabular-nums">
                  {Math.round(f.spectralBandwidth)} Hz
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
                <span className="text-slate-400">Spectral Rolloff</span>
                <p className="font-mono font-semibold text-white mt-1 tabular-nums">
                  {Math.round(f.spectralRolloff)} Hz
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
                <span className="text-slate-400">Dynamic Range</span>
                <p className="font-mono font-semibold text-white mt-1 tabular-nums">
                  {(f.dynamicRange ?? 0).toFixed(1)} dB
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
                <span className="text-slate-400">Silence Ratio</span>
                <p className="font-mono font-semibold text-white mt-1 tabular-nums">
                  {((f.silenceRatio ?? 0) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
                <span className="text-slate-400">Peak Frequency</span>
                <p className="font-mono font-semibold text-white mt-1 tabular-nums">
                  {Math.round(f.peakFrequency)} Hz
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
                <span className="text-slate-400">Sample Rate</span>
                <p className="font-mono font-semibold text-white mt-1 tabular-nums">
                  {f.sampleRate} Hz
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Frequency Distribution + Spectrogram */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#0B1220] p-5">
            <h3 className="font-display text-sm font-semibold text-white">Frequency-Domain Distribution</h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">Normalized spectral band energy</p>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={f.frequencyBands || []} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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

          <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#0B1220] p-5 space-y-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-white">Spectrogram &amp; Waveform</h3>
              <p className="text-xs text-slate-400 mt-0.5">Time-frequency density and amplitude envelope</p>
            </div>
            <SpectrogramCanvas
              matrix={spectrogramMatrix}
              spectrumPreview={selectedRecord.spectrumPreview}
              height={150}
            />
            <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3">
              <WaveformPreviewCanvas peaks={selectedRecord.waveformPreview} progress={1} height={52} />
            </div>
          </div>
        </div>

        {signalIndicators && signalIndicators.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-5">
            <h3 className="font-display text-sm font-semibold text-white mb-3">
              Signal Indicator Findings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {signalIndicators.map((ind) => (
                <div key={ind.label} className="rounded-lg border border-slate-800 bg-[#060B14] p-3.5 text-xs">
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
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
