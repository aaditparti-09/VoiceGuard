import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  SUPPORTED_LANGUAGES,
  type AlertSeverity,
  type AlertStatus,
  type AnalysisApiResponse,
  type AnalyzeAudioApiResponse,
  type AudioSourceType,
  type ExtractedFeatures,
  type RiskClassification,
  type RiskLevel,
  type SecurityAlertRecord,
  type SupportedLanguage,
  type UserProfileRecord,
  type VoiceDetectionRecord,
} from '../types/voiceguard';

export function normalizeLanguage(raw: unknown): SupportedLanguage | undefined {
  if (typeof raw !== 'string') return undefined;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(raw)
    ? (raw as SupportedLanguage)
    : undefined;
}

function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function deriveRiskLevel(score: number): RiskLevel {
  if (score <= 30) return 'Low Risk';
  if (score <= 65) return 'Medium Risk';
  if (score <= 85) return 'High Risk';
  return 'Critical Risk';
}

export function normalizeClassification(raw: string, score: number): RiskClassification {
  if (
    raw === 'Authentic Voice' ||
    raw === 'Suspicious Voice' ||
    raw === 'Potential AI-Generated Voice' ||
    raw === 'High-Risk Voice'
  ) {
    return raw;
  }
  if (score <= 30) return 'Authentic Voice';
  if (score <= 65) return 'Suspicious Voice';
  if (score <= 85) return 'Potential AI-Generated Voice';
  return 'High-Risk Voice';
}

export async function fetchApiHealth(): Promise<{
  apiConnected: boolean;
  modelConfigured: boolean;
  engineLabel: string;
}> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      return { apiConnected: false, modelConfigured: false, engineLabel: 'API Unavailable' };
    }
    const data = (await res.json()) as { modelConfigured?: boolean; engineLabel?: string };
    return {
      apiConnected: true,
      modelConfigured: Boolean(data.modelConfigured),
      engineLabel: data.engineLabel || 'Experimental Signal-Analysis Mode',
    };
  } catch {
    return { apiConnected: false, modelConfigured: false, engineLabel: 'API Unreachable' };
  }
}

export async function runServerAnalysis(params: {
  fileName: string;
  fileType: string;
  fileSize: number;
  duration: number;
  sourceType: AudioSourceType;
  extractedFeatures: ExtractedFeatures;
}): Promise<AnalysisApiResponse> {
  const response = await fetch('/api/analyze-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: 'Analysis service error' }));
    throw new Error(errBody.error || 'Voice analysis request failed.');
  }

  return (await response.json()) as AnalysisApiResponse;
}

export function uploadAndAnalyzeAudio(params: {
  file: File;
  language?: SupportedLanguage;
  onProgress?: (percent: number) => void;
}): Promise<AnalyzeAudioApiResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('audio', params.file, params.file.name);
    if (params.language) {
      formData.append('language', params.language);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/analyze-audio', true);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && params.onProgress) {
        const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
        params.onProgress(pct);
      }
    };

    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        parsed = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed as AnalyzeAudioApiResponse);
      } else {
        const errObj = parsed as { error?: string; detail?: string } | null;
        reject(new Error(errObj?.error || errObj?.detail || `Audio analysis failed (HTTP ${xhr.status}).`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading audio to /api/analyze-audio.'));
    };

    xhr.send(formData);
  });
}

