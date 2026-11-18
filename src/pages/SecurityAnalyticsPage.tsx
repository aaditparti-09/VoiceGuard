import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardLayout } from '../components/DashboardLayout';
import { ExposureByLanguagePanel } from '../components/ExposureByLanguagePanel';
import { useAuth } from '../context/AuthContext';

export function SecurityAnalyticsPage() {
  const { detections, alerts, dataMode } = useAuth();

  const chronologicalTrend = useMemo(() => {
    return [...detections]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-20)
      .map((d, idx) => ({
        index: `#${idx + 1}`,
        name: d.fileName,
        riskScore: d.riskScore,
        authenticityScore: d.authenticityScore,
      }));
  }, [detections]);

  const sourceBreakdown = useMemo(() => {
    const uploads = detections.filter((d) => d.sourceType === 'upload').length;
    const live = detections.filter((d) => d.sourceType === 'live_recording').length;
    return [
      { source: 'Uploaded Audio', count: uploads, color: '#06B6D4' },
      { source: 'Live Mic Monitoring', count: live, color: '#3B82F6' },
    ];
  }, [detections]);

  const acousticAveragesByTier = useMemo(() => {
    const tiers = ['Low Risk', 'Medium Risk', 'High Risk', 'Critical Risk'] as const;
    return tiers.map((tier) => {
      const subset = detections.filter((d) => d.riskLevel === tier);
      if (subset.length === 0) {
        return {
          tier,
          count: 0,
          avgCentroid: 0,
          avgRolloff: 0,
          avgDynamicRange: 0,
          avgZcr: 0,
        };
      }
      const n = subset.length;
      return {
        tier,
        count: n,
        avgCentroid: Math.round(subset.reduce((s, d) => s + d.extractedFeatures.spectralCentroid, 0) / n),
        avgRolloff: Math.round(subset.reduce((s, d) => s + d.extractedFeatures.spectralRolloff, 0) / n),
        avgDynamicRange: Number(
          (subset.reduce((s, d) => s + (d.extractedFeatures.dynamicRange || 0), 0) / n).toFixed(1)
        ),
        avgZcr: Number(
          (subset.reduce((s, d) => s + d.extractedFeatures.zeroCrossingRate, 0) / n).toFixed(4)
        ),
      };
    });
  }, [detections]);

  const triageCounts = useMemo(
    () => [
      { status: 'Open', count: alerts.filter((a) => a.status === 'open').length, color: '#EF4444' },
      {
        status: 'Investigating',
        count: alerts.filter((a) => a.status === 'under_investigation').length,
        color: '#F59E0B',
      },
      { status: 'Resolved', count: alerts.filter((a) => a.status === 'resolved').length, color: '#10B981' },
    ],
    [alerts]
  );

  return (
    <DashboardLayout
      title="Security Analytics"
      subtitle="Longitudinal risk trends, language exposure breakdown, acoustic baselines, and alert triage"
    >
      <div className="space-y-6">
        <ExposureByLanguagePanel />

        {detections.length === 0 ? (
          <div className="rounded-xl border border-[#18253A] bg-[#0C1524] p-10 text-center max-w-xl mx-auto">
            <BarChart3 className="w-10 h-10 text-cyan-400 mx-auto" />
            <h2 className="font-display text-lg font-semibold text-white mt-4">
              No Analytics Data Available ({dataMode === 'live' ? 'Live Mode' : 'Demo'})
            </h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Run voice detections in Voice Analysis or Live Call Monitoring to visualize longitudinal signal telemetry.
            </p>
            <div className="mt-5">
              <Link
                to="/voice-analysis"
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
              >
                Open Voice Analysis
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Trend Line Chart */}
            <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-5 sm:p-6">
            <div className="mb-4">
              <h2 className="font-display text-sm font-semibold text-white">
                Authenticity vs. Risk Score Trend (Recent {chronologicalTrend.length} Scans)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Chronological trajectory derived strictly from active {dataMode === 'demo' ? 'demo' : 'Firestore'} records
              </p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chronologicalTrend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="index" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#64748B" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#060B14',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="authenticityScore"
                    name="Authenticity Score"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="riskScore"
                    name="Risk Score"
                    stroke="#EF4444"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Source Channel Distribution */}
            <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#0B1220] p-5">
              <h2 className="font-display text-sm font-semibold text-white">Capture Channel Breakdown</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">Uploaded audio vs live microphone sessions</p>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceBreakdown} margin={{ top: 6, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="source" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#060B14',
                        borderColor: '#1E293B',
                        borderRadius: '8px',
                        color: '#F8FAFC',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" name="Sessions" radius={[6, 6, 0, 0]}>
                      {sourceBreakdown.map((entry) => (
                        <Cell key={entry.source} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Alert Triage Breakdown */}
            <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#0B1220] p-5">
              <h2 className="font-display text-sm font-semibold text-white">Threat Alert Triage Pipeline</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">Current alert status counts</p>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={triageCounts} margin={{ top: 6, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="status" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#060B14',
                        borderColor: '#1E293B',
                        borderRadius: '8px',
                        color: '#F8FAFC',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" name="Alerts" radius={[6, 6, 0, 0]}>
                      {triageCounts.map((entry) => (
                        <Cell key={entry.status} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Acoustic Signal Feature Baselines by Risk Tier */}
          <div className="rounded-xl border border-slate-800 bg-[#0B1220] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="font-display text-sm font-semibold text-white">
                Mean Acoustic Feature Profile by Risk Tier
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#080E1A] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Risk Tier</th>
                    <th className="py-3 px-4 text-right">Samples</th>
                    <th className="py-3 px-4 text-right">Mean Centroid (Hz)</th>
                    <th className="py-3 px-4 text-right">Mean Rolloff (Hz)</th>
                    <th className="py-3 px-4 text-right">Mean Dynamic Range (dB)</th>
                    <th className="py-3 px-4 text-right">Mean ZCR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {acousticAveragesByTier.map((row) => (
                    <tr key={row.tier}>
                      <td className="py-3 px-4 font-semibold text-white">{row.tier}</td>
                      <td className="py-3 px-4 font-mono text-slate-300 text-right tabular-nums">
                        {row.count}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300 text-right tabular-nums">
                        {row.count > 0 ? `${row.avgCentroid} Hz` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300 text-right tabular-nums">
                        {row.count > 0 ? `${row.avgRolloff} Hz` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300 text-right tabular-nums">
                        {row.count > 0 ? `${row.avgDynamicRange} dB` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300 text-right tabular-nums">
                        {row.count > 0 ? row.avgZcr : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
