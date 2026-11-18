export const SUPPORTED_LANGUAGES = [
  'English',
  'Hindi',
  'Marathi',
  'Gujarati',
  'Tamil',
  'Bengali',
  'Telugu',
  'Punjabi',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type RiskClassification =
  | 'Authentic Voice'
  | 'Suspicious Voice'
  | 'Potential AI-Generated Voice'
  | 'High-Risk Voice';

export type RiskLevel = 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Critical Risk';
export type AnalysisMode = 'experimental_signal_analysis' | 'external_model_inference';
export type AudioSourceType = 'upload' | 'live_recording';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'open' | 'under_investigation' | 'resolved';

export interface FrequencyBand {
  band: string;
  energy: number;
}

export interface ExtractedFeatures {
  rmsEnergy: number;
  zeroCrossingRate: number;
  spectralCentroid: number;
  spectralBandwidth: number;
  spectralRolloff: number;
  pitchVariance: number;
  silenceRatio: number;
  dynamicRange: number;
  sampleRate: number;
  peakFrequency: number;
  frequencyBands: FrequencyBand[];
}

export interface SignalIndicator {
  label: string;
  finding: string;
  severity: 'normal' | 'caution' | 'elevated';
}

export interface AnalysisApiResponse {
  classification: RiskClassification;
  riskLevel: RiskLevel;
  riskScore: number;
  authenticityScore: number;
  confidence: number | null;
  analysisMode: AnalysisMode;
  modelStatus: string;
  explanation: string;
  recommendations: string[];
  signalIndicators: SignalIndicator[];
}

export interface AnalyzeAudioMetadata {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  originalSampleRate: number;
  processedSampleRate: number;
  originalChannels: number;
  processedChannels: number;
  durationSeconds: number;
  normalized: boolean;
  peakAmplitudeBeforeNorm: number;
  rmsLevel: number;
  sampleCount: number;
  language?: string | null;
}

export interface AnalyzeAudioApiResponse {
  detectionStatus: 'MODEL_NOT_CONFIGURED' | 'COMPLETED';
  classification: 'UNVERIFIED_NO_MODEL' | 'AUTHENTIC' | 'POTENTIALLY_SYNTHETIC';
  confidence: number | null;
  analysisTimestamp: string;
  audioMetadata: AnalyzeAudioMetadata;
  processingStatus: string;
  explanation: string;
  modelInfo: {
    name: string | null;
    architecture: string | null;
    ready: boolean;
  };
  waveformPreview: number[];
  serviceEngine?: 'fastapi-librosa-pipeline' | 'node-ffmpeg-pipeline';
}

export interface VoiceDetectionRecord {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  duration: number;
  sourceType: AudioSourceType;
  language?: SupportedLanguage;
  classification: RiskClassification;
  riskLevel: RiskLevel;
  riskScore: number;
  authenticityScore: number;
  confidence: number | null;
  analysisMode: AnalysisMode;
  modelStatus: string;
  extractedFeatures: ExtractedFeatures;
  waveformPreview: number[];
  spectrumPreview: number[];
  explanation: string;
  recommendations: string[];
  isSavedReport: boolean;
  createdAt: Date;
}

export interface SecurityAlertRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  riskLevel: RiskLevel;
  status: AlertStatus;
  investigationNotes: string;
  detectionId: string;
  fileName?: string;
  riskScore?: number;
  isRead: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface UserProfileRecord {
  uid: string;
  fullName: string;
  email: string;
  photoURL?: string;
  emailAlerts?: boolean;
  highRiskAlerts?: boolean;
  themePreference?: 'dark' | 'midnight';
  createdAt: Date;
  lastLogin: Date;
}

export interface SystemHealthState {
  authOperational: boolean;
  firestoreOperational: boolean | null;
  audioEngineReady: boolean;
  apiConnected: boolean | null;
  modelConfigured: boolean;
  engineLabel: string;
}
