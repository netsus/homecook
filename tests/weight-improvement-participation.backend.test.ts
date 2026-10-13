import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/v1/users/me/weight-improvement-participation/route";
import { createRouteHandlerClient, createWeightImprovementParticipationInternalClient } from "@/lib/supabase/server";
import { readVerifiedAccountGenerationSession } from "@/lib/server/account-generation/session-authority";
import { parseWeightImprovementMutation, projectParticipationResult } from "@/lib/server/weight-improvement-participation";
import { PARTICIPATION_DOCUMENT, PARTICIPATION_OTHER_OWNER, PARTICIPATION_OWNER, participationStatus } from "./fixtures/weight-improvement-participation";
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: vi.fn(), createWeightImprovementParticipationInternalClient: vi.fn() }));
vi.mock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: vi.fn() }));
const rpc = { read: vi.fn(), mutate: vi.fn() };
const valid = { action: "opt_in", expected_subject: { owner_uuid: PARTICIPATION_OWNER, account_generation: 3 }, expected_revision: 0, surface: "settings_desktop", consent_checked: true,
  document_version: PARTICIPATION_DOCUMENT.version, document_hash: PARTICIPATION_DOCUMENT.hash };
function request(body: unknown, key = "550e8400-e29b-41d4-a716-446655440091") {
  return new Request("http://127.0.0.1/api/v1/users/me/weight-improvement-participation", {
    method: "PATCH", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createRouteHandlerClient).mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: PARTICIPATION_OWNER } } })) } } as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>);
  vi.mocked(readVerifiedAccountGenerationSession).mockResolvedValue({ ok: true, sessionAuthority: {
    ownerUuid: PARTICIPATION_OWNER, authIdentityCreatedAt: "2026-10-13T00:00:00.000Z", sessionIssuedAt: "2026-10-13T01:00:00.000Z", sessionKeyHash: "b".repeat(64), hmacKeyVersion: 1,
  } });
  vi.mocked(createWeightImprovementParticipationInternalClient).mockReturnValue(rpc as unknown as NonNullable<ReturnType<typeof createWeightImprovementParticipationInternalClient>>);
  rpc.read.mockResolvedValue({ data: participationStatus(), error: null });
  rpc.mutate.mockResolvedValue({ data: participationStatus({ decision: "opted_in", revision: 1, opted_in_at: "2026-10-13T02:00:00Z",
    consent_document_version: PARTICIPATION_DOCUMENT.version, consent_document_hash: PARTICIPATION_DOCUMENT.hash }), error: null });
});
describe("weight participation account/API contract", () => {
  it("reads server state and forwards only the verified owner/session authority", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(participationStatus());
    expect(rpc.read).toHaveBeenCalledWith({ p_owner_uuid: PARTICIPATION_OWNER, p_auth_identity_created_at_snapshot: "2026-10-13T00:00:00.000Z",
      p_session_issued_at: "2026-10-13T01:00:00.000Z", p_session_key_hash: "b".repeat(64), p_hmac_key_version: 1 });
  });
  it("keeps policy/document null and collection OFF rather than inventing retention", async () => {
    rpc.read.mockResolvedValue({ data: participationStatus({ participation_enabled: false, document: null }), error: null });
    const data = (await (await GET()).json()).data;
    expect(data.document).toBeNull(); expect(data.participation_enabled).toBe(false); expect(data.collection_enabled).toBe(false);
    expect(JSON.stringify(data)).not.toMatch(/90일|1년/);
  });
  it("requires login without invoking the participation client", async () => {
    vi.mocked(createRouteHandlerClient).mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } } as unknown as Awaited<ReturnType<typeof createRouteHandlerClient>>);
    expect((await GET()).status).toBe(401);
    expect((await PATCH(request(valid))).status).toBe(401);
    expect(createWeightImprovementParticipationInternalClient).not.toHaveBeenCalled();
  });
  it("rejects a verified identity belonging to another account", async () => {
    vi.mocked(readVerifiedAccountGenerationSession).mockResolvedValue({ ok: true, sessionAuthority: {
      ownerUuid: PARTICIPATION_OTHER_OWNER, authIdentityCreatedAt: "2026-10-13T00:00:00.000Z", sessionIssuedAt: "2026-10-13T01:00:00.000Z", sessionKeyHash: "b".repeat(64), hmacKeyVersion: 1,
    } });
    expect((await PATCH(request(valid))).status).toBe(409);
    expect(rpc.mutate).not.toHaveBeenCalled();
  });
  it.each(["owner_uuid", "account_generation", "purpose", "collection_enabled", "effective_at", "document_body", "ip", "user_agent", "cleanup_status"])("rejects client authority field %s", async (field) => {
    expect((await PATCH(request({ ...valid, [field]: "client choice" }))).status).toBe(422);
    expect(rpc.mutate).not.toHaveBeenCalled();
  });
  it.each([{ ...valid, consent_checked: false }, { ...valid, expected_revision: -1 }, { ...valid, document_hash: "bad" }, { ...valid, action: "withdraw" }, { ...valid, surface: "login" }])("requires the exact action/document contract", async (body) => {
    expect((await PATCH(request(body))).status).toBe(422);
  });
  it("forwards an explicit version/hash, UUID request key and revision", async () => {
    expect((await PATCH(request(valid))).status).toBe(200);
    expect(rpc.mutate).toHaveBeenCalledWith(expect.objectContaining({ p_action: "opt_in", p_expected_revision: 0, p_surface: "settings_desktop",
      p_idempotency_key: "550e8400-e29b-41d4-a716-446655440091", p_document_version: PARTICIPATION_DOCUMENT.version,
      p_document_hash: PARTICIPATION_DOCUMENT.hash, p_consent_checked: true, p_owner_uuid: PARTICIPATION_OWNER }));
  });
  it("allows withdrawal independently of a current document and passes no fake consent", async () => {
    expect((await PATCH(request({ action: "withdraw", expected_subject: valid.expected_subject, expected_revision: 3, surface: "settings_mobile" }))).status).toBe(200);
    expect(rpc.mutate).toHaveBeenCalledWith(expect.objectContaining({ p_action: "withdraw", p_document_version: null, p_document_hash: null, p_consent_checked: false }));
  });
  it("does not turn a stale ON conflict or unknown error into success/raw details", async () => {
    rpc.mutate.mockResolvedValueOnce({ data: null, error: { message: "PARTICIPATION_REVISION_CONFLICT private-user-details" } });
    const response = await PATCH(request(valid));
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).not.toContain("private-user-details");
    rpc.mutate.mockRejectedValueOnce(new Error("private-user-details"));
    const unknown = await PATCH(request(valid));
    expect(unknown.status).toBe(500);
    expect((await unknown.json()).error.message).not.toContain("private-user-details");
  });
  it("rejects another-owner projections and strips unrelated RPC secrets", async () => {
    rpc.read.mockResolvedValueOnce({ data: participationStatus({ subject: { owner_uuid: PARTICIPATION_OTHER_OWNER, account_generation: 3 } }), error: null });
    expect((await GET()).status).toBe(500);
    const projected = projectParticipationResult({ ...participationStatus(), session_key_hash: "secret", document: { ...PARTICIPATION_DOCUMENT, private_notes: "secret" } }, PARTICIPATION_OWNER);
    expect(projected).not.toHaveProperty("session_key_hash");
    expect(projected?.document).not.toHaveProperty("private_notes");
  });
  it("rejects a preserved A-screen choice after the verified session becomes B, before invoking any writer", async () => {
    const viewed = (await (await GET()).json()).data;
    const authClient = await createRouteHandlerClient();
    const auth = await authClient.auth.getUser();
    if (!auth.data.user) throw new Error("fixture user missing");
    vi.spyOn(authClient.auth, "getUser").mockResolvedValue({ error: null, data: { user: { ...auth.data.user, id: PARTICIPATION_OTHER_OWNER } } });
    const verified = await readVerifiedAccountGenerationSession(authClient);
    if (!verified.ok) throw new Error("fixture verified session missing");
    vi.mocked(readVerifiedAccountGenerationSession).mockResolvedValue({ ...verified, sessionAuthority: { ...verified.sessionAuthority, ownerUuid: PARTICIPATION_OTHER_OWNER } });
    const response = await PATCH(request({ ...valid, expected_subject: viewed.subject }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("PARTICIPATION_SUBJECT_CHANGED");
    expect(rpc.mutate).not.toHaveBeenCalled();
  });
  it("passes the displayed generation as a precondition and preserves its SQL conflict", async () => {
    const viewed = (await (await GET()).json()).data;
    rpc.mutate.mockResolvedValueOnce({ data: null, error: { message: "PARTICIPATION_SUBJECT_CHANGED" } });
    const response = await PATCH(request({ ...valid, expected_subject: viewed.subject }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("PARTICIPATION_SUBJECT_CHANGED");
    expect(rpc.mutate).toHaveBeenCalledWith(expect.objectContaining({ p_owner_uuid: PARTICIPATION_OWNER, p_expected_account_generation: viewed.subject.account_generation }));
  });
  it.each([undefined, null, { owner_uuid: PARTICIPATION_OWNER }, { owner_uuid: "invalid", account_generation: 3 },
    { owner_uuid: PARTICIPATION_OWNER, account_generation: 0 }, { owner_uuid: PARTICIPATION_OWNER, account_generation: 3, authority: true }])("requires the exact displayed-subject precondition", async expected_subject => {
    expect((await PATCH(request({ ...valid, expected_subject }))).status).toBe(422);
    expect(rpc.mutate).not.toHaveBeenCalled();
  });
  it("does not accept an incomplete ON policy or unknown action", () => {
    expect(projectParticipationResult(participationStatus({ document: null }), PARTICIPATION_OWNER)).toBeNull();
    expect(projectParticipationResult(participationStatus({ decision: "opted_in", consent_document_version: PARTICIPATION_DOCUMENT.version,
      consent_document_hash: PARTICIPATION_DOCUMENT.hash }), PARTICIPATION_OWNER)).toBeNull();
    expect(projectParticipationResult(participationStatus({ decision: "withdrawn" }), PARTICIPATION_OWNER)).toBeNull();
    expect(parseWeightImprovementMutation({ action: "mark_cleanup_completed", expected_revision: 1, surface: "settings_mobile" })).toBeNull();
  });
});
