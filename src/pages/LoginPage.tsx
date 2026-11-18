import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { VoiceGuardLogo } from '../components/VoiceGuardLogo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is not yet enabled in Firebase Console. Use Google Sign-In below, or enable Email/Password under Firebase Authentication > Sign-in method.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password. Please verify your credentials.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed sign-in attempts. Wait a few minutes or reset your password.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before completing authentication.';
  }
  return err instanceof Error ? err.message : 'Unable to sign in. Please try again.';
}

export function LoginPage() {
  const { loginWithEmail, loginWithGoogle } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg('Enter both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      await loginWithEmail(email, password, rememberMe);
      pushToast('Authenticated into VOICEGUARD AI', 'success');
      navigate('/overview');
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle(rememberMe);
      pushToast('Signed in with Google', 'success');
      navigate('/overview');
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070C14] text-slate-100 grid grid-cols-1 lg:grid-cols-12">
      {/* Left Branding & Cybersecurity Acoustic Panel */}
      <div className="lg:col-span-6 border-b lg:border-b-0 lg:border-r border-[#172235] bg-[#0A111D] p-8 sm:p-12 flex flex-col justify-between">
        <div>
          <VoiceGuardLogo size="lg" />
          <p className="font-mono text-xs tracking-widest text-cyan-400 uppercase mt-8">
            Trust the Voice. Verify the Signal.
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mt-2.5 max-w-md [text-wrap:balance]">
            Enterprise Voice Deepfake Detection &amp; Prevention Operations
          </h1>
          <p className="text-sm text-slate-400 mt-3 max-w-md leading-relaxed">
            Inspect uploaded voice recordings and microphone audio streams through spectral signal extraction, risk assessment, and incident tracking.
          </p>
        </div>

        <div className="my-8 rounded-xl border border-[#18253A] bg-[#0C1524] overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between text-xs mb-4">
              <span className="inline-flex items-center gap-2 font-medium text-slate-200">
                <Activity className="w-4 h-4 text-cyan-400" />
                Acoustic Signal Verification Pipeline
              </span>
              <span className="font-mono text-[11px] text-cyan-300">FFT · ZCR · Rolloff</span>
            </div>

            {/* Clean Vector Acoustic Spectrum Visualization (Zero Speaker Photo) */}
            <svg
              viewBox="0 0 480 120"
              className="w-full h-28 rounded-lg border border-[#162235] bg-[#080E18]"
              role="img"
              aria-label="Spectral frequency and voice signal waveform diagram"
            >
              <line x1="0" y1="30" x2="480" y2="30" stroke="#152134" strokeWidth="1" />
              <line x1="0" y1="60" x2="480" y2="60" stroke="#152134" strokeWidth="1" />
              <line x1="0" y1="90" x2="480" y2="90" stroke="#152134" strokeWidth="1" />
              {[
                18, 28, 42, 34, 58, 76, 62, 40, 84, 92, 68, 46, 30, 52, 74, 88, 64, 48, 36, 60, 82, 70, 44, 26,
                38, 66, 90, 72, 50, 32, 46, 68, 54, 34, 24, 16,
              ].map((h, idx) => {
                const x = 16 + idx * 12.6;
                const y = 60 - h / 2;
                const fill = idx >= 20 && idx <= 24 ? '#F59E0B' : idx >= 8 && idx <= 11 ? '#10B981' : '#06B6D4';
                return (
                  <rect
                    key={idx}
                    x={x}
                    y={y}
                    width="5.5"
                    height={h}
                    rx="2.5"
                    fill={fill}
                    fillOpacity="0.85"
                  />
                );
              })}
            </svg>
          </div>

          <div className="p-4 border-t border-[#18253A] grid grid-cols-3 gap-3 text-xs bg-[#09101C]">
            <div>
              <p className="text-slate-400">Signal Pipeline</p>
              <p className="font-mono text-slate-200 mt-0.5">FFT + Spectral</p>
            </div>
            <div>
              <p className="text-slate-400">Risk Scale</p>
              <p className="font-mono text-slate-200 mt-0.5">0–100 Four-Tier</p>
            </div>
            <div>
              <p className="text-slate-400">Access Control</p>
              <p className="font-mono text-slate-200 mt-0.5">UID Isolated</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Firebase Authentication
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-cyan-400" />
            Scoped Firestore Storage
          </span>
        </div>
      </div>

      {/* Right Login Form */}
      <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0B1220] p-6 sm:p-8 shadow-xl">
          <h2 className="font-display text-xl font-bold text-white">Sign in to Security Console</h2>
          <p className="text-xs text-slate-400 mt-1">
            Authenticate to access call monitoring, voice analysis, and threat intelligence.
          </p>

          {errorMsg && (
            <div className="mt-5 rounded-lg border border-red-500/35 bg-red-500/10 p-3.5 flex items-start gap-2.5 text-xs text-red-200 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="mt-6 w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-slate-700 bg-[#101A2E] hover:bg-slate-800 text-sm font-medium text-white transition-colors disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="relative my-5 flex items-center">
            <div className="flex-grow border-t border-slate-800" />
            <span className="mx-3 text-[11px] text-slate-500">or sign in with email</span>
            <div className="flex-grow border-t border-slate-800" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Work Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@organization.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-[#070C16] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-lg border border-slate-700 bg-[#070C16] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-700 bg-[#070C16] text-cyan-500 focus:ring-cyan-500"
                />
                Remember session
              </label>
              <Link to="/forgot-password" className="text-xs font-medium text-cyan-400 hover:text-cyan-300">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-6">
            New organization analyst?{' '}
            <Link to="/signup" className="text-cyan-400 hover:text-cyan-300 font-medium">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