export async function ensureUserProfileDoc(params: {
  uid: string;
  fullName: string;
  email: string;
  photoURL?: string;
}): Promise<void> {
  const userRef = doc(db, 'users', params.uid);
  const path = `users/${params.uid}`;
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: params.uid,
        fullName: (params.fullName || 'VoiceGuard Analyst').slice(0, 120),
        email: params.email.slice(0, 200),
        photoURL: (params.photoURL || '').slice(0, 500),
        emailAlerts: true,
        highRiskAlerts: true,
        themePreference: 'dark',
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        lastLogin: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfileData(
  uid: string,
  updates: Partial<Pick<UserProfileRecord, 'fullName' | 'photoURL' | 'emailAlerts' | 'highRiskAlerts' | 'themePreference'>>
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const path = `users/${uid}`;
  try {
    const payload: Record<string, unknown> = {};
    if (typeof updates.fullName === 'string') payload.fullName = updates.fullName.trim().slice(0, 120);
    if (typeof updates.photoURL === 'string') payload.photoURL = updates.photoURL.trim().slice(0, 500);
    if (typeof updates.emailAlerts === 'boolean') payload.emailAlerts = updates.emailAlerts;
    if (typeof updates.highRiskAlerts === 'boolean') payload.highRiskAlerts = updates.highRiskAlerts;
    if (updates.themePreference === 'dark' || updates.themePreference === 'midnight') {
      payload.themePreference = updates.themePreference;
    }
    await updateDoc(userRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveDetectionAndAlert(params: {
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  duration: number;
  sourceType: AudioSourceType;
  language?: SupportedLanguage;
  extractedFeatures: ExtractedFeatures;
  waveformPreview: number[];
  spectrumPreview: number[];
  analysis: AnalysisApiResponse;
  createAlerts?: boolean;
}): Promise<{ detectionId: string; alertCreated: boolean; savedToCloud: boolean }> {
  const detectionId = generateSafeId('det');

  if (!auth.currentUser?.emailVerified) {
    return { detectionId, alertCreated: false, savedToCloud: false };
  }

  const detectionPath = `users/${params.userId}/detections/${detectionId}`;
  const detectionRef = doc(db, 'users', params.userId, 'detections', detectionId);

  const sanitizedFeatures: ExtractedFeatures = {
    rmsEnergy: params.extractedFeatures.rmsEnergy,
    zeroCrossingRate: params.extractedFeatures.zeroCrossingRate,
    spectralCentroid: params.extractedFeatures.spectralCentroid,
    spectralBandwidth: params.extractedFeatures.spectralBandwidth,
    spectralRolloff: params.extractedFeatures.spectralRolloff,
    pitchVariance: params.extractedFeatures.pitchVariance,
    silenceRatio: params.extractedFeatures.silenceRatio,
    dynamicRange: params.extractedFeatures.dynamicRange,
    sampleRate: params.extractedFeatures.sampleRate,
    peakFrequency: params.extractedFeatures.peakFrequency,
    frequencyBands: params.extractedFeatures.frequencyBands.slice(0, 16),
  };

  try {
    await setDoc(detectionRef, {
      userId: params.userId,
      fileName: params.fileName.slice(0, 200),
      fileType: params.fileType.slice(0, 64),
      fileSize: Math.min(52428800, Math.max(0, params.fileSize)),
      duration: Math.min(3600, Math.max(0, params.duration)),
      sourceType: params.sourceType,
      ...(params.language ? { language: params.language } : {}),
      classification: params.analysis.classification,
      riskLevel: params.analysis.riskLevel,
      riskScore: params.analysis.riskScore,
      authenticityScore: params.analysis.authenticityScore,
      confidence: params.analysis.confidence,
      analysisMode: params.analysis.analysisMode,
      modelStatus: params.analysis.modelStatus.slice(0, 160),
      extractedFeatures: sanitizedFeatures,
      waveformPreview: params.waveformPreview.slice(0, 64),
      spectrumPreview: params.spectrumPreview.slice(0, 32),
      explanation: params.analysis.explanation.slice(0, 2000),
      recommendations: params.analysis.recommendations.slice(0, 10),
      isSavedReport: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, detectionPath);
  }

  let alertCreated = false;
  const shouldAlert = params.createAlerts !== false && params.analysis.riskScore > 30;
  if (shouldAlert) {
    const alertId = generateSafeId('alt');
    const alertPath = `users/${params.userId}/alerts/${alertId}`;
    const alertRef = doc(db, 'users', params.userId, 'alerts', alertId);

    const severity: AlertSeverity =
      params.analysis.riskLevel === 'Critical Risk'
        ? 'critical'
        : params.analysis.riskLevel === 'High Risk'
          ? 'high'
          : 'medium';

    const titlePrefix =
      severity === 'critical'
        ? 'Critical Voice Risk'
        : severity === 'high'
          ? 'High-Risk Voice Alert'
          : 'Suspicious Voice Indicators';

    const message =
      severity === 'critical'
        ? 'Critical voice impersonation indicators detected. Stop the interaction and verify the caller independently.'
        : severity === 'high'
          ? 'High-risk synthetic speech indicators detected. Escalate to out-of-band verification.'
          : 'Suspicious acoustic patterns detected. Verify the speaker before sharing sensitive information.';

    try {
      await setDoc(alertRef, {
        userId: params.userId,
        title: `${titlePrefix}: ${params.fileName.slice(0, 100)}`,
        message,
        severity,
        riskLevel: params.analysis.riskLevel,
        status: 'open',
        investigationNotes: '',
        detectionId,
        fileName: params.fileName.slice(0, 200),
        riskScore: params.analysis.riskScore,
        isRead: false,
        createdAt: serverTimestamp(),
      });
      alertCreated = true;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, alertPath);
    }
  }

  return { detectionId, alertCreated, savedToCloud: true };
}

export async function toggleSaveReport(userId: string, detectionId: string, nextState: boolean): Promise<void> {
  const path = `users/${userId}/detections/${detectionId}`;
  try {
    await updateDoc(doc(db, 'users', userId, 'detections', detectionId), {
      isSavedReport: nextState,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateDetectionLanguage(
  userId: string,
  detectionId: string,
  language: SupportedLanguage
): Promise<void> {
  const path = `users/${userId}/detections/${detectionId}`;
  try {
    await updateDoc(doc(db, 'users', userId, 'detections', detectionId), {
      language,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDetectionRecord(userId: string, detectionId: string): Promise<void> {
  const path = `users/${userId}/detections/${detectionId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'detections', detectionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function markAlertAsRead(userId: string, alertId: string): Promise<void> {
  const path = `users/${userId}/alerts/${alertId}`;
  try {
    await updateDoc(doc(db, 'users', userId, 'alerts', alertId), {
      isRead: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateAlertInvestigation(
  userId: string,
  alertId: string,
  updates: {
    status?: AlertStatus;
    investigationNotes?: string;
    isRead?: boolean;
  }
): Promise<void> {
  const path = `users/${userId}/alerts/${alertId}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.status) payload.status = updates.status;
    if (typeof updates.investigationNotes === 'string') {
      payload.investigationNotes = updates.investigationNotes.slice(0, 2000);
    }
    if (typeof updates.isRead === 'boolean') payload.isRead = updates.isRead;
    await updateDoc(doc(db, 'users', userId, 'alerts', alertId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAlertRecord(userId: string, alertId: string): Promise<void> {
  const path = `users/${userId}/alerts/${alertId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'alerts', alertId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteAllUserFirestoreData(userId: string): Promise<void> {
  try {
    const detectionsSnap = await getDocs(collection(db, 'users', userId, 'detections'));
    for (const d of detectionsSnap.docs) {
      await deleteDoc(d.ref);
    }
    const alertsSnap = await getDocs(collection(db, 'users', userId, 'alerts'));
    for (const a of alertsSnap.docs) {
      await deleteDoc(a.ref);
    }
    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

export function buildLocalDetectionRecord(params: {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  duration: number;
  sourceType: AudioSourceType;
  language?: SupportedLanguage;
  extractedFeatures: ExtractedFeatures;
  waveformPreview: number[];
  spectrumPreview: number[];
  analysis: AnalysisApiResponse;
}): VoiceDetectionRecord {
  return {
    id: params.id,
    userId: params.userId,
    fileName: params.fileName,
    fileType: params.fileType,
    fileSize: params.fileSize,
    duration: params.duration,
    sourceType: params.sourceType,
    ...(params.language ? { language: params.language } : {}),
    classification: params.analysis.classification,
    riskLevel: params.analysis.riskLevel,
    riskScore: params.analysis.riskScore,
    authenticityScore: params.analysis.authenticityScore,
    confidence: params.analysis.confidence,
    analysisMode: params.analysis.analysisMode,
    modelStatus: params.analysis.modelStatus,
    extractedFeatures: params.extractedFeatures,
    waveformPreview: params.waveformPreview,
    spectrumPreview: params.spectrumPreview,
    explanation: params.analysis.explanation,
    recommendations: params.analysis.recommendations,
    isSavedReport: false,
    createdAt: new Date(),
  };
}

export function mapDocToDetection(id: string, data: Record<string, unknown>): VoiceDetectionRecord {
  const createdAtRaw = data.createdAt as { toDate?: () => Date } | undefined;
  const riskScore = Number(data.riskScore || 0);
  const authenticityScore =
    typeof data.authenticityScore === 'number' ? data.authenticityScore : Math.max(0, 100 - riskScore);
  const riskLevel =
    data.riskLevel === 'Low Risk' ||
    data.riskLevel === 'Medium Risk' ||
    data.riskLevel === 'High Risk' ||
    data.riskLevel === 'Critical Risk'
      ? data.riskLevel
      : deriveRiskLevel(riskScore);

  return {
    id,
    userId: String(data.userId || ''),
    fileName: String(data.fileName || 'Untitled Audio'),
    fileType: String(data.fileType || 'audio/wav'),
    fileSize: Number(data.fileSize || 0),
    duration: Number(data.duration || 0),
    sourceType: data.sourceType === 'live_recording' ? 'live_recording' : 'upload',
    language: normalizeLanguage(data.language),
    classification: normalizeClassification(String(data.classification || ''), riskScore),
    riskLevel,
    riskScore,
    authenticityScore,
    confidence: typeof data.confidence === 'number' ? data.confidence : null,
    analysisMode:
      data.analysisMode === 'external_model_inference'
        ? 'external_model_inference'
        : 'experimental_signal_analysis',
    modelStatus: String(data.modelStatus || 'Experimental Signal-Analysis Mode'),
    extractedFeatures: data.extractedFeatures as ExtractedFeatures,
    waveformPreview: Array.isArray(data.waveformPreview) ? (data.waveformPreview as number[]) : [],
    spectrumPreview: Array.isArray(data.spectrumPreview) ? (data.spectrumPreview as number[]) : [],
    explanation: String(data.explanation || ''),
    recommendations: Array.isArray(data.recommendations) ? (data.recommendations as string[]) : [],
    isSavedReport: Boolean(data.isSavedReport),
    createdAt: createdAtRaw?.toDate ? createdAtRaw.toDate() : new Date(),
  };
}

export function mapDocToAlert(id: string, data: Record<string, unknown>): SecurityAlertRecord {
  const createdAtRaw = data.createdAt as { toDate?: () => Date } | undefined;
  const updatedAtRaw = data.updatedAt as { toDate?: () => Date } | undefined;
  const severity: AlertSeverity =
    data.severity === 'critical' ||
    data.severity === 'high' ||
    data.severity === 'medium' ||
    data.severity === 'low'
      ? data.severity
      : 'medium';

  const riskScore = typeof data.riskScore === 'number' ? data.riskScore : undefined;
  const riskLevel: RiskLevel =
    data.riskLevel === 'Low Risk' ||
    data.riskLevel === 'Medium Risk' ||
    data.riskLevel === 'High Risk' ||
    data.riskLevel === 'Critical Risk'
      ? data.riskLevel
      : typeof riskScore === 'number'
        ? deriveRiskLevel(riskScore)
        : severity === 'critical'
          ? 'Critical Risk'
          : severity === 'high'
            ? 'High Risk'
            : severity === 'medium'
              ? 'Medium Risk'
              : 'Low Risk';

  const status: AlertStatus =
    data.status === 'under_investigation' || data.status === 'resolved' ? data.status : 'open';

  return {
    id,
    userId: String(data.userId || ''),
    title: String(data.title || 'Security Alert'),
    message: String(data.message || ''),
    severity,
    riskLevel,
    status,
    investigationNotes: typeof data.investigationNotes === 'string' ? data.investigationNotes : '',
    detectionId: String(data.detectionId || ''),
    fileName: typeof data.fileName === 'string' ? data.fileName : undefined,
    riskScore,
    isRead: Boolean(data.isRead),
    createdAt: createdAtRaw?.toDate ? createdAtRaw.toDate() : new Date(),
    updatedAt: updatedAtRaw?.toDate ? updatedAtRaw.toDate() : undefined,
  };
}
