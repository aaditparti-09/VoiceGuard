import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { updateAlertInvestigation } from '../lib/detectionService';
import type { AlertSeverity, AlertStatus, SecurityAlertRecord } from '../types/voiceguard';

export function ThreatDetectionPage() {
  const { user, alerts, detections, dataMode, updateDemoAlert } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [severityFilter, setSeverityFilter] = useState<'all' | AlertSeverity>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AlertStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedAlert, setSelectedAlert] = useState<SecurityAlertRecord | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<AlertStatus>('open');
  const [savingUpdate, setSavingUpdate] = useState(false);

  useEffect(() => {
    const alertIdParam = searchParams.get('alert');
    if (alertIdParam) {
      const match = alerts.find((a) => a.id === alertIdParam);
      if (match) {
        setSelectedAlert(match);
        setNotesDraft(match.investigationNotes);
        setStatusDraft(match.status);
      }
    }
  }, [searchParams, alerts]);

  const openAlertModal = (alert: SecurityAlertRecord) => {
    setSelectedAlert(alert);
    setNotesDraft(alert.investigationNotes || '');
    setStatusDraft(alert.status);
  };

  const summary = useMemo(() => {
    const critical = alerts.filter((a) => a.severity === 'critical').length;
    const open = alerts.filter((a) => a.status === 'open').length;
    const investigating = alerts.filter((a) => a.status === 'under_investigation').length;
    const resolved = alerts.filter((a) => a.status === 'resolved').length;
    return { critical, open, investigating, resolved };
  }, [alerts]);

  const suspiciousSamples = useMemo(
    () => detections.filter((d) => d.riskScore > 30),
    [detections]
  );

  const filteredAlerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return alerts.filter((a) => {
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (
        q &&
        !a.detectionId.toLowerCase().includes(q) &&
        !a.id.toLowerCase().includes(q) &&
        !(a.fileName || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [alerts, severityFilter, statusFilter, searchQuery]);

  const handleSaveInvestigation = async (nextStatus: AlertStatus) => {
    if (!selectedAlert) return;
    if (dataMode === 'demo') {
      updateDemoAlert(selectedAlert.id, {
        status: nextStatus,
        investigationNotes: notesDraft,
        isRead: true,
      });
      setSelectedAlert({
        ...selectedAlert,
        status: nextStatus,
        investigationNotes: notesDraft,
        isRead: true,
      });
      setStatusDraft(nextStatus);
      pushToast('Demo alert updated', 'success');
      return;
    }

    if (!user) return;
    if (!user.emailVerified) {
      pushToast('Verification required', 'warning', 'Verify your email to persist investigation updates.');
      return;
    }

    setSavingUpdate(true);
    try {
      await updateAlertInvestigation(user.uid, selectedAlert.id, {
        status: nextStatus,
        investigationNotes: notesDraft,
        isRead: true,
      });
      setSelectedAlert({
        ...selectedAlert,
        status: nextStatus,
        investigationNotes: notesDraft,
        isRead: true,
      });
      setStatusDraft(nextStatus);
      pushToast('Threat investigation updated in Firestore', 'success');
    } catch {
      pushToast('Failed to update threat alert', 'error');
    } finally {
      setSavingUpdate(false);
    }
  };

  return (
    <DashboardLayout
      title="Threat Detection"
      subtitle="Detected threats, critical alerts, suspicious voice samples, and incident triage"
    >
      <div className="space-y-6">
        {/* Threat Summary KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Critical Alerts</span>
              <ShieldAlert className="w-4 h-4 text-red-400" />
            </div>
            <p className="font-mono text-2xl font-bold text-red-400 mt-2 tabular-nums">
              {summary.critical}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Open Threats</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <p className="font-mono text-2xl font-bold text-amber-400 mt-2 tabular-nums">
              {summary.open}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Under Investigation</span>
              <FileSearch className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="font-mono text-2xl font-bold text-cyan-300 mt-2 tabular-nums">
              {summary.investigating}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Resolved</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="font-mono text-2xl font-bold text-emerald-400 mt-2 tabular-nums">
              {summary.resolved}
            </p>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#060B14] border border-slate-800">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                    severityFilter === sev
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | AlertStatus)}
              aria-label="Filter by investigation status"
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#060B14] text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="under_investigation">Under Investigation</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="relative flex-1 max-w-xs min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search detection ID or filename..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-700 bg-[#060B14] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Alerts Table */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">
              Security Alerts &amp; Threat Queue ({filteredAlerts.length})
            </h2>
          </div>

          {filteredAlerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No threat alerts match the current filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#080E1A] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Detection ID</th>
                    <th className="py-3 px-4">Alert / Session</th>
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Threat Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {filteredAlerts.map((alert) => {
                    const sevColor =
                      alert.severity === 'critical' || alert.severity === 'high'
                        ? 'text-red-400'
                        : alert.severity === 'medium'
                          ? 'text-amber-400'
                          : 'text-emerald-400';

                    const statusText =
                      alert.status === 'resolved'
                        ? 'Resolved'
                        : alert.status === 'under_investigation'
                          ? 'Under Investigation'
                          : 'Open';

                    return (
                      <tr key={alert.id} className="hover:bg-slate-800/35 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {alert.detectionId.slice(0, 16)}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-white">{alert.title}</p>
                          <p className="text-slate-400 mt-0.5 line-clamp-1">{alert.message}</p>
                        </td>
                        <td className={`py-3 px-4 font-semibold uppercase whitespace-nowrap ${sevColor}`}>
                          {alert.severity}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                          {alert.createdAt.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-slate-200 whitespace-nowrap">{statusText}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openAlertModal(alert)}
                              className="px-2.5 py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-slate-200 transition-colors"
                            >
                              Investigate
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/reports/${alert.detectionId}`)}
                              className="px-2.5 py-1.5 rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/15 transition-colors"
                            >
                              Report
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
        </div>

        {/* Suspicious Voice Samples Summary */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-5">
          <h2 className="font-display text-sm font-semibold text-white mb-3">
            Flagged Voice Samples (Risk Score &gt; 30)
          </h2>
          {suspiciousSamples.length === 0 ? (
            <p className="text-xs text-slate-400">No suspicious or high-risk voice samples flagged yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {suspiciousSamples.slice(0, 6).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(`/reports/${s.id}`)}
                  className="text-left rounded-lg border border-slate-800 bg-[#060B14] hover:border-slate-700 p-3.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-slate-400 truncate">{s.id.slice(0, 14)}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        s.riskScore > 65 ? 'text-red-400' : 'text-amber-400'
                      }`}
                    >
                      Risk {s.riskScore}/100
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-white mt-1.5 truncate">{s.fileName}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {s.classification} · {s.createdAt.toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Investigation Drawer/Modal */}
      {selectedAlert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-lg w-full rounded-xl border border-slate-800 bg-[#0B1220] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase text-red-400">
                  {selectedAlert.severity} severity · {selectedAlert.riskLevel}
                </p>
                <h3 className="font-display text-lg font-bold text-white mt-1">
                  {selectedAlert.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAlert(null)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Close investigation modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{selectedAlert.message}</p>

            <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3 text-xs font-mono text-slate-300 space-y-1">
              <div>Alert ID: {selectedAlert.id}</div>
              <div>Detection ID: {selectedAlert.detectionId}</div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {selectedAlert.createdAt.toLocaleString()}
              </div>
            </div>

            <div>
              <label htmlFor="inv-notes" className="block text-xs font-medium text-slate-300 mb-1.5">
                Investigation Notes
              </label>
              <textarea
                id="inv-notes"
                rows={4}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Document callback verification outcome, caller verification status, or incident ticket reference..."
                className="w-full rounded-lg border border-slate-700 bg-[#060B14] p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const id = selectedAlert.detectionId;
                  setSelectedAlert(null);
                  navigate(`/reports/${id}`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-cyan-300"
              >
                View Analysis Report
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={savingUpdate}
                  onClick={() => handleSaveInvestigation('under_investigation')}
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                    statusDraft === 'under_investigation'
                      ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                      : 'border-slate-700 hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  Mark Investigating
                </button>
                <button
                  type="button"
                  disabled={savingUpdate}
                  onClick={() => handleSaveInvestigation('resolved')}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                >
                  {savingUpdate ? 'Saving...' : 'Mark Resolved'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
