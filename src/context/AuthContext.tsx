import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { createDemoAlerts, createDemoDetections } from '../lib/demoDataset';
import {
  ensureUserProfileDoc,
  fetchApiHealth,
  mapDocToAlert,
  mapDocToDetection,
} from '../lib/detectionService';
import type {
  AlertStatus,
  SecurityAlertRecord,
  SignalIndicator,
  SystemHealthState,
  UserProfileRecord,
  VoiceDetectionRecord,
} from '../types/voiceguard';

export type DataMode = 'live' | 'demo';

export interface ActiveReportContextItem {
  record: VoiceDetectionRecord;
  spectrogramMatrix?: number[][];
  signalIndicators?: SignalIndicator[];
  savedToCloud: boolean;
}

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfileRecord | null;
  authLoading: boolean;
  dataLoading: boolean;
  dataMode: DataMode;
  setDataMode: (mode: DataMode) => void;
  detections: VoiceDetectionRecord[];
  alerts: SecurityAlertRecord[];
  liveDetections: VoiceDetectionRecord[];
  liveAlerts: SecurityAlertRecord[];
  updateDemoAlert: (alertId: string, updates: { status?: AlertStatus; investigationNotes?: string; isRead?: boolean }) => void;
  deleteDemoDetection: (detectionId: string) => void;
  systemHealth: SystemHealthState;
  refreshSystemHealth: () => Promise<void>;
  activeReport: ActiveReportContextItem | null;
  setActiveReport: (item: ActiveReportContextItem | null) => void;
  loginWithEmail: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  signupWithEmail: (fullName: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (rememberMe?: boolean) => Promise<void>;
  sendResetPasswordEmail: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileRecord | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [dataMode, setDataModeState] = useState<DataMode>(() => {
    const saved = sessionStorage.getItem('vg_data_mode');
    return saved === 'demo' ? 'demo' : 'live';
  });

  const [liveDetections, setLiveDetections] = useState<VoiceDetectionRecord[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<SecurityAlertRecord[]>([]);
  const [demoDetections, setDemoDetections] = useState<VoiceDetectionRecord[]>([]);
  const [demoAlerts, setDemoAlerts] = useState<SecurityAlertRecord[]>([]);
  const [activeReport, setActiveReport] = useState<ActiveReportContextItem | null>(null);

  const [systemHealth, setSystemHealth] = useState<SystemHealthState>(() => ({
    authOperational: false,
    firestoreOperational: null,
    audioEngineReady:
      typeof window !== 'undefined' &&
      Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext),
    apiConnected: null,
    modelConfigured: false,
    engineLabel: 'Checking engine...',
  }));

  const setDataMode = useCallback((mode: DataMode) => {
    sessionStorage.setItem('vg_data_mode', mode);
    setDataModeState(mode);
  }, []);

  const refreshSystemHealth = useCallback(async () => {
    const api = await fetchApiHealth();
    let firestoreOk = true;
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      firestoreOk = true;
    } catch (err) {
      if (err instanceof Error && err.message.includes('the client is offline')) {
        firestoreOk = false;
      } else {
        // Permission-denied on test/connection confirms live roundtrip with Firestore server
        firestoreOk = true;
      }
    }

    setSystemHealth({
      authOperational: Boolean(auth.currentUser),
      firestoreOperational: firestoreOk,
      audioEngineReady: Boolean(
        window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
      ),
      apiConnected: api.apiConnected,
      modelConfigured: api.modelConfigured,
      engineLabel: api.engineLabel,
    });
  }, []);

  useEffect(() => {
    void refreshSystemHealth();
  }, [refreshSystemHealth]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      if (firebaseUser) {
        setDemoDetections(createDemoDetections(firebaseUser.uid));
        setDemoAlerts(createDemoAlerts(firebaseUser.uid));
        setSystemHealth((prev) => ({ ...prev, authOperational: true }));
        try {
          await ensureUserProfileDoc({
            uid: firebaseUser.uid,
            fullName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'VoiceGuard Analyst',
            email: firebaseUser.email || '',
            photoURL: firebaseUser.photoURL || '',
          });
        } catch (err) {
          console.error('Failed to ensure user profile:', err);
        }
      } else {
        setUserProfile(null);
        setLiveDetections([]);
        setLiveAlerts([]);
        setDemoDetections([]);
        setDemoAlerts([]);
        setActiveReport(null);
        setSystemHealth((prev) => ({ ...prev, authOperational: false }));
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    let loadedDetections = false;
    let loadedAlerts = false;
    const finishIfReady = () => {
      if (loadedDetections && loadedAlerts) {
        setDataLoading(false);
      }
    };

    const userPath = `users/${user.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setSystemHealth((prev) => ({ ...prev, firestoreOperational: true }));
        if (snap.exists()) {
          const d = snap.data();
          setUserProfile({
            uid: String(d.uid || user.uid),
            fullName: String(d.fullName || user.displayName || 'VoiceGuard Analyst'),
            email: String(d.email || user.email || ''),
            photoURL: typeof d.photoURL === 'string' ? d.photoURL : user.photoURL || '',
            emailAlerts: typeof d.emailAlerts === 'boolean' ? d.emailAlerts : true,
            highRiskAlerts: typeof d.highRiskAlerts === 'boolean' ? d.highRiskAlerts : true,
            themePreference: d.themePreference === 'midnight' ? 'midnight' : 'dark',
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(),
            lastLogin: d.lastLogin?.toDate ? d.lastLogin.toDate() : new Date(),
          });
        }
      },
      (error) => {
        setSystemHealth((prev) => ({ ...prev, firestoreOperational: false }));
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    );

    const detectionsPath = `users/${user.uid}/detections`;
    const detectionsQuery = query(
      collection(db, 'users', user.uid, 'detections'),
      where('userId', '==', user.uid)
    );

    const unsubDetections = onSnapshot(
      detectionsQuery,
      (snap) => {
        const items = snap.docs
          .map((d) => mapDocToDetection(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setLiveDetections(items);
        loadedDetections = true;
        finishIfReady();
      },
      (error) => {
        setDataLoading(false);
        handleFirestoreError(error, OperationType.LIST, detectionsPath);
      }
    );

    const alertsPath = `users/${user.uid}/alerts`;
    const alertsQuery = query(
      collection(db, 'users', user.uid, 'alerts'),
      where('userId', '==', user.uid)
    );

    const unsubAlerts = onSnapshot(
      alertsQuery,
      (snap) => {
        const items = snap.docs
          .map((d) => mapDocToAlert(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setLiveAlerts(items);
        loadedAlerts = true;
        finishIfReady();
      },
      (error) => {
        setDataLoading(false);
        handleFirestoreError(error, OperationType.LIST, alertsPath);
      }
    );

    return () => {
      unsubProfile();
      unsubDetections();
      unsubAlerts();
    };
  }, [user]);

  const updateDemoAlert = useCallback(
    (alertId: string, updates: { status?: AlertStatus; investigationNotes?: string; isRead?: boolean }) => {
      setDemoAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? {
                ...a,
                ...(updates.status ? { status: updates.status } : {}),
                ...(typeof updates.investigationNotes === 'string'
                  ? { investigationNotes: updates.investigationNotes }
                  : {}),
                ...(typeof updates.isRead === 'boolean' ? { isRead: updates.isRead } : {}),
                updatedAt: new Date(),
              }
            : a
        )
      );
    },
    []
  );

  const deleteDemoDetection = useCallback((detectionId: string) => {
    setDemoDetections((prev) => prev.filter((d) => d.id !== detectionId));
  }, []);

  const detections = useMemo(
    () => (dataMode === 'demo' ? demoDetections : liveDetections),
    [dataMode, demoDetections, liveDetections]
  );

  const alerts = useMemo(
    () => (dataMode === 'demo' ? demoAlerts : liveAlerts),
    [dataMode, demoAlerts, liveAlerts]
  );

  const loginWithEmail = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await ensureUserProfileDoc({
      uid: cred.user.uid,
      fullName: cred.user.displayName || email.split('@')[0],
      email: cred.user.email || email,
      photoURL: cred.user.photoURL || '',
    });
  }, []);

  const signupWithEmail = useCallback(async (fullName: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: fullName.trim() });
    await sendEmailVerification(cred.user);
    await ensureUserProfileDoc({
      uid: cred.user.uid,
      fullName: fullName.trim(),
      email: cred.user.email || email.trim(),
      photoURL: '',
    });
  }, []);

  const loginWithGoogle = useCallback(async (rememberMe = true) => {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserProfileDoc({
      uid: cred.user.uid,
      fullName: cred.user.displayName || cred.user.email?.split('@')[0] || 'VoiceGuard Analyst',
      email: cred.user.email || '',
      photoURL: cred.user.photoURL || '',
    });
  }, []);

  const sendResetPasswordEmail = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) throw new Error('No authenticated user found.');
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshVerificationStatus = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const updatedUser = auth.currentUser;
    setUser(updatedUser ? ({ ...updatedUser } as User) : null);
    return Boolean(updatedUser?.emailVerified);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        authLoading,
        dataLoading,
        dataMode,
        setDataMode,
        detections,
        alerts,
        liveDetections,
        liveAlerts,
        updateDemoAlert,
        deleteDemoDetection,
        systemHealth,
        refreshSystemHealth,
        activeReport,
        setActiveReport,
        loginWithEmail,
        signupWithEmail,
        loginWithGoogle,
        sendResetPasswordEmail,
        resendVerificationEmail,
        refreshVerificationStatus,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
