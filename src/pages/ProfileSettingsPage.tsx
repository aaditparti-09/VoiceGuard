import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Shield,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { DashboardLayout } from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { auth } from '../lib/firebase';
import { deleteAllUserFirestoreData, updateUserProfileData } from '../lib/detectionService';

export function ProfileSettingsPage() {
  const { user, userProfile, systemHealth, sendResetPasswordEmail, logout } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(userProfile?.fullName || user?.displayName || '');
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || user?.photoURL || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [emailAlerts, setEmailAlerts] = useState(userProfile?.emailAlerts ?? true);
  const [highRiskAlerts, setHighRiskAlerts] = useState(userProfile?.highRiskAlerts ?? true);
  const [themePreference, setThemePreference] = useState<'dark' | 'midnight'>(
    userProfile?.themePreference ?? 'dark'
  );
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.fullName);
      setPhotoURL(userProfile.photoURL || '');
      setEmailAlerts(userProfile.emailAlerts ?? true);
      setHighRiskAlerts(userProfile.highRiskAlerts ?? true);
      setThemePreference(userProfile.themePreference ?? 'dark');
    }
  }, [userProfile]);

  const isPasswordProvider = Boolean(user?.providerData.some((p) => p.providerId === 'password'));

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !auth.currentUser) return;
    if (!fullName.trim()) {
      pushToast('Display name cannot be empty', 'error');
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile(auth.currentUser, {
        displayName: fullName.trim(),
        photoURL: photoURL.trim() || null,
      });
      await updateUserProfileData(user.uid, {
        fullName: fullName.trim(),
        photoURL: photoURL.trim(),
      });
      pushToast('Profile updated', 'success');
    } catch (err) {
      pushToast('Failed to update profile', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!user) return;
    setSavingPrefs(true);
    try {
      await updateUserProfileData(user.uid, {
        emailAlerts,
        highRiskAlerts,
        themePreference,
      });
      pushToast('Preferences saved', 'success');
    } catch {
      pushToast('Failed to save preferences', 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !auth.currentUser.email) return;
    if (newPassword.length < 8) {
      pushToast('New password must be at least 8 characters', 'error');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      pushToast('Passwords do not match', 'error');
      return;
    }

    setChangingPassword(true);
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      pushToast('Password updated', 'success');
    } catch (err) {
      pushToast(
        'Password change failed',
        'error',
        err instanceof Error ? err.message : 'Check your current password.'
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    try {
      await sendResetPasswordEmail(user.email);
      pushToast('Password reset email sent', 'success', `Sent to ${user.email}`);
    } catch (err) {
      pushToast('Failed to send reset email', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !auth.currentUser) return;
    setDeletingAccount(true);
    try {
      await deleteAllUserFirestoreData(user.uid);
      await deleteUser(auth.currentUser);
      pushToast('Account and Firestore records deleted', 'info');
      navigate('/login');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        pushToast(
          'Recent login required',
          'warning',
          'Sign out and sign back in before deleting your account.'
        );
      } else {
        pushToast('Failed to delete account', 'error', err instanceof Error ? err.message : undefined);
      }
      setDeleteModalOpen(false);
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <DashboardLayout
      title="Settings"
      subtitle="Analyst profile, security preferences, model engine status, and account management"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Profile */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
            <div className="flex items-center gap-4">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={fullName || 'Analyst'}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover border border-slate-700 bg-slate-800"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center border border-cyan-500/25">
                  <UserIcon className="w-6 h-6" />
                </div>
              )}
              <div>
                <h2 className="font-display text-base font-bold text-white">
                  {fullName || 'VoiceGuard Analyst'}
                </h2>
                <p className="text-xs text-slate-400">{user?.email}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                  <span className="font-mono text-slate-400">
                    Created: {userProfile?.createdAt ? userProfile.createdAt.toLocaleDateString() : '—'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      user?.emailVerified ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {user?.emailVerified ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" /> Unverified Email
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>

          <form onSubmit={handleSaveProfile} className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                id="profile-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-700 bg-[#060B14] text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label htmlFor="profile-photo" className="block text-xs font-medium text-slate-300 mb-1.5">
                Profile Photo URL
              </label>
              <input
                id="profile-photo"
                type="url"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-700 bg-[#060B14] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
              >
                {savingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Profile
              </button>
            </div>
          </form>
        </div>

        {/* Detection Engine Architecture Status */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-6 space-y-3">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h2 className="font-display text-sm font-semibold text-white">
              Detection Engine &amp; FastAPI Model Integration
            </h2>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Current mode: <strong className="text-white">{systemHealth.engineLabel}</strong>. The Express backend (<code className="text-cyan-300">/api/analyze-voice</code>) is ready to forward extracted features and audio payloads to an external Python FastAPI + PyTorch/TensorFlow classifier when <code className="text-cyan-300">DEEPFAKE_MODEL_ENDPOINT</code> and <code className="text-cyan-300">DEEPFAKE_MODEL_API_KEY</code> are set server-side.
          </p>
        </div>

        {/* Preferences */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-6 space-y-4">
          <h2 className="font-display text-sm font-semibold text-white">Alert &amp; Display Preferences</h2>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-4 p-3 rounded-lg border border-slate-800 bg-[#060B14] cursor-pointer">
              <div>
                <p className="text-xs font-medium text-white">Generate Alerts on Risk Score &gt; 30</p>
                <p className="text-[11px] text-slate-400">Automatically create Threat Detection entries for suspicious and high-risk scans</p>
              </div>
              <input
                type="checkbox"
                checked={highRiskAlerts}
                onChange={(e) => setHighRiskAlerts(e.target.checked)}
                className="rounded border-slate-700 bg-[#0B1220] text-cyan-500 focus:ring-cyan-500"
              />
            </label>

            <label className="flex items-center justify-between gap-4 p-3 rounded-lg border border-slate-800 bg-[#060B14] cursor-pointer">
              <div>
                <p className="text-xs font-medium text-white">Email Digest Preference</p>
                <p className="text-[11px] text-slate-400">Store security alert notification preference on profile</p>
              </div>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                className="rounded border-slate-700 bg-[#0B1220] text-cyan-500 focus:ring-cyan-500"
              />
            </label>

            <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-slate-800 bg-[#060B14]">
              <div>
                <p className="text-xs font-medium text-white">Console Background Contrast</p>
                <p className="text-[11px] text-slate-400">Choose between Dark Navy and Deep Charcoal</p>
              </div>
              <select
                value={themePreference}
                onChange={(e) => setThemePreference(e.target.value as 'dark' | 'midnight')}
                aria-label="Theme preference"
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#0B1220] text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="dark">Dark Navy</option>
                <option value="midnight">Deep Charcoal</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={savingPrefs}
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-white transition-colors"
            >
              {savingPrefs ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>

        {/* Password & Access */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-cyan-400" />
              <h2 className="font-display text-sm font-semibold text-white">Password &amp; Access</h2>
            </div>
            <button
              type="button"
              onClick={handleSendPasswordReset}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
            >
              Send Password Reset Email
            </button>
          </div>

          {isPasswordProvider ? (
            <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="cur-pass" className="block text-xs font-medium text-slate-300 mb-1">
                  Current Password
                </label>
                <input
                  id="cur-pass"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-[#060B14] text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label htmlFor="new-pass" className="block text-xs font-medium text-slate-300 mb-1">
                  New Password
                </label>
                <input
                  id="new-pass"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-[#060B14] text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label htmlFor="conf-pass" className="block text-xs font-medium text-slate-300 mb-1">
                  Confirm Password
                </label>
                <input
                  id="conf-pass"
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-[#060B14] text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                >
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-[#060B14] p-3.5 flex items-center gap-3 text-xs text-slate-300">
              <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                Signed in via Google Authentication. Password credentials are managed through Google, or use Send Password Reset Email above.
              </span>
            </div>
          )}
        </div>

        {/* Privacy & Account Deletion */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1220] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h2 className="font-display text-sm font-semibold text-white">Privacy &amp; Data Isolation</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            All audio decoding runs locally in your browser. Detection metrics and threat alerts are isolated under <code className="text-cyan-300">users/{user?.uid}</code> with strict Firestore security rules.
          </p>

          <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-red-400">Delete Account &amp; Data</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Removes all stored detections, alerts, and your Firebase Auth account.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/15 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={deleteModalOpen}
        title="Delete VoiceGuard AI Account"
        description="This permanently removes all your detection records, threat alerts, profile data in Firestore, and your Firebase Authentication account."
        confirmLabel="Permanently Delete Account"
        destructive
        busy={deletingAccount}
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteModalOpen(false)}
      />
    </DashboardLayout>
  );
}
