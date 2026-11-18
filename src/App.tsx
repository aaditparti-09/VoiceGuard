/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AudioDetectionPage } from './pages/AudioDetectionPage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { HistoryPage } from './pages/HistoryPage';
import { LiveAnalysisPage } from './pages/LiveAnalysisPage';
import { LoginPage } from './pages/LoginPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { RiskReportPage } from './pages/RiskReportPage';
import { SecurityAnalyticsPage } from './pages/SecurityAnalyticsPage';
import { SignupPage } from './pages/SignupPage';
import { ThreatDetectionPage } from './pages/ThreatDetectionPage';

function FullScreenAuthLoader() {
  return (
    <div className="min-h-screen bg-[#060B14] text-slate-200 flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
      <p className="text-xs font-mono text-slate-400">Initializing VoiceGuard SOC...</p>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useAuth();
  if (authLoading) return <FullScreenAuthLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useAuth();
  if (authLoading) return <FullScreenAuthLoader />;
  if (user) return <Navigate to="/overview" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { user, authLoading } = useAuth();
  if (authLoading) return <FullScreenAuthLoader />;
  return <Navigate to={user ? '/overview' : '/login'} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route
                path="/login"
                element={
                  <GuestOnlyRoute>
                    <LoginPage />
                  </GuestOnlyRoute>
                }
              />
              <Route
                path="/signup"
                element={
                  <GuestOnlyRoute>
                    <SignupPage />
                  </GuestOnlyRoute>
                }
              />
              <Route
                path="/forgot-password"
                element={
                  <GuestOnlyRoute>
                    <ForgotPasswordPage />
                  </GuestOnlyRoute>
                }
              />

              {/* 8 SOC Navigation Routes */}
              <Route
                path="/overview"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/dashboard" element={<Navigate to="/overview" replace />} />
              <Route
                path="/live-monitoring"
                element={
                  <ProtectedRoute>
                    <LiveAnalysisPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/voice-analysis"
                element={
                  <ProtectedRoute>
                    <AudioDetectionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/threat-detection"
                element={
                  <ProtectedRoute>
                    <ThreatDetectionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/call-history"
                element={
                  <ProtectedRoute>
                    <HistoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ProtectedRoute>
                    <SecurityAnalyticsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <RiskReportPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports/:detectionId"
                element={
                  <ProtectedRoute>
                    <RiskReportPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
