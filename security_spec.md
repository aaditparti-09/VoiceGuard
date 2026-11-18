# VoiceGuard AI Firestore Security Specification

## 1. Data Invariants
1. **User Isolation**: Every document in `users/{userId}`, `users/{userId}/detections/{detectionId}`, and `users/{userId}/alerts/{alertId}` is strictly owned by `userId == request.auth.uid`. Cross-tenant read, list, create, update, or delete is unconditionally denied.
2. **Verified Identity for Standard Operations**: Detections and security alerts require `request.auth.token.email_verified == true`.
3. **Immutable Ownership & Timestamps**: `uid`, `userId`, and `createdAt` can never be mutated after creation (`incoming().createdAt == existing().createdAt`).
4. **Server Timestamp Enforcement**: `createdAt` and `lastLogin` must match `request.time`.
5. **Bounded Payloads**: Every string, array, map, and numeric field is strictly type-checked and bounded to prevent resource exhaustion and shadow-field injection (`keys().hasOnly(...)`).
6. **Parent Existence (Master Gate)**: Creating a detection or alert requires that `/users/{userId}` exists.

## 2. Dirty Dozen Adversarial Payloads
1. Unauthenticated read on `/users/uid1/detections/det1` -> `PERMISSION_DENIED`.
2. Cross-user get on `/users/victimUid/detections/det1` as `attackerUid` -> `PERMISSION_DENIED`.
3. Cross-user list on `/users/victimUid/alerts` as `attackerUid` -> `PERMISSION_DENIED`.
4. Identity spoofing: `attackerUid` creates `/users/attackerUid/detections/det1` with `userId: "victimUid"` -> `PERMISSION_DENIED`.
5. Shadow field injection on `/users/uid1`: adding `isAdmin: true` or `role: "superadmin"` -> `PERMISSION_DENIED`.
6. Unverified email write on `/users/uid1/detections/det1` with `email_verified: false` -> `PERMISSION_DENIED`.
7. Fake `createdAt` timestamp backdated to `2020-01-01` -> `PERMISSION_DENIED`.
8. Oversized `explanation` string (> 2000 chars) or oversized `fileName` (> 200 chars) -> `PERMISSION_DENIED`.
9. Out-of-bounds `riskScore` (`-5` or `150`) -> `PERMISSION_DENIED`.
10. Invalid `classification` enum (`"UNKNOWN"` instead of `GENUINE` / `SUSPICIOUS` / `HIGH RISK`) -> `PERMISSION_DENIED`.
11. ID poisoning: document ID containing invalid characters or exceeding 128 chars -> `PERMISSION_DENIED`.
12. Mutating `riskScore` or `classification` on an existing detection during `update` (only `isSavedReport` can be toggled) -> `PERMISSION_DENIED`.
