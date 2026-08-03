import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prepareFullLocalSessionAuthority,
  recordFullLocalSessionAuthority,
} from "@/lib/server/full-local-auth/session-authority";
import {
  readVerifiedAccountGenerationSession,
} from "@/lib/server/account-generation/session-authority";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const SESSION_UUID = "22222222-2222-4222-8222-222222222222";
const ISSUER = "https://auth.mumeok.com/auth/v1";
const SECRET_V2 = "session-generation-secret-v2-at-least-32-bytes";

function jwt(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "ES256", kid: "local-key", typ: "JWT" })}.${encode(claims)}.signature`;
}

describe("full-local session authority", () => {
  afterEach(() => {
    delete process.env.AUTH_SUPABASE_EXPECTED_ISSUER;
    delete process.env.HOMECOOK_AUTH_AUTHORITY;
    delete process.env.HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1;
    delete process.env.HOMECOOK_SESSION_GENERATION_HMAC_KEY_V2;
    delete process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL;
  });

  it("uses the current DB key version and public issuer when deriving a binding", async () => {
    process.env.HOMECOOK_SESSION_GENERATION_HMAC_KEY_V2 = SECRET_V2;
    const now = 1_785_580_000;
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          authority: "local",
          cutover_epoch: 7,
          flows_open: true,
          hmac_key_version: 2,
          local_issuer: ISSUER,
        },
        error: null,
      }),
    };
    const accessToken = jwt({
      aud: "authenticated",
      exp: now + 3_600,
      iat: now - 10,
      iss: ISSUER,
      nbf: now - 10,
      role: "authenticated",
      session_id: SESSION_UUID,
      sub: OWNER_UUID,
    });

    const prepared = await prepareFullLocalSessionAuthority({
      accessToken,
      client,
      nowSeconds: () => now,
      user: { id: OWNER_UUID, created_at: "2026-08-01T00:00:00.000Z" },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.accountBootstrap.hmacKeyVersion).toBe(2);
    expect(prepared.record.p_auth_cutover_epoch).toBe(7);
    expect(prepared.record.p_issuer).toBe(ISSUER);
    expect(prepared.record.p_session_key_hash).toBe(createHmac("sha256", SECRET_V2)
      .update(["v2", ISSUER, OWNER_UUID, "2026-08-01T00:00:00.000Z", SESSION_UUID].join("\n"))
      .digest("hex"));
  });

  it("preserves the exact Auth identity epoch while hashing its canonical instant", async () => {
    process.env.HOMECOOK_SESSION_GENERATION_HMAC_KEY_V2 = SECRET_V2;
    const now = 1_785_580_000;
    const exactIdentityEpoch = "2026-08-01T00:00:00.123456Z";
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          authority: "local",
          cutover_epoch: 7,
          flows_open: true,
          hmac_key_version: 2,
          local_issuer: ISSUER,
        },
        error: null,
      }),
    };

    const prepared = await prepareFullLocalSessionAuthority({
      accessToken: jwt({
        aud: "authenticated",
        exp: now + 3_600,
        iat: now - 10,
        iss: ISSUER,
        role: "authenticated",
        session_id: SESSION_UUID,
        sub: OWNER_UUID,
      }),
      client,
      nowSeconds: () => now,
      user: { id: OWNER_UUID, created_at: exactIdentityEpoch },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.accountBootstrap.authIdentityCreatedAt)
      .toBe(exactIdentityEpoch);
    expect(prepared.record.p_identity_created_at).toBe(exactIdentityEpoch);
    expect(prepared.record.p_session_key_hash).toBe(createHmac("sha256", SECRET_V2)
      .update(["v2", ISSUER, OWNER_UUID, "2026-08-01T00:00:00.123Z", SESSION_UUID].join("\n"))
      .digest("hex"));
  });

  it("reuses an already live-verified Auth user without a second network lookup", async () => {
    const now = Math.floor(Date.now() / 1_000);
    process.env.AUTH_SUPABASE_EXPECTED_ISSUER = ISSUER;
    process.env.HOMECOOK_AUTH_AUTHORITY = "local";
    process.env.HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1 = SECRET_V2;
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY = "local-publishable";
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL = "https://auth.mumeok.com";
    const getUser = vi.fn().mockRejectedValue(new Error("duplicate lookup"));
    const routeClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: jwt({
                aud: "authenticated",
                exp: now + 3_600,
                iat: now,
                iss: ISSUER,
                role: "authenticated",
                session_id: SESSION_UUID,
                sub: OWNER_UUID,
              }),
            },
          },
          error: null,
        }),
        getUser,
      },
    };
    const verifiedUser = {
      id: OWNER_UUID,
      created_at: "2026-08-01T00:00:00.123456Z",
    };

    await expect(readVerifiedAccountGenerationSession(
      routeClient,
      verifiedUser,
    )).resolves.toMatchObject({
      ok: true,
      sessionAuthority: {
        ownerUuid: OWNER_UUID,
        authIdentityCreatedAt: verifiedUser.created_at,
      },
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("fails closed when DB authority is not local", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          authority: "remote",
          cutover_epoch: 1,
          flows_open: true,
          hmac_key_version: 1,
          local_issuer: null,
        },
        error: null,
      }),
    };

    await expect(prepareFullLocalSessionAuthority({
      accessToken: "not-used",
      client,
      user: { id: OWNER_UUID, created_at: "2026-08-01T00:00:00.000Z" },
    })).resolves.toEqual({ ok: false, reason: "stale" });
  });

  it("records only the exact prepared local binding", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { binding_state: "active" }, error: null });
    const result = await recordFullLocalSessionAuthority({
      client: { rpc },
      record: {
        p_access_token_expires_at: "2026-08-01T01:00:00.000Z",
        p_auth_cutover_epoch: 7,
        p_binding_expires_at: "2026-08-01T01:00:00.000Z",
        p_hmac_key_version: 2,
        p_identity_created_at: "2026-08-01T00:00:00.000Z",
        p_issuer: ISSUER,
        p_owner_uuid: OWNER_UUID,
        p_session_issued_at: "2026-08-01T00:10:00.000Z",
        p_session_key_hash: "a".repeat(64),
        p_verified_at: "2026-08-01T00:10:10.000Z",
      },
    });

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("record_full_local_session_authority", expect.objectContaining({
      p_hmac_key_version: 2,
      p_owner_uuid: OWNER_UUID,
    }));
  });
});
