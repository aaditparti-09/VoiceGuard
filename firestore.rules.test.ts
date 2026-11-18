// Security Rules Verification Specification for VoiceGuard AI
// Maps the 12 adversarial test cases in security_spec.md to expected Firestore rules denials.

export interface SecurityAuditCase {
  id: number;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  rationale: string;
}

export const DIRTY_DOZEN_AUDIT_CASES: SecurityAuditCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read',
    path: '/users/uid1/detections/det1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'isOwner requires request.auth != null',
  },
  {
    id: 2,
    name: 'Cross-user get',
    path: '/users/victimUid/detections/det1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'request.auth.uid must equal userId',
  },
  {
    id: 3,
    name: 'Cross-user list',
    path: '/users/victimUid/alerts',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow list requires isOwner(userId) and resource.data.userId == request.auth.uid',
  },
  {
    id: 4,
    name: 'Identity spoofing',
    path: '/users/attackerUid/detections/det1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidDetection requires data.userId == userId && data.userId == request.auth.uid',
  },
  {
    id: 5,
    name: 'Shadow field injection',
    path: '/users/uid1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidUserProfile enforces keys().hasOnly(...)',
  },
  {
    id: 6,
    name: 'Unverified email write',
    path: '/users/uid1/detections/det1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isVerifiedOwner enforces request.auth.token.email_verified == true',
  },
  {
    id: 7,
    name: 'Backdated timestamp',
    path: '/users/uid1/detections/det1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'incoming().createdAt == request.time required on create',
  },
  {
    id: 8,
    name: 'Oversized explanation payload',
    path: '/users/uid1/detections/det1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'explanation.size() <= 2000 enforced',
  },
  {
    id: 9,
    name: 'Out-of-bounds riskScore',
    path: '/users/uid1/detections/det1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'riskScore >= 0 && riskScore <= 100 enforced',
  },
  {
    id: 10,
    name: 'Invalid classification enum',
    path: '/users/uid1/detections/det1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'classification in [GENUINE, SUSPICIOUS, HIGH RISK]',
  },
  {
    id: 11,
    name: 'Document ID poisoning',
    path: '/users/uid1/detections/bad$id!',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidId enforces ^[a-zA-Z0-9_\\-]+$ and <= 128 chars',
  },
  {
    id: 12,
    name: 'Mutating immutable score on update',
    path: '/users/uid1/detections/det1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'affectedKeys().hasOnly(["isSavedReport"]) blocks riskScore mutation',
  },
];
