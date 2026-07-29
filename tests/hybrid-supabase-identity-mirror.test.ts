import { describe, expect, it } from "vitest";

import {
  createHybridRequestAttestation,
  createSessionLivenessBinding,
  sanitizeRemoteIdentityEpochEvidence,
  verifyHybridRequestAttestation,
} from "@/lib/server/hybrid-auth/session-authority";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const SESSION_UUID = "22222222-2222-4222-8222-222222222222";
const ISSUER = "https://remote.example.supabase.co/auth/v1";
const SECRET = "0123456789abcdef0123456789abcdef";

describe("hybrid identity epoch and session-liveness authority", () => {
  it("keeps only the private mirror allowlist and rejects PII/provider payloads", () => {
    expect(sanitizeRemoteIdentityEpochEvidence({
      active_epoch: true,
      issuer: ISSUER,
      owner_uuid: OWNER_UUID,
      identity_created_at: "2026-07-30T00:00:00.000Z",
      remote_revision: 7,
      remote_identity_digest: "a".repeat(64),
      verified_at: "2026-07-30T00:01:00.000Z",
      evidence_revision: 8,
      email: "must-not-be-stored@example.com",
      provider_subject: "must-not-be-stored",
      raw_user_meta_data: { name: "must-not-be-stored" },
    })).toEqual({
      active_epoch: true,
      issuer: ISSUER,
      owner_uuid: OWNER_UUID,
      identity_created_at: "2026-07-30T00:00:00.000Z",
      remote_revision: 7,
      remote_identity_digest: "a".repeat(64),
      verified_at: "2026-07-30T00:01:00.000Z",
      deleted_terminal_at: null,
      deleted_terminal_reason: null,
      evidence_revision: 8,
    });
  });

  it("stores a versioned HMAC instead of raw session material", () => {
    const binding = createSessionLivenessBinding({
      secret: SECRET,
      keyVersion: 1,
      issuer: ISSUER,
      ownerUuid: OWNER_UUID,
      sessionId: SESSION_UUID,
      identityCreatedAt: "2026-07-30T00:00:00.000Z",
      remoteVerifiedAt: "2026-07-30T00:01:00.000Z",
      ttlSeconds: 120,
    });

    expect(binding.session_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(binding)).not.toContain(SESSION_UUID);
    expect(binding.binding_expires_at).toBe("2026-07-30T00:03:00.000Z");
  });

  it("binds the attestation to method, path, owner, epoch and a short TTL", () => {
    const attestation = createHybridRequestAttestation({
      secret: SECRET,
      keyVersion: 1,
      method: "POST",
      path: "/rest/v1/meals",
      issuer: ISSUER,
      ownerUuid: OWNER_UUID,
      identityCreatedAt: "2026-07-30T00:00:00.000Z",
      sessionKeyHash: "b".repeat(64),
      issuedAtSeconds: 1_800_000_000,
      ttlSeconds: 30,
    });

    expect(verifyHybridRequestAttestation({
      ...attestation,
      secret: SECRET,
      method: "POST",
      path: "/rest/v1/meals",
      nowSeconds: 1_800_000_010,
    })).toMatchObject({ ok: true });
    expect(verifyHybridRequestAttestation({
      ...attestation,
      secret: SECRET,
      method: "DELETE",
      path: "/rest/v1/meals",
      nowSeconds: 1_800_000_010,
    })).toMatchObject({ ok: false });
    expect(verifyHybridRequestAttestation({
      ...attestation,
      secret: SECRET,
      method: "POST",
      path: "/rest/v1/meals",
      nowSeconds: 1_800_000_031,
    })).toMatchObject({ ok: false });
  });
});
