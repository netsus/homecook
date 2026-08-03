import {
  generateKeyPairSync,
  sign,
} from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  validateRemoteJwtClaims,
  validateRemoteJwks,
  verifyRemoteJwtSignature,
} from "@/lib/server/hybrid-auth/jwt-guard";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const SESSION_UUID = "22222222-2222-4222-8222-222222222222";
const ISSUER = "https://remote.example.supabase.co/auth/v1";
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const publicJwk = {
  ...publicKey.export({ format: "jwk" }),
  alg: "ES256",
  kid: "remote-es256",
  use: "sig",
};

function signedAccessToken() {
  const header = Buffer.from(JSON.stringify({
    alg: "ES256",
    kid: publicJwk.kid,
    typ: "JWT",
  })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: ISSUER,
    aud: "authenticated",
    role: "authenticated",
    sub: OWNER_UUID,
    session_id: SESSION_UUID,
    iat: 1_800_000_000,
    nbf: 1_800_000_000,
    exp: 1_800_000_600,
  })).toString("base64url");
  const signature = sign(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    { key: privateKey, dsaEncoding: "ieee-p1363" },
  ).toString("base64url");

  return `${header}.${payload}.${signature}`;
}

describe("remote Auth exact JWT guard", () => {
  it("accepts only the exact remote authenticated session claim set", () => {
    expect(validateRemoteJwtClaims({
      claims: {
        iss: ISSUER,
        aud: "authenticated",
        role: "authenticated",
        sub: OWNER_UUID,
        session_id: SESSION_UUID,
        iat: 1_800_000_000,
        nbf: 1_800_000_000,
        exp: 1_800_000_600,
      },
      expectedIssuer: ISSUER,
      nowSeconds: 1_800_000_100,
    })).toMatchObject({
      ok: true,
      claims: {
        ownerUuid: OWNER_UUID,
        sessionId: SESSION_UUID,
      },
    });
  });

  it("treats the standards-optional nbf claim as iat when GoTrue omits it", () => {
    expect(validateRemoteJwtClaims({
      claims: {
        iss: ISSUER,
        aud: "authenticated",
        role: "authenticated",
        sub: OWNER_UUID,
        session_id: SESSION_UUID,
        iat: 1_800_000_000,
        exp: 1_800_000_600,
      },
      expectedIssuer: ISSUER,
      nowSeconds: 1_800_000_100,
    })).toEqual({
      ok: true,
      claims: {
        issuer: ISSUER,
        ownerUuid: OWNER_UUID,
        sessionId: SESSION_UUID,
        issuedAt: 1_800_000_000,
        notBefore: 1_800_000_000,
        expiresAt: 1_800_000_600,
      },
    });
  });

  it.each([
    ["issuer", { iss: "https://wrong.example/auth/v1" }],
    ["audience", { aud: ["authenticated"] }],
    ["role", { role: "service_role" }],
    ["owner", { sub: "not-a-uuid" }],
    ["session", { session_id: "not-a-uuid" }],
    ["issued-at", { iat: 1_800_000_200 }],
    ["not-before", { nbf: 1_800_000_200 }],
    ["expiry", { exp: 1_800_000_099 }],
  ])("rejects a wrong %s claim", (_label, patch) => {
    const result = validateRemoteJwtClaims({
      claims: {
        iss: ISSUER,
        aud: "authenticated",
        role: "authenticated",
        sub: OWNER_UUID,
        session_id: SESSION_UUID,
        iat: 1_800_000_000,
        nbf: 1_800_000_000,
        exp: 1_800_000_600,
        ...patch,
      },
      expectedIssuer: ISSUER,
      nowSeconds: 1_800_000_100,
    });

    expect(result.ok).toBe(false);
  });

  it("accepts public verify-only ES256/RS256 keys with unique non-empty kid", () => {
    const result = validateRemoteJwks({
      keys: [
        {
          alg: "ES256",
          crv: "P-256",
          kid: "remote-es256",
          kty: "EC",
          use: "sig",
          x: "x",
          y: "y",
        },
        {
          alg: "RS256",
          e: "AQAB",
          kid: "remote-rs256",
          kty: "RSA",
          n: "n",
          use: "sig",
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("verifies the exact asymmetric key selected by alg and kid", () => {
    const token = signedAccessToken();
    const [header, payload] = token.split(".");
    const invalidSignatureToken = [
      header,
      payload,
      Buffer.alloc(64).toString("base64url"),
    ].join(".");

    expect(verifyRemoteJwtSignature({
      accessToken: token,
      jwks: { keys: [publicJwk] },
    })).toMatchObject({ ok: true });
    expect(verifyRemoteJwtSignature({
      accessToken: invalidSignatureToken,
      jwks: { keys: [publicJwk] },
    })).toEqual({ ok: false, reason: "signature" });
    expect(verifyRemoteJwtSignature({
      accessToken: token,
      jwks: {
        keys: [{ ...publicJwk, kid: "other-key" }],
      },
    })).toEqual({ ok: false, reason: "key" });
  });

  it.each([
    [{ keys: [] }],
    [{ keys: [{ alg: "HS256", kid: "shared", kty: "oct", k: "secret" }] }],
    [{
      keys: [
        { alg: "ES256", kid: "same", kty: "EC", crv: "P-256", x: "x", y: "y" },
        { alg: "RS256", kid: "same", kty: "RSA", e: "AQAB", n: "n" },
      ],
    }],
    [{ keys: [{ alg: "ES256", kid: "", kty: "EC", crv: "P-256", x: "x", y: "y" }] }],
  ])("rejects unsafe JWKS %#", (jwks) => {
    expect(validateRemoteJwks(jwks).ok).toBe(false);
  });
});
