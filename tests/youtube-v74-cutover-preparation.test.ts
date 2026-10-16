import { describe, expect, it } from "vitest";
import { DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS } from "../scripts/lib/youtube-extraction-worker-artifact.mjs";
import { V74_TRANSITION as V, assertV74WorkerCredential, buildV74RegistrationIntent, classifyV74RegistrationRecovery } from "../scripts/lib/youtube-v74-cutover-preparation.mjs";

const now = new Date("2026-10-16T14:00:00Z");
function fixture() {
  const iat = now.getTime() / 1000;
  const candidate = { ...V };
  const claims = { role: "youtube_extraction_worker", scope: "youtube-extraction-worker", iss: "https://worker.mumeok.kr", aud: "youtube-extraction",
    generation: 49, release_sha: V.releaseSha, schema_identity: V.schemaIdentity, allowed_snapshot_digest: V.snapshotDigest,
    jti_hash: "a".repeat(64), iat, exp: iat + V.workerLifetimeSeconds };
  const metadata = { generation: 49, release_sha: V.releaseSha, schema_identity: V.schemaIdentity,
    allowed_snapshot_digest: V.snapshotDigest, jti_sha256: claims.jti_hash, expires_at: new Date(claims.exp * 1000).toISOString() };
  const before = { ledgerCount: 232, catalogSha256: V.catalogSha256, schemaSha256: V.schemaSha256,
    targetSha256: "b".repeat(64), normalDataSha256: "c".repeat(64), authoritySha256: "d".repeat(64),
    credentialRowSha256: "e".repeat(64), policyRowSha256: "f".repeat(64), queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0,
    controls: { productWriter: true, weightWriter: true, quantityWriter: true, personalAttestationWriter: true, r2Active: false, r2Recording: false },
    policy: { version: 3, extractorMode: "i031_codex_vision", resultAffectingOptions: DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
      pipelineIdentity: V.predecessorPipelineIdentity, snapshotDigest: V.predecessorSnapshotDigest, enabled: false,
      fingerprintKeyVersion: "current-kept", previousFingerprintKeyVersion: "previous-kept", previousFingerprintValidUntil: "2026-10-17T14:00:00Z" },
    credential: { generation: 48, releaseSha: V.predecessorReleaseSha, schemaIdentity: V.schemaIdentity, snapshotDigest: V.predecessorSnapshotDigest,
      jtiSha256: "1".repeat(64), expiresAt: "2026-10-20T14:52:30.000Z" },
    service: { loaded: false, plistSha256: "2".repeat(64) } };
  const managerClaims = { role: "youtube_extraction_credential_manager", scope: "youtube-extraction-credential-manager",
    iss: "https://worker.mumeok.kr", aud: "youtube-extraction", jti_hash: "3".repeat(64), iat, exp: iat + 300 };
  return { before, candidate, claims, metadata, managerClaims, now };
}
function registered(intent: ReturnType<typeof buildV74RegistrationIntent>) {
  return { ...structuredClone(intent.before), credential: structuredClone(intent.worker), policy: structuredClone(intent.policyAfter),
    credentialRowSha256: "4".repeat(64), policyRowSha256: "5".repeat(64) };
}

