import React, { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Check,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FileAudio,
  FileText,
  History,
  LayoutGrid,
  LogOut,
  MailWarning,
  Menu,
  Radio,
  Settings,
  ShieldAlert,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { markAlertAsRead } from '../lib/detectionService';
import { VoiceGuardLogo } from './VoiceGuardLogo';

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview', icon: LayoutGrid },
  { to: '/live-monitoring', label: 'Live Call Monitoring', icon: Radio },
  { to: '/voice-analysis', label: 'Voice Analysis', icon: FileAudio },
  { to: '/threat-detection', label: 'Threat Detection', icon: ShieldAlert },
  { to: '/call-history', label: 'Call History', icon: History },
  { to: '/analytics', label: 'Security Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function DashboardLayout({
  title,
  subtitle,
  headerActions,
  children,
}: {
  title: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const {
    user,
    userProfile,
    alerts,
    detections,
    dataMode,
    setDataMode,
    updateDemoAlert,
    systemHealth,
    logout,
    resendVerificationEmail,
    refreshVerificationStatus,
  } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const unreadAlerts = useMemo(() => alerts.filter((a) => !a.isRead), [alerts]);
  const openThreatCount = useMemo(
    () => alerts.filter((a) => a.status !== 'resolved').length,
    [alerts]
  );
  const lastAnalysisAt = detections[0]?.createdAt;

  const isHealthy =
    systemHealth.authOperational &&
    systemHealth.firestoreOperational !== false &&
    systemHealth.apiConnected !== false;

  const handleLogout = async () => {
    try {
      await logout();
      pushToast('Session ended securely', 'info');
      navigate('/login');
    } catch {
      pushToast('Failed to sign out', 'error');
    }
  };

  const handleResendVerification = async () => {
    setVerifying(true);
    try {
      await resendVerificationEmail();
      pushToast('Verification email sent', 'success', 'Check your inbox and click the verification link.');
    } catch (err) {
      pushToast('Could not send verification email', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setVerifying(false);
    }
  };

  const handleCheckVerification = async () => {
    setVerifying(true);
    try {
      const verified = await refreshVerificationStatus();
      if (verified) {
        pushToast('Email verified', 'success', 'Firestore scan persistence is now enabled.');
      } else {
        pushToast('Verification pending', 'warning', 'Open the verification link sent to your email.');
      }
    } catch {
      pushToast('Verification check failed', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleQuickMarkRead = async (alertId: string) => {
    if (dataMode === 'demo') {
      updateDemoAlert(alertId, { isRead: true });
      return;
    }
    if (!user) return;
    try {
      await markAlertAsRead(user.uid, alertId);
    } catch {
      pushToast('Unable to update alert', 'error');
    }
  };

  const bgShellClass = userProfile?.themePreference === 'midnight' ? 'bg-[#050910]' : 'bg-[#070C14]';
  const displayName = userProfile?.fullName || user?.displayName || user?.email?.split('@')[0] || 'SOC Analyst';
  const avatarUrl = userProfile?.photoURL || user?.photoURL || '';
  const sidebarWidth = collapsed ? 'lg:w-[74px]' : 'lg:w-[260px]';
  const contentPadLeft = collapsed ? 'lg:pl-[74px]' : 'lg:pl-[260px]';

  const formattedLastAnalysis = lastAnalysisAt
    ? `${lastAnalysisAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${lastAnalysisAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })}`
    : 'NONE';

  return (
    <div className={`min-h-screen ${bgShellClass} text-slate-100 flex`}>
      {/* Fixed Collapsible Left Sidebar */}
      <aside
        className={`hidden lg:flex ${sidebarWidth} lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#172235] bg-[#0A111D] z-30 transition-all duration-200`}
      >
        <div className="h-[68px] px-4 flex items-center justify-between border-b border-[#172235]">
          <button
            type="button"
            onClick={() => navigate('/overview')}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-lg overflow-hidden"
            title="VOICEGUARD AI"
          >
            <VoiceGuardLogo
              size="sm"
              showText={!collapsed}
              subtitle="Trust the Voice. Verify the Signal."
            />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Security Operations Sidebar">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-3'} py-2.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#10243E] text-cyan-400 border border-[#1B3A5C]'
                      : 'text-slate-300 hover:bg-[#101A2C] hover:text-white border border-transparent'
                  }`
                }
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>

                {!collapsed && item.to === '/live-monitoring' && (
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 tracking-wide">
                    LIVE
                  </span>
                )}

                {!collapsed && item.to === '/threat-detection' && openThreatCount > 0 && (
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/15 text-red-400 tabular-nums">
                    {openThreatCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="p-3.5 border-t border-[#172235] space-y-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500 leading-relaxed">
              {systemHealth.modelConfigured
                ? 'ML INFERENCE ACTIVE · ZERO-STORAGE AUDIO'
                : 'EXPERIMENTAL SIGNAL · ZERO-STORAGE AUDIO'}
            </p>
            <button
              type="button"
              onClick={() => setDataMode(dataMode === 'demo' ? 'live' : 'demo')}
              className={`w-full px-3 py-1.5 rounded border font-mono text-[11px] font-semibold tracking-wider uppercase text-left transition-colors flex items-center justify-between ${
                dataMode === 'demo'
                  ? 'border-amber-500/45 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
                  : 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15'
              }`}
              title="Toggle between Demo Dataset and Live Firestore Mode"
            >
              <span>{dataMode === 'demo' ? 'DEMO DATASET' : 'LIVE FIRESTORE'}</span>
              <span className="text-[10px] opacity-80">SWITCH</span>
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0A111D] border-r border-[#172235] flex flex-col h-full z-10">
            <div className="h-[68px] px-4 flex items-center justify-between border-b border-[#172235]">
              <VoiceGuardLogo size="sm" subtitle="Trust the Voice. Verify the Signal." />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-[#10243E] text-cyan-400 border border-[#1B3A5C]'
                          : 'text-slate-300 hover:bg-[#101A2C] hover:text-white border border-transparent'
                      }`
                    }
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.to === '/live-monitoring' && (
                      <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400">
                        LIVE
                      </span>
                    )}
                    {item.to === '/threat-detection' && openThreatCount > 0 && (
                      <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/15 text-red-400 tabular-nums">
                        {openThreatCount}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
            <div className="p-4 border-t border-[#172235]">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className={`flex-1 ${contentPadLeft} flex flex-col min-w-0 transition-all duration-200`}>
        {/* Top Bar matching reference SOC layout */}
        <header className="sticky top-0 z-20 h-14 border-b border-[#172235] bg-[#080E18]/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="hidden lg:inline-flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-[#101A2C] transition-colors"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Right Telemetry & Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div
              className={`hidden xl:inline-flex items-center gap-2 px-3 py-1 rounded border font-mono text-[11px] tracking-wider uppercase whitespace-nowrap ${
                isHealthy
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/35 bg-amber-500/10 text-amber-300'
              }`}
              title={systemHealth.engineLabel}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-400' : 'bg-amber-400'}`}
              />
              <span>{isHealthy ? 'SYSTEM OPERATIONAL' : 'SYSTEM DEGRADED'}</span>
            </div>

            {/* Data Mode Segmented Toggle */}
            <div
              className="flex items-center p-0.5 rounded border border-[#18253A] bg-[#0B1220]"
              role="group"
              aria-label="Data source mode"
            >
              <button
                type="button"
                onClick={() => setDataMode('live')}
                className={`px-2.5 py-1 rounded-xs font-mono text-[11px] font-medium uppercase tracking-wide transition-colors whitespace-nowrap ${
                  dataMode === 'live'
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                LIVE MODE
              </button>
              <button
                type="button"
                onClick={() => setDataMode('demo')}
                className={`px-2.5 py-1 rounded-xs font-mono text-[11px] font-medium uppercase tracking-wide transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  dataMode === 'demo'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/45'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Database className="w-3 h-3" />
                DEMONSTRATION DATA
              </button>
            </div>

            <span className="hidden md:inline font-mono text-[11px] text-slate-400 tabular-nums whitespace-nowrap pl-1">
              LAST ANALYSIS: {formattedLastAnalysis}
            </span>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((prev) => !prev);
                  setProfileOpen(false);
                }}
                className="relative p-1.5 rounded-lg border border-[#18253A] bg-[#0C1524] text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
                aria-label="Security notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-600 text-[10px] font-mono font-bold text-white flex items-center justify-center tabular-nums">
                    {unreadAlerts.length > 9 ? '9+' : unreadAlerts.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[#18253A] bg-[#0C1524] shadow-2xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#18253A] flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Security Notifications</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        navigate('/threat-detection');
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                    >
                      Threat Detection
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[#18253A]">
                    {alerts.length === 0 ? (
                      <div className="p-4 text-xs text-slate-400 text-center">No active alerts.</div>
                    ) : (
                      alerts.slice(0, 5).map((alert) => (
                        <div key={alert.id} className="p-3.5 hover:bg-slate-800/40 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-100 leading-snug">{alert.title}</p>
                            {!alert.isRead && (
                              <button
                                type="button"
                                onClick={() => handleQuickMarkRead(alert.id)}
                                className="text-cyan-400 hover:text-cyan-300 shrink-0"
                                title="Mark as read"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{alert.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((prev) => !prev);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg border border-[#18253A] bg-[#0C1524] hover:border-slate-700 transition-colors"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded object-cover bg-slate-800"
                  />
                ) : (
                  <div className="w-6 h-6 rounded bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                )}
                <span className="hidden sm:inline text-xs font-medium text-slate-200 max-w-[100px] truncate">
                  {displayName}
                </span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[#18253A] bg-[#0C1524] shadow-2xl z-40 py-1.5">
                  <div className="px-3.5 py-2 border-b border-[#18253A]">
                    <p className="text-xs font-semibold text-white truncate">{displayName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800/70 hover:text-white flex items-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Settings &amp; Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      void handleLogout();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Email Verification Notice */}
        {user && !user.emailVerified && (
          <div className="bg-amber-500/10 border-b border-amber-500/25 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-amber-200">
              <MailWarning className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Verify your email address ({user.email}) to enable Firestore scan &amp; alert persistence.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={verifying}
                className="px-3 py-1 rounded border border-amber-500/40 text-xs font-medium text-amber-200 hover:bg-amber-500/20 whitespace-nowrap"
              >
                Resend Verification
              </button>
              <button
                type="button"
                onClick={handleCheckVerification}
                disabled={verifying}
                className="px-3 py-1 rounded bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 whitespace-nowrap"
              >
                Check Status
              </button>
            </div>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-5 sm:p-7 max-w-[1440px] w-full mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-slate-400 mt-1">{subtitle}</p>
              )}
            </div>
            {headerActions && (
              <div className="flex flex-wrap items-center gap-2.5">{headerActions}</div>
            )}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
