import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpDown,
  ChevronRight,
  Database,
  ExternalLink,
  FileAudio,
  Globe,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { updateDetectionLanguage } from '../lib/detectionService';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  type VoiceDetectionRecord,
} from '../types/voiceguard';

type LanguageSortKey = 'exposure' | 'attacks' | 'total';

interface LanguageStatRow {
  language: SupportedLanguage;
  totalCalls: number;
  attacks: number;
  authentic: number;
  exposurePercentage: number;
  avgRiskScore: number | null;
  records: VoiceDetectionRecord[];
}

export function ExposureByLanguagePanel() {
  const { user, detections, dataLoading, dataMode, setDataMode } = useAuth();
  const { pushToast } = useToast();

  const [sortBy, setSortBy] = useState<LanguageSortKey>('exposure');
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignDrafts, setAssignDrafts] = useState<Record<string, SupportedLanguage>>({});
  const [showUntagged, setShowUntagged] = useState(false);

  const { rows, untaggedRecords, totalTagged, totalAttacks } = useMemo(() => {
    const grouped = new Map<SupportedLanguage, VoiceDetectionRecord[]>();
    for (const lang of SUPPORTED_LANGUAGES) {
      grouped.set(lang, []);
    }

    const untagged: VoiceDetectionRecord[] = [];
    for (const det of detections) {
      if (det.language && grouped.has(det.language)) {
        grouped.get(det.language)!.push(det);
      } else {
        untagged.push(det);
      }
    }

    let taggedCount = 0;
    let attackSum = 0;

    const computed: LanguageStatRow[] = SUPPORTED_LANGUAGES.map((language) => {
      const records = grouped.get(language) || [];
      const totalCalls = records.length;
      const attacks = records.filter((r) => r.riskScore > 30).length;
      const authentic = totalCalls - attacks;
      const exposurePercentage = totalCalls > 0 ? (attacks / totalCalls) * 100 : 0;
      const avgRiskScore =
        totalCalls > 0
          ? Math.round(records.reduce((sum, r) => sum + r.riskScore, 0) / totalCalls)
          : null;

      taggedCount += totalCalls;
      attackSum += attacks;

      return {
        language,
        totalCalls,
        attacks,
        authentic,
        exposurePercentage,
        avgRiskScore,
        records,
      };
    });

    computed.sort((a, b) => {
      if (sortBy === 'exposure') {
        if (b.exposurePercentage !== a.exposurePercentage) {
          return b.exposurePercentage - a.exposurePercentage;
        }
        if (b.attacks !== a.attacks) return b.attacks - a.attacks;
        if (b.totalCalls !== a.totalCalls) return b.totalCalls - a.totalCalls;
      } else if (sortBy === 'attacks') {
        if (b.attacks !== a.attacks) return b.attacks - a.attacks;
        if (b.exposurePercentage !== a.exposurePercentage) {
          return b.exposurePercentage - a.exposurePercentage;
        }
      } else if (sortBy === 'total') {
        if (b.totalCalls !== a.totalCalls) return b.totalCalls - a.totalCalls;
        if (b.exposurePercentage !== a.exposurePercentage) {
          return b.exposurePercentage - a.exposurePercentage;
        }
      }
      return SUPPORTED_LANGUAGES.indexOf(a.language) - SUPPORTED_LANGUAGES.indexOf(b.language);
    });

    return {
      rows: computed,
      untaggedRecords: untagged,
      totalTagged: taggedCount,
      totalAttacks: attackSum,
    };
  }, [detections, sortBy]);

  const activeRow = useMemo(
    () => (selectedLanguage ? rows.find((r) => r.language === selectedLanguage) || null : null),
    [rows, selectedLanguage]
  );

  const handleAssignLanguage = async (record: VoiceDetectionRecord) => {
    const chosen = assignDrafts[record.id] || 'English';
    if (!user || dataMode === 'demo') return;
    if (!user.emailVerified) {
      pushToast('Verification required', 'warning', 'Verify your email to update Firestore scan records.');
      return;
    }

    setAssigningId(record.id);
    try {
      await updateDetectionLanguage(user.uid, record.id, chosen);
      pushToast(`Assigned ${chosen} to ${record.fileName}`, 'success');
    } catch {
      pushToast('Failed to update scan language', 'error');
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <section
      aria-labelledby="exposure-by-language-heading"
      className="rounded-xl border border-[#18253A] bg-[#0C1524] p-5 sm:p-6"
    >
      {/* Header & Sort Bar */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#18253A]">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 id="exposure-by-language-heading" className="font-display text-sm sm:text-base font-semibold text-white">
              Exposure by Language
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Dynamic impersonation &amp; suspicious call exposure computed from{' '}
            {dataMode === 'demo' ? 'Demo Dataset' : 'Cloud Firestore'} ({totalAttacks} attacks / {totalTagged} tagged calls)
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-lg border border-[#18253A] bg-[#080E18]">
          <span className="inline-flex items-center gap-1 px-2 text-[11px] text-slate-400">
            <ArrowUpDown className="w-3 h-3" />
            Sort
          </span>
          {(
            [
              { id: 'exposure', label: 'Highest Exposure' },
              { id: 'attacks', label: 'Attacks' },
              { id: 'total', label: 'Total Calls' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSortBy(option.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                sortBy === option.id
                  ? 'bg-[#10243E] text-cyan-300 border border-[#1B3A5C]'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {dataLoading && dataMode === 'live' ? (
        <div className="py-4 space-y-3" aria-busy="true" aria-label="Loading language exposure metrics">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <div key={lang} className="flex items-center gap-4 py-1.5">
              <div className="w-24 h-4 rounded bg-slate-800 animate-pulse shrink-0" />
              <div className="flex-1 h-2.5 rounded-full bg-[#162235] animate-pulse" />
              <div className="w-24 h-4 rounded bg-slate-800 animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      ) : detections.length === 0 ? (
        /* Empty State when no records exist in Firestore */
        <div className="py-8 text-center">
          <FileAudio className="w-9 h-9 text-cyan-400 mx-auto" />
          <h3 className="font-display text-sm font-semibold text-white mt-3">
            No language telemetry recorded in Firestore yet
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            Analyze an audio recording with a spoken language selected, or switch to Demo Dataset to explore live exposure sorting and breakdowns.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
            <Link
              to="/voice-analysis"
              className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
            >
              Analyse Voice File
            </Link>
            <button
              type="button"
              onClick={() => setDataMode('demo')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              Preview Demo Dataset
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Language Horizontal Exposure Bars */}
          <div className="space-y-1.5">
            {rows.map((row) => {
              const isSelected = selectedLanguage === row.language;
              const pct = Math.min(100, Math.max(0, row.exposurePercentage));

              return (
                <button
                  key={row.language}
                  type="button"
                  onClick={() =>
                    setSelectedLanguage((prev) => (prev === row.language ? null : row.language))
                  }
                  aria-expanded={isSelected}
                  className={`w-full text-left flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3 py-2.5 rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-[#10243E]/70 border-[#1B3A5C]'
                      : 'bg-[#09101C]/60 border-transparent hover:bg-[#101A2C] hover:border-[#18253A]'
                  }`}
                >
                  {/* Language Name */}
                  <div className="flex items-center justify-between sm:w-28 shrink-0">
                    <span className="text-xs sm:text-sm font-medium text-slate-200">{row.language}</span>
                    <span className="sm:hidden font-mono text-xs text-slate-300 tabular-nums">
                      {row.attacks}/{row.totalCalls} ({pct.toFixed(1)}%)
                    </span>
                  </div>

                  {/* Muted Blue-Grey Track + Red Exposure Bar */}
                  <div className="flex-1 h-2.5 rounded-full bg-[#1C2A42] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#EF4444] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Attack / Total Counts & Exposure % */}
                  <div className="hidden sm:flex items-center justify-end gap-3 w-44 shrink-0 font-mono text-xs tabular-nums">
                    <span className="text-slate-400">
                      <span className="text-white font-semibold">{row.attacks}</span>/{row.totalCalls}{' '}
                      <span className="text-[11px] text-slate-500">calls</span>
                    </span>
                    <span
                      className={`w-14 text-right font-semibold ${
                        pct > 0 ? 'text-red-400' : 'text-slate-500'
                      }`}
                    >
                      {pct.toFixed(1)}%
                    </span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                        isSelected ? 'rotate-90 text-cyan-400' : ''
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Clickable Language Details Panel */}
          {activeRow && (
            <div className="rounded-xl border border-[#1B3A5C] bg-[#080E18] p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                    <h3 className="font-display text-sm font-semibold text-white">
                      {activeRow.language} — Language Exposure Breakdown
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Exposure formula: ({activeRow.attacks} suspicious/attack calls ÷ {activeRow.totalCalls} total calls) × 100 ={' '}
                    <span className="font-mono text-red-400 font-semibold">
                      {activeRow.exposurePercentage.toFixed(1)}%
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedLanguage(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Close language details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg border border-[#18253A] bg-[#0C1524] p-3">
                  <span className="text-slate-400">Total Calls</span>
                  <p className="font-mono text-lg font-bold text-white mt-0.5 tabular-nums">
                    {activeRow.totalCalls}
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#0C1524] p-3">
                  <span className="text-slate-400">Suspicious / Attacks</span>
                  <p className="font-mono text-lg font-bold text-red-400 mt-0.5 tabular-nums">
                    {activeRow.attacks}
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#0C1524] p-3">
                  <span className="text-slate-400">Authentic Calls</span>
                  <p className="font-mono text-lg font-bold text-emerald-400 mt-0.5 tabular-nums">
                    {activeRow.authentic}
                  </p>
                </div>
                <div className="rounded-lg border border-[#18253A] bg-[#0C1524] p-3">
                  <span className="text-slate-400">Mean Risk Score</span>
                  <p className="font-mono text-lg font-bold text-cyan-300 mt-0.5 tabular-nums">
                    {activeRow.avgRiskScore !== null ? `${activeRow.avgRiskScore}/100` : '—'}
                  </p>
                </div>
              </div>

              {activeRow.records.length === 0 ? (
                <div className="rounded-lg border border-[#18253A] bg-[#0C1524] p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="text-slate-400">
                    No calls analyzed in {activeRow.language} yet.
                  </span>
                  <Link
                    to={`/voice-analysis?language=${encodeURIComponent(activeRow.language)}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-colors"
                  >
                    Analyse {activeRow.language} Audio
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[#18253A]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#18253A] bg-[#0C1524] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="py-2.5 px-3">Audio Session</th>
                        <th className="py-2.5 px-3">Risk Level</th>
                        <th className="py-2.5 px-3 text-right">Risk Score</th>
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3 text-right">Report</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#18253A] text-xs bg-[#09101C]">
                      {activeRow.records.map((rec) => {
                        const riskColor =
                          rec.riskScore > 65
                            ? 'text-red-400'
                            : rec.riskScore > 30
                              ? 'text-amber-400'
                              : 'text-emerald-400';
                        return (
                          <tr key={rec.id} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-3 font-medium text-white max-w-[200px] truncate">
                              {rec.fileName}
                            </td>
                            <td className={`py-2.5 px-3 font-semibold whitespace-nowrap ${riskColor}`}>
                              {rec.riskLevel}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-200 text-right tabular-nums">
                              {rec.riskScore}/100
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                              {rec.createdAt.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <Link
                                to={`/reports/${rec.id}`}
                                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium"
                              >
                                View
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Untagged Firestore Records Helper (only if legacy records lack a language field) */}
          {untaggedRecords.length > 0 && dataMode === 'live' && (
            <div className="rounded-lg border border-[#18253A] bg-[#080E18] px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-400">
                  <strong className="text-slate-200">{untaggedRecords.length}</strong> Firestore detection record
                  {untaggedRecords.length === 1 ? '' : 's'} do not have a language tag yet.
                </span>
                <button
                  type="button"
                  onClick={() => setShowUntagged((prev) => !prev)}
                  className="text-cyan-400 hover:text-cyan-300 font-medium"
                >
                  {showUntagged ? 'Hide untagged scans' : 'Assign languages'}
                </button>
              </div>

              {showUntagged && (
                <div className="mt-3 pt-3 border-t border-[#18253A] space-y-2">
                  {untaggedRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="text-slate-200 font-medium truncate max-w-xs">{rec.fileName}</p>
                        <p className="text-[11px] font-mono text-slate-500">
                          {rec.riskLevel} ({rec.riskScore}/100) · {rec.createdAt.toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Assign language for ${rec.fileName}`}
                          value={assignDrafts[rec.id] || 'English'}
                          onChange={(e) =>
                            setAssignDrafts((prev) => ({
                              ...prev,
                              [rec.id]: e.target.value as SupportedLanguage,
                            }))
                          }
                          className="px-2.5 py-1 rounded border border-[#1E2D44] bg-[#0C1524] text-xs text-slate-200"
                        >
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <option key={lang} value={lang}>
                              {lang}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={assigningId === rec.id}
                          onClick={() => handleAssignLanguage(rec)}
                          className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-60"
                        >
                          {assigningId === rec.id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
