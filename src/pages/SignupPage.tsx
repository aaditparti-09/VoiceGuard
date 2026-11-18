import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Check, Eye, EyeOff, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import { VoiceGuardLogo } from '../components/VoiceGuardLogo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function SignupPage() {
  const { signupWithEmail, loginWithGoogle } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdConfirmation, setCreatedConfirmation] = useState(false);

  const passwordChecks = useMemo(
    () => [
      { label: 'At least 8 characters', ok: password.length >= 8 },
      { label: 'One uppercase letter', ok: /[A-Z]/.test(password) },
      { label: 'One lowercase letter', ok: /[a-z]/.test(password) },
      { label: 'One numeric digit', ok: /\d/.test(password) },
    ],
    [password]
  );

  const isPasswordValid = passwordChecks.every((c) => c.ok);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!isPasswordValid) {
      setErrorMsg('Password does not meet all security requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Password and confirmation password do not match.');
      return;
    }
    if (!acceptedTerms) {
      setErrorMsg('Accept the Terms & Conditions to create your account.');
      return;
    }

    setLoading(true);
    try {
      await signupWithEmail(fullName, email, password);
      setCreatedConfirmation(true);
      pushToast('Account created', 'success', 'Verification link sent to your email.');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          'Email/Password signup is not enabled in Firebase Console yet. Use Google Sign-In below, or enable Email/Password under Firebase Console > Authentication > Sign-in method.'
        );
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg('An account with this email already exists. Please sign in instead.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle(true);
      pushToast('Authenticated with Google', 'success');
      navigate('/overview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060B14] text-slate-100 grid grid-cols-1 lg:grid-cols-12">
      {/* Left Branding Panel */}
      <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-800/90 bg-[#080E1A] p-8 sm:p-12 flex flex-col justify-between">
        <div>
          <VoiceGuardLogo size="lg" />
          <p className="font-mono text-xs tracking-widest text-cyan-400 uppercase mt-8">
            Trust the Voice. Verify the Signal.
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mt-2.5 [text-wrap:balance]">
            Provision Your Voice Security Operations Workspace
          </h1>
          <p className="text-sm text-slate-400 mt-3 leading-relaxed">
            Every account receives an isolated Firestore workspace for voice scan history, threat investigations, and PDF audit exports.
          </p>
        </div>

        <div className="my-8 space-y-3 text-xs text-slate-300">
          <div className="rounded-lg border border-slate-800 bg-[#0B1220] p-4 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">End-to-End Verification Pipeline</p>
              <p className="text-slate-400 mt-0.5">
                Audio Input → Processing → Feature Extraction → Detection → Risk Assessment → Security Alert → Prevention.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Passwords are managed strictly by Firebase Authentication and never stored in Firestore.
        </p>
      </div>

      {/* Right Signup Form */}
      <div className="lg:col-span-7 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0B1220] p-6 sm:p-8 shadow-xl">
          {createdConfirmation ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
                <MailCheck className="w-6 h-6" />
              </div>
              <h2 className="font-display text-xl font-bold text-white">Account Created</h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Your VOICEGUARD AI account has been provisioned and a verification email was sent to{' '}
                <strong className="text-white">{email}</strong>.
              </p>
              <button
                type="button"
                onClick={() => navigate('/overview')}
                className="w-full px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
              >
                Continue to Security Console
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold text-white">Create Analyst Account</h2>
              <p className="text-xs text-slate-400 mt-1">
                Register to monitor audio submissions and manage threat alerts.
              </p>

              {errorMsg && (
                <div className="mt-5 rounded-lg border border-red-500/35 bg-red-500/10 p-3.5 flex items-start gap-2.5 text-xs text-red-200 leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleSignup}
                disabled={googleLoading || loading}
                className="mt-5 w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-slate-700 bg-[#101A2E] hover:bg-slate-800 text-sm font-medium text-white transition-colors disabled:opacity-60"
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
                Sign up with Google
              </button>

              <div className="relative my-5 flex items-center">
                <div className="flex-grow border-t border-slate-800" />
                <span className="mx-3 text-[11px] text-slate-500">or create with email</span>
                <div className="flex-grow border-t border-slate-800" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label htmlFor="signup-name" className="block text-xs font-medium text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jordan Taylor"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-700 bg-[#070C16] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-xs font-medium text-slate-300 mb-1">
                    Work Email
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="analyst@organization.com"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-700 bg-[#070C16] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label htmlFor="signup-password" className="block text-xs font-medium text-slate-300 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="w-full pl-3.5 pr-10 py-2 rounded-lg border border-slate-700 bg-[#070C16] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
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
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {passwordChecks.map((check) => (
                      <div
                        key={check.label}
                        className={`flex items-center gap-1.5 text-[11px] ${
                          check.ok ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        <Check className="w-3 h-3 shrink-0" />
                        <span>{check.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-confirm" className="block text-xs font-medium text-slate-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="signup-confirm"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-700 bg-[#070C16] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-[#070C16] text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="leading-relaxed">
                    I agree to the Terms &amp; Conditions and understand VoiceGuard AI analyzes only explicitly uploaded or recorded audio.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Provisioning Account...' : 'Create Account'}
                </button>
              </form>

              <p className="text-xs text-slate-400 text-center mt-5">
                Already registered?{' '}
                <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
