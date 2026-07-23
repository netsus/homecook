import {
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const projectUrl = "https://project.supabase.co";
const ownerUuid = "550e8400-e29b-41d4-a716-446655440001";
const sessionId = "550e8400-e29b-41d4-a716-446655440099";
const nowSeconds = 1_784_764_900;

interface SigningFixture {
  alg: "ES256" | "RS256";
  kid: string;
  privateKey: KeyObject;
  publicJwk: JsonWebKey & {
    alg: "ES256" | "RS256";
    kid: string;
    use: "sig";
  };
}

function createSigningFixture(
  alg: "ES256" | "RS256" = "RS256",
): SigningFixture {
  const keyPair = alg === "RS256"
    ? generateKeyPairSync("rsa", { modulusLength: 2048 })
    : generateKeyPairSync("ec", { namedCurve: "P-256" });
  const kid = `replay-${alg.toLowerCase()}-key`;

  return {
    alg,
    kid,
    privateKey: keyPair.privateKey,
    publicJwk: {
      ...keyPair.publicKey.export({ format: "jwk" }),
      alg,
      kid,
      use: "sig",
    },
  };
}

const signingFixtures = {
  RS256: createSigningFixture("RS256"),
  ES256: createSigningFixture("ES256"),
} as const;

function encodeJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createSignedToken({
  claims = {},
  fixture,
  header = {},
}: {
  claims?: Record<string, unknown>;
  fixture: SigningFixture;
  header?: Record<string, unknown>;
}) {
  const signingInput = [
    encodeJson({
      alg: fixture.alg,
      kid: fixture.kid,
      typ: "JWT",
      ...header,
    }),
    encodeJson({
      aud: "authenticated",
      exp: nowSeconds + 300,
      iat: nowSeconds - 60,
      iss: `${projectUrl}/auth/v1`,
      session_id: sessionId,
      sub: ownerUuid,
      ...claims,
    }),
  ].join(".");
  const signature = sign(
    fixture.alg === "RS256" ? "RSA-SHA256" : "sha256",
    Buffer.from(signingInput, "utf8"),
    fixture.alg === "RS256"
      ? fixture.privateKey
      : {
          key: fixture.privateKey,
          dsaEncoding: "ieee-p1363",
        },
  ).toString("base64url");

  return `${signingInput}.${signature}`;
}

async function importVerifier() {
  return import("@/lib/server/account-generation/jwt-replay");
}

describe("account delete JWKS replay verifier", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `${projectUrl}/ignored/path?x=1`);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["RS256", "ES256"] as const)(
    "accepts an exact unexpired %s project token",
    async (alg) => {
      const fixture = signingFixtures[alg];
      const fetchJwks = vi.fn(async () => {
        return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), {
          status: 200,
        });
      });
      vi.stubGlobal("fetch", fetchJwks);
      const { verifyAccountDeleteReplayJwt } = await importVerifier();

      const result = await verifyAccountDeleteReplayJwt(
        createSignedToken({ fixture }),
        { nowSeconds },
      );

      expect(result).toEqual({
        ok: true,
        claims: {
          expiresAt: nowSeconds + 300,
          issuedAt: nowSeconds - 60,
          ownerUuid,
          sessionId,
        },
      });
      expect(fetchJwks).toHaveBeenCalledWith(
        `${projectUrl}/auth/v1/.well-known/jwks.json`,
        expect.objectContaining({ cache: "no-store" }),
      );
    },
  );

  it.each([
    ["iss", { iss: "https://attacker.example/auth/v1" }],
    ["aud", { aud: "anon" }],
    ["sub", { sub: "not-a-uuid" }],
    ["session_id", { session_id: "not-a-uuid" }],
    ["iat", { iat: nowSeconds + 61 }],
    ["exp", { exp: nowSeconds }],
  ])("rejects a non-exact %s claim", async (_claim, claims) => {
    const fixture = signingFixtures.RS256;
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), {
        status: 200,
      });
    }));
    const { verifyAccountDeleteReplayJwt } = await importVerifier();

    await expect(
      verifyAccountDeleteReplayJwt(
        createSignedToken({ claims, fixture }),
        { nowSeconds },
      ),
    ).resolves.toEqual({ ok: false });
  });

  it("rejects unsupported algorithms before accepting a matching key", async () => {
    const fixture = signingFixtures.RS256;
    const fetchJwks = vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchJwks);
    const { verifyAccountDeleteReplayJwt } = await importVerifier();

    await expect(
      verifyAccountDeleteReplayJwt(
        createSignedToken({
          fixture,
          header: { alg: "HS256" },
        }),
        { nowSeconds },
      ),
    ).resolves.toEqual({ ok: false });
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown kid", async () => ({ keys: [] })],
    ["malformed cache payload", async () => ({ keys: "invalid" })],
  ])("fails closed for %s", async (_label, bodyFactory) => {
    const fixture = signingFixtures.RS256;
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(JSON.stringify(await bodyFactory()), { status: 200 });
    }));
    const { verifyAccountDeleteReplayJwt } = await importVerifier();

    await expect(
      verifyAccountDeleteReplayJwt(
        createSignedToken({ fixture }),
        { nowSeconds },
      ),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when the project JWKS fetch fails", async () => {
    const fixture = signingFixtures.RS256;
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network unavailable");
    }));
    const { verifyAccountDeleteReplayJwt } = await importVerifier();

    await expect(
      verifyAccountDeleteReplayJwt(
        createSignedToken({ fixture }),
        { nowSeconds },
      ),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when a cached JWK cannot be imported", async () => {
    const fixture = signingFixtures.RS256;
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(JSON.stringify({
        keys: [{
          alg: "RS256",
          kid: fixture.kid,
          kty: "RSA",
          n: "invalid",
          e: "AQAB",
          use: "sig",
        }],
      }), { status: 200 });
    }));
    const { verifyAccountDeleteReplayJwt } = await importVerifier();

    await expect(
      verifyAccountDeleteReplayJwt(
        createSignedToken({ fixture }),
        { nowSeconds },
      ),
    ).resolves.toEqual({ ok: false });
  });
});
