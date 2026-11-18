import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, KeyRound, Loader2, MailCheck } from 'lucide-react';
import { VoiceGuardLogo } from '../components/VoiceGuardLogo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function ForgotPasswordPage() {
  const { sendResetPasswordEmail } = useAuth();
  const { pushToast } = useToast();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim()) {
      setErrorMsg('Enter your registered email address.');
      return;
    }

    setLoading(true);
    try {
      await sendResetPasswordEmail(email);
      setSent(true);
      pushToast('Password reset link sent', 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060B14] text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <VoiceGuardLogo size="md" />
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Sign In
          </Link>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-2.5 text-cyan-400">
            <KeyRound className="w-5 h-5" />
            <h1 className="font-display text-xl font-bold text-white">Reset Password</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Enter the email address associated with your VOICEGUARD AI account to receive a Firebase password reset link.
          </p>

          {errorMsg && (
            <div className="mt-4 rounded-lg border border-red-500/35 bg-red-500/10 p-3 flex items-start gap-2 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {sent ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
                <MailCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-200 leading-relaxed">
                  Password reset instructions have been sent to <strong>{email}</strong>. Follow the link in your email to choose a new password.
                </div>
              </div>
              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
              >
                Return to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@organization.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-[#070C16] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Password Reset Email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