describe("v74 48→49 preparation only", () => {
  it("keeps current/previous fingerprint rotation and all writers while planning only the exact CAS", () => {
    const f = fixture(), intent = buildV74RegistrationIntent(f);
    expect(intent).toMatchObject({ cas: { expectedGeneration: 48, newGeneration: 49 }, requiresApproval: true, productionExecutorAvailable: false });
    expect(intent.policyAfter).toEqual({ ...f.before.policy, pipelineIdentity: V.pipelineIdentity, snapshotDigest: V.snapshotDigest });
    expect(intent.before).toEqual(f.before);
    expect(JSON.stringify(intent)).not.toContain("managerClaims");
  });
  it.each([299, 301, 518399, 518401])("rejects worker lifetime %s", (seconds) => {
    const f = fixture(); f.claims.exp = f.claims.iat + seconds;
    expect(() => assertV74WorkerCredential(f)).toThrow("lifetime");
  });
  it("rejects a manager over 300 seconds or a different role", () => {
    const f = fixture();f.managerClaims.exp++;
    expect(() => buildV74RegistrationIntent(f)).toThrow("five minutes");
    f.managerClaims.exp--;f.managerClaims.role = "service_role";
    expect(() => buildV74RegistrationIntent(f)).toThrow("manager role");
  });
  it.each(["queued", "processing", "activeEnqueueSessions"])("rejects busy %s", (field) => {
    const f = fixture();Object.assign(f.before, { [field]: 1 });
    expect(() => buildV74RegistrationIntent(f)).toThrow("not drained");
  });
  it("rejects held permits and an unstopped predecessor", () => {
    const f = fixture();f.before.permitHeld = true;
    expect(() => buildV74RegistrationIntent(f)).toThrow("not drained");
    f.before.permitHeld = false;f.before.service.loaded = true;
    expect(() => buildV74RegistrationIntent(f)).toThrow("not stopped");
  });
  it.each(["releaseSha", "artifactSha256", "schemaSha256", "snapshotDigest"])("rejects candidate drift: %s", (field) => {
    const f = fixture();Object.assign(f.candidate, { [field]: "0".repeat(64) });
    expect(() => buildV74RegistrationIntent(f)).toThrow("candidate");
  });
  it("permits predecessor recovery only after a confirmed not-applied readback", () => {
    const intent = buildV74RegistrationIntent(fixture());
    expect(classifyV74RegistrationRecovery({ intent, observed: structuredClone(intent.before), now }))
      .toMatchObject({ state: "not-applied", mayRestore48: true, mayRotateCredential: false });
  });
  it("reconciles a lost commit response as same49 repair, never a repeated issue/CAS or old48 rollback", () => {
    const intent = buildV74RegistrationIntent(fixture()), committed = registered(intent);
    for (let retry = 0; retry < 2; retry++) expect(classifyV74RegistrationRecovery({ intent, observed: committed, now }))
      .toMatchObject({ state: "registered-disabled", next: "repair-same49-only", mayRestore48: false, mayIssueCredential: false, mayRotateCredential: false });
  });
  it("keeps an ON response read-only until its durable activation receipt is reconciled", () => {
    const intent = buildV74RegistrationIntent(fixture()), after = registered(intent);after.policy.enabled = true;
    expect(classifyV74RegistrationRecovery({ intent, observed: after, now }))
      .toMatchObject({ state: "registered-on-needs-receipt", next: "read-only-activation-reconciliation", mayRestore48: false });
  });
  it.each(["targetSha256", "normalDataSha256", "authoritySha256", "schemaSha256"])("blocks mixed/foreign readback %s without compensation", (field) => {
    const intent = buildV74RegistrationIntent(fixture()), after = registered(intent);Object.assign(after, { [field]: "0".repeat(64) });
    expect(classifyV74RegistrationRecovery({ intent, observed: after, now })).toMatchObject({ state: "unknown", mayRestore48: false, mayRotateCredential: false });
  });
  it("blocks partial policy-only commit, a foreign credential, altered rotation state or foreign launcher", () => {
    const intent = buildV74RegistrationIntent(fixture());
    const mixed = { ...structuredClone(intent.before), policy: structuredClone(intent.policyAfter) };
    expect(classifyV74RegistrationRecovery({ intent, observed: mixed, now }).state).toBe("unknown");
    const other = registered(intent);other.credential.jtiSha256 = "9".repeat(64);
    expect(classifyV74RegistrationRecovery({ intent, observed: other, now }).state).toBe("unknown");
    const rotated = registered(intent);rotated.policy.previousFingerprintKeyVersion = "reset";
    expect(classifyV74RegistrationRecovery({ intent, observed: rotated, now }).state).toBe("unknown");
    const foreign = registered(intent);foreign.service.plistSha256 = "8".repeat(64);
    expect(classifyV74RegistrationRecovery({ intent, observed: foreign, now }).state).toBe("unknown");
  });
  it("rejects a retargeted intent even if the readback matches its changed generation", () => {
    const intent = buildV74RegistrationIntent(fixture());
    intent.worker.generation = 50;
    expect(classifyV74RegistrationRecovery({ intent, observed: registered(intent), now }).state).toBe("unknown");
  });
  it("rejects a changed policy patch in an intent instead of blessing its matching readback", () => {
    const intent = buildV74RegistrationIntent(fixture());
    intent.policyAfter.previousFingerprintKeyVersion = "reset";
    expect(classifyV74RegistrationRecovery({ intent, observed: registered(intent), now }).state).toBe("unknown");
  });
  it("does not restore an expired old48 or treat an expired49 as a repair authority", () => {
    const intent = buildV74RegistrationIntent(fixture()), later = new Date("2026-11-01T00:00:00Z");
    expect(classifyV74RegistrationRecovery({ intent, observed: intent.before, now: later }).state).toBe("unknown");
    expect(classifyV74RegistrationRecovery({ intent, observed: registered(intent), now: later }).state).toBe("unknown");
  });
});
