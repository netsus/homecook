import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { syncRemoteAuthJwks } from "../scripts/sync-remote-auth-jwks.mjs";

const directories: string[] = [];
const ISSUER = "https://remote.example.supabase.co/auth/v1";
const ENDPOINT = `${ISSUER}/.well-known/jwks.json`;
const REMOTE_KEY = {
  alg: "ES256",
  crv: "P-256",
  kid: "remote-es256",
  kty: "EC",
  use: "sig",
  x: "remote-x",
  y: "remote-y",
};
const LOCAL_KEY = {
  alg: "RS256",
  e: "AQAB",
  kid: "local-rs256",
  kty: "RSA",
  n: "local-n",
  use: "sig",
};

function temporaryFile() {
  const directory = mkdtempSync(join(tmpdir(), "homecook-jwks-"));
  directories.push(directory);
  return join(directory, "combined-jwks.json");
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("remote Auth JWKS atomic sync", () => {
  it("validates and atomically writes a combined public verify-only bundle", async () => {
    const outputPath = temporaryFile();
    const result = await syncRemoteAuthJwks({
      endpoint: ENDPOINT,
      expectedIssuer: ISSUER,
      localJwks: { keys: [LOCAL_KEY] },
      outputPath,
      fetchImpl: vi.fn().mockResolvedValue(new Response(
        JSON.stringify({ keys: [REMOTE_KEY] }),
        { status: 200 },
      )),
    });

    expect(result).toMatchObject({
      changed: true,
      keyCount: 2,
      remoteKeyCount: 1,
    });
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual({
      keys: [LOCAL_KEY, REMOTE_KEY],
    });
  });

  it("rejects a non-exact endpoint and preserves the active bundle", async () => {
    const outputPath = temporaryFile();
    writeFileSync(outputPath, "{\"keys\":[{\"kid\":\"active\"}]}\n");

    await expect(syncRemoteAuthJwks({
      endpoint: `${ENDPOINT}?redirect=1`,
      expectedIssuer: ISSUER,
      localJwks: { keys: [LOCAL_KEY] },
      outputPath,
      fetchImpl: vi.fn(),
    })).rejects.toThrow(/exact HTTPS/i);
    expect(readFileSync(outputPath, "utf8")).toBe(
      "{\"keys\":[{\"kid\":\"active\"}]}\n",
    );
  });

  it.each([
    [{ keys: [{ ...REMOTE_KEY, alg: "HS256", kty: "oct", k: "secret" }] }],
    [{ keys: [{ ...REMOTE_KEY, d: "private-material" }] }],
    [{ keys: [REMOTE_KEY, { ...REMOTE_KEY }] }],
  ])("rejects unsafe or ambiguous remote keys %#", async (jwks) => {
    await expect(syncRemoteAuthJwks({
      endpoint: ENDPOINT,
      expectedIssuer: ISSUER,
      localJwks: { keys: [LOCAL_KEY] },
      outputPath: temporaryFile(),
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(jwks), { status: 200 }),
      ),
    })).rejects.toThrow();
  });

  it("rejects a body over 1 MiB before replacing the active bundle", async () => {
    const outputPath = temporaryFile();
    writeFileSync(outputPath, "{\"keys\":[]}\n");

    await expect(syncRemoteAuthJwks({
      endpoint: ENDPOINT,
      expectedIssuer: ISSUER,
      localJwks: { keys: [LOCAL_KEY] },
      outputPath,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response("x".repeat(1_048_577), { status: 200 }),
      ),
    })).rejects.toThrow(/1 MiB/i);
    expect(readFileSync(outputPath, "utf8")).toBe("{\"keys\":[]}\n");
  });
});
