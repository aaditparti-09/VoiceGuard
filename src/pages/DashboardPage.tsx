import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Database,
  Eye,
  FileAudio,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardLayout } from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const {
    detections,
    alerts,
    dataLoading,
    dataMode,
    setDataMode,
    systemHealth,
    refreshSystemHealth,
  } = useAuth();
  const navigate = useNavigate();

  const metrics = useMemo(() => {
    const total = detections.length;
    const authentic = detections.filter((d) => d.riskLevel === 'Low Risk').length;
    const suspicious = detections.filter((d) => d.riskLevel === 'Medium Risk').length;
    const impersonation = detections.filter(
      (d) => d.riskLevel === 'High Risk' || d.riskLevel === 'Critical Risk'
    ).length;
    const avgAuth =
      total > 0
        ? (detections.reduce((acc, d) => acc + d.authenticityScore, 0) / total).toFixed(1)
        : null;

    return { total, authentic, suspicious, impersonation, avgAuth };
  }, [detections]);

  const last7DaysData = useMemo(() => {
    const days: Array<{
      dateLabel: string;
      dateKey: string;
      authentic: number;
      suspicious: number;
      highRisk: number;
      critical: number;
    }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      days.push({
        dateLabel: `${weekday} ${dayNum}`,
        dateKey: key,
        authentic: 0,
        suspicious: 0,
        highRisk: 0,
        critical: 0,
      });
    }

    for (const det of detections) {
      const key = det.createdAt.toISOString().slice(0, 10);
      const bucket = days.find((b) => b.dateKey === key);
      if (bucket) {
        if (det.riskLevel === 'Low Risk') bucket.authentic++;
        else if (det.riskLevel === 'Medium Risk') bucket.suspicious++;
        else if (det.riskLevel === 'High Risk') bucket.highRisk++;
        else bucket.critical++;
      }
    }
    return days;
  }, [detections]);

  const donutData = useMemo(() => {
    const low = detections.filter((d) => d.riskLevel === 'Low Risk').length;
    const med = detections.filter((d) => d.riskLevel === 'Medium Risk').length;
    const high = detections.filter((d) => d.riskLevel === 'High Risk').length;
    const crit = detections.filter((d) => d.riskLevel === 'Critical Risk').length;
    return [
      { name: 'Authentic', value: low, color: '#10B981' },
      { name: 'Medium risk', value: med, color: '#F59E0B' },
      { name: 'High risk', value: high, color: '#F97316' },
      { name: 'Critical', value: crit, color: '#EF4444' },
    ];
  }, [detections]);

  const nonZeroDonut = useMemo(() => donutData.filter((d) => d.value > 0), [donutData]);

  const statusRows = [
    {
      name: 'Authentication Service',
      ok: systemHealth.authOperational,
      label: systemHealth.authOperational ? 'Connected' : 'Unauthenticated',
    },
    {
      name: 'Database Connection',
      ok: systemHealth.firestoreOperational === true,
      pending: systemHealth.firestoreOperational === null,
      label:
        systemHealth.firestoreOperational === null
          ? 'Checking...'
          : systemHealth.firestoreOperational
            ? 'Firestore Connected'
            : 'Offline / Error',
    },
    {
      name: 'Audio Processing Engine',
      ok: systemHealth.audioEngineReady,
      label: systemHealth.audioEngineReady ? 'Web Audio API Ready' : 'Unsupported Browser',
    },
    {
      name: 'Detection Engine',
      ok: systemHealth.apiConnected === true,
      caution: systemHealth.apiConnected === true && !systemHealth.modelConfigured,
      label: systemHealth.modelConfigured
        ? 'External ML Connected'
        : 'Experimental Signal Mode',
    },
    {
      name: 'API Connection',
      ok: systemHealth.apiConnected === true,
      pending: systemHealth.apiConnected === null,
      label:
        systemHealth.apiConnected === null
          ? 'Checking...'
          : systemHealth.apiConnected
            ? 'Operational (/api/analyze-voice)'
            : 'Unreachable',
    },
  ];

  return (
    <DashboardLayout
      title="Security Operations Overview"
      subtitle="Enterprise voice-channel posture — voice cloning and impersonation monitoring across the call estate."
      headerActions={
        <>
          <Link
            to="/voice-analysis"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <FileAudio className="w-3.5 h-3.5" />
            Analyse Voice File
          </Link>
          <Link
            to="/live-monitoring"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#1E2D44] bg-[#0C1524] hover:bg-[#132036] text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            Live Monitoring
          </Link>
        </>
      }
    >
      {/* 5 Top KPI Stat Cards matching reference layout */}
      {dataLoading && dataMode === 'live' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div key={idx} className="h-[116px] rounded-xl border border-[#18253A] bg-[#0C1524] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
          <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-5 flex flex-col justify-between min-h-[116px]">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-snug">
                Total Calls Monitored
              </span>
              <span className="w-7 h-7 rounded-md border border-cyan-500/35 bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                <Radio className="w-3.5 h-3.5" />
              </span>
            </div>
            <p className="font-display text-3xl font-bold text-white mt-3 tabular-nums leading-none">
              {metrics.total}
            </p>
          </div>

          <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-5 flex flex-col justify-between min-h-[116px]">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-snug">
                Authentic Calls
              </span>
              <span className="w-7 h-7 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
            </div>
            <p className="font-display text-3xl font-bold text-white mt-3 tabular-nums leading-none">
              {metrics.authentic}
            </p>
          </div>

          <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-5 flex flex-col justify-between min-h-[116px]">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-snug">
                Suspicious Calls
              </span>
              <span className="w-7 h-7 rounded-md border border-amber-500/35 bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
            </div>
            <p className="font-display text-3xl font-bold text-white mt-3 tabular-nums leading-none">
              {metrics.suspicious}
            </p>
          </div>

          <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-5 flex flex-col justify-between min-h-[116px]">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-snug">
                Impersonation Attempts
              </span>
              <span className="w-7 h-7 rounded-md border border-red-500/35 bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-3.5 h-3.5" />
              </span>
            </div>
            <p className="font-display text-3xl font-bold text-white mt-3 tabular-nums leading-none">
              {metrics.impersonation}
            </p>
          </div>

          <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-5 flex flex-col justify-between min-h-[116px]">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-snug">
                Avg Authenticity Score
              </span>
              <span className="w-7 h-7 rounded-md border border-teal-500/35 bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0">
                <Activity className="w-3.5 h-3.5" />
              </span>
            </div>
            <p className="font-display text-3xl font-bold text-white mt-3 tabular-nums leading-none">
              {metrics.avgAuth !== null ? `${metrics.avgAuth}%` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Empty State when Live Mode has 0 detections */}
      {!dataLoading && metrics.total === 0 ? (
        <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-8 sm:p-10 text-center mb-5">
          <FileAudio className="w-10 h-10 text-cyan-400 mx-auto" />
          <h2 className="font-display text-lg font-semibold text-white mt-3">
            No detection records stored in Live Mode
          </h2>
          <p className="text-sm text-slate-400 mt-1.5 max-w-lg mx-auto leading-relaxed">
            Upload an audio file or capture microphone audio to populate real Firestore metrics, or switch to Demonstration Data to preview sample SOC telemetry.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Link
              to="/voice-analysis"
              className="px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
            >
              Run Voice Analysis
            </Link>
            <Link
              to="/live-monitoring"
              className="px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-colors"
            >
              Start Live Monitoring
            </Link>
            <button
              type="button"
              onClick={() => setDataMode('demo')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              Preview Demo Dataset
            </button>
          </div>
        </div>
      ) : (
        /* Main Charts Row matching reference screenshot proportions */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
          <div className="lg:col-span-8 rounded-xl border border-[#18253A] bg-[#0C1524] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-sm font-semibold text-white">
                Call monitoring — last 7 days
              </h2>
            </div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last7DaysData} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="#172336" vertical={false} />
                  <XAxis dataKey="dateLabel" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.06)' }}
                    contentStyle={{
                      backgroundColor: '#080E18',
                      borderColor: '#1E2D44',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="authentic" stackId="calls" name="Authentic" fill="#10B981" />
                  <Bar dataKey="suspicious" stackId="calls" name="Medium risk" fill="#F59E0B" />
                  <Bar dataKey="highRisk" stackId="calls" name="High risk" fill="#F97316" />
                  <Bar
                    dataKey="critical"
                    stackId="calls"
                    name="Critical"
                    fill="#EF4444"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 rounded-xl border border-[#18253A] bg-[#0C1524] p-5 flex flex-col justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Authentic vs suspicious distribution
              </h2>
            </div>
            <div className="h-[205px] w-full my-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={nonZeroDonut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={84}
                    paddingAngle={1}
                    stroke="#0C1524"
                    strokeWidth={2}
                  >
                    {nonZeroDonut.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#080E18',
                      borderColor: '#1E2D44',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 pt-2 text-xs">
              {donutData.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-slate-300 truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="font-mono font-semibold text-white tabular-nums">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Row: Recent alerts + System status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 rounded-xl border border-[#18253A] bg-[#0C1524] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#18253A] flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">Recent alerts</h2>
            <Link to="/threat-detection" className="text-xs font-medium text-cyan-400 hover:text-cyan-300">
              Open Threat Detection →
            </Link>
          </div>

          {alerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No security alerts triggered yet. Alerts appear automatically when a detection exceeds Risk Score 30.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#18253A] bg-[#09101C] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Alert ID</th>
                    <th className="py-3 px-4">Session / Audio</th>
                    <th className="py-3 px-4">Risk Level</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18253A]/80 text-xs">
                  {alerts.slice(0, 5).map((alert) => {
                    const riskColor =
                      alert.riskLevel === 'Critical Risk' || alert.riskLevel === 'High Risk'
                        ? 'text-red-400'
                        : alert.riskLevel === 'Medium Risk'
                          ? 'text-amber-400'
                          : 'text-emerald-400';

                    const statusLabel =
                      alert.status === 'resolved'
                        ? 'Resolved'
                        : alert.status === 'under_investigation'
                          ? 'Investigating'
                          : 'Open';

                    return (
                      <tr key={alert.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {alert.id.slice(0, 14)}
                        </td>
                        <td className="py-3 px-4 font-medium text-white max-w-[180px] truncate">
                          {alert.fileName || alert.title}
                        </td>
                        <td className={`py-3 px-4 font-semibold whitespace-nowrap ${riskColor}`}>
                          {alert.riskLevel}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                          {alert.createdAt.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap">{statusLabel}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/threat-detection?alert=${encodeURIComponent(alert.id)}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#1E2D44] hover:bg-[#132036] text-slate-200 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 rounded-xl border border-[#18253A] bg-[#0C1524] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-sm font-semibold text-white">System status</h2>
              <button
                type="button"
                onClick={() => void refreshSystemHealth()}
                className="p-1.5 rounded-lg border border-[#18253A] hover:bg-[#132036] text-slate-400 hover:text-white transition-colors"
                title="Re-check service health"
                aria-label="Refresh system status"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {statusRows.map((row) => {
                const dotColor = row.pending
                  ? 'bg-slate-500'
                  : row.caution
                    ? 'bg-amber-400'
                    : row.ok
                      ? 'bg-emerald-400'
                      : 'bg-red-400';

                const textColor = row.pending
                  ? 'text-slate-400'
                  : row.caution
                    ? 'text-amber-300'
                    : row.ok
                      ? 'text-emerald-300'
                      : 'text-red-300';

                return (
                  <div
                    key={row.name}
                    className="flex items-center justify-between gap-2 py-2 border-b border-[#18253A]/70 last:border-b-0 text-xs"
                  >
                    <span className="text-slate-300">{row.name}</span>
                    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${textColor}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                      {row.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-[#18253A] leading-relaxed">
            Status reflects real browser and server health probes. External PyTorch/TensorFlow model API is optional.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
