import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  History,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { DashboardLayout } from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { deleteDetectionRecord } from '../lib/detectionService';
import { downloadDetectionPdf } from '../lib/pdfReport';
import type { RiskLevel, VoiceDetectionRecord } from '../types/voiceguard';

type FilterType = 'ALL' | RiskLevel;
type SortType = 'newest' | 'oldest' | 'highest_risk' | 'lowest_auth';

const PAGE_SIZE = 10;

export function HistoryPage() {
  const { user, detections, dataLoading, dataMode, deleteDemoDetection } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [sortBy, setSortBy] = useState<SortType>('newest');
  const [page, setPage] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState<VoiceDetectionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

  const filteredDetections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = detections.filter((d) => {
      if (filter !== 'ALL' && d.riskLevel !== filter) return false;
      if (q && !d.fileName.toLowerCase().includes(q) && !d.id.toLowerCase().includes(q)) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return a.createdAt.getTime() - b.createdAt.getTime();
      if (sortBy === 'highest_risk') return b.riskScore - a.riskScore;
      if (sortBy === 'lowest_auth') return a.authenticityScore - b.authenticityScore;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [detections, filter, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredDetections.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filteredDetections.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (dataMode === 'demo') {
      deleteDemoDetection(deleteTarget.id);
      pushToast('Demo record removed', 'info');
      setDeleteTarget(null);
      return;
    }
    if (!user) return;
    setDeleting(true);
    try {
      await deleteDetectionRecord(user.uid, deleteTarget.id);
      pushToast('Call detection record deleted', 'success');
      setDeleteTarget(null);
    } catch {
      pushToast('Failed to delete record', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout
      title="Call History"
      subtitle="Searchable audit log of analyzed voice recordings and live microphone sessions"
    >
      <div className="space-y-6">
        {/* Toolbar */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#060B14] border border-slate-800">
            {(
              [
                { key: 'ALL', label: 'All' },
                { key: 'Low Risk', label: 'Low Risk' },
                { key: 'Medium Risk', label: 'Medium Risk' },
                { key: 'High Risk', label: 'High Risk' },
                { key: 'Critical Risk', label: 'Critical Risk' },
              ] as Array<{ key: FilterType; label: string }>
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setFilter(tab.key);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === tab.key
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 flex-1 justify-end min-w-[240px]">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search session or detection ID..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-700 bg-[#060B14] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
              aria-label="Sort call history"
              className="px-3 py-2 rounded-lg border border-slate-700 bg-[#060B14] text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest_risk">Highest Risk</option>
              <option value="lowest_auth">Lowest Authenticity</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setPage(1);
                pushToast('Call history synchronized', 'info');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-[#060B14] hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] overflow-hidden">
          {dataLoading && dataMode === 'live' ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-slate-800/50 animate-pulse" />
              ))}
            </div>
          ) : paginated.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-9 h-9 text-slate-500 mx-auto" />
              <h2 className="font-display text-base font-semibold text-white mt-3">
                {detections.length === 0 ? 'No call records yet' : 'No matching records found'}
              </h2>
              <p className="text-xs text-slate-400 mt-1.5">
                {detections.length === 0
                  ? 'Analyze an audio upload or live microphone recording to populate Call History.'
                  : 'Adjust your search query or risk level filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#080E1A] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4">Detection ID</th>
                    <th className="py-3.5 px-4">Audio / Session Name</th>
                    <th className="py-3.5 px-4">Date &amp; Time</th>
                    <th className="py-3.5 px-4">Classification</th>
                    <th className="py-3.5 px-4 text-right">Authenticity</th>
                    <th className="py-3.5 px-4">Risk Level</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {paginated.map((det) => {
                    const riskColor =
                      det.riskLevel === 'Critical Risk' || det.riskLevel === 'High Risk'
                        ? 'text-red-400'
                        : det.riskLevel === 'Medium Risk'
                          ? 'text-amber-400'
                          : 'text-emerald-400';

                    const statusLabel = det.isSavedReport
                      ? 'Bookmarked'
                      : det.riskScore > 65
                        ? 'Flagged'
                        : 'Completed';

                    return (
                      <tr key={det.id} className="hover:bg-slate-800/35 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {det.id.slice(0, 15)}
                        </td>
                        <td className="py-3 px-4 font-medium text-white max-w-[200px] truncate">
                          {det.fileName}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300 tabular-nums whitespace-nowrap">
                          {det.createdAt.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-slate-200 whitespace-nowrap">
                          {det.classification}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-white text-right tabular-nums whitespace-nowrap">
                          {det.authenticityScore}%
                        </td>
                        <td className={`py-3 px-4 font-semibold whitespace-nowrap ${riskColor}`}>
                          {det.riskLevel}
                        </td>
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">{statusLabel}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => navigate(`/reports/${det.id}`)}
                              className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                              title="View complete analysis"
                              aria-label={`View analysis for ${det.fileName}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                downloadDetectionPdf(det);
                                pushToast('PDF report downloaded', 'success');
                              }}
                              className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Download report"
                              aria-label={`Download PDF for ${det.fileName}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(det)}
                              className="p-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/15 transition-colors"
                              title="Delete record"
                              aria-label={`Delete ${det.fileName}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filteredDetections.length > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono tabular-nums">
                Page {safePage} of {totalPages} ({filteredDetections.length} records)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Call Detection Record"
        description={`Permanently delete "${deleteTarget?.fileName}" (${deleteTarget?.id})? This action cannot be undone.`}
        confirmLabel="Delete Record"
        destructive
        busy={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
