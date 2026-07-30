import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertRemotePopulationCas,
  buildRemoteIdentityMirrorTransaction,
  buildRemoteIdentityMirrorVerificationSql,
  createRemoteIdentityDigest,
  createRemotePopulationSnapshot,
} from "../scripts/lib/hybrid-remote-auth-mirror.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const ISSUER = "https://remote.example.supabase.co/auth/v1";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";

function expectedIdentityDigest(ownerUuid: string, identityCreatedAt: string) {
  return createHash("sha256")
    .update([
      "v1",
      ISSUER,
      ownerUuid,
      new Date(identityCreatedAt).toISOString(),
    ].join("\n"), "utf8")
    .digest("hex");
}

describe("hybrid remote Auth identity mirror", () => {
  it("uses the existing record_hybrid_remote_session_authority identity digest rule", () => {
    expect(createRemoteIdentityDigest({
      identityCreatedAt: "2026-07-30T01:02:03.456789Z",
      issuer: ISSUER,
      ownerUuid: OWNER_A,
    })).toBe(expectedIdentityDigest(
      OWNER_A,
      "2026-07-30T01:02:03.456789Z",
    ));
  });

  it("projects remote users to id+created_at only and produces an ordered stable digest", () => {
    const snapshot = createRemotePopulationSnapshot({
      issuer: ISSUER,
      users: [
        {
          id: OWNER_B,
          created_at: "2026-07-30T02:00:00.000Z",
          email: "must-not-survive@example.com",
          identities: [{ provider: "google" }],
          raw_user_meta_data: { name: "must-not-survive" },
        },
        {
          id: OWNER_A,
          created_at: "2026-07-30T01:00:00.000Z",
          phone: "must-not-survive",
        },
      ],
    });

    expect(snapshot.count).toBe(2);
    expect(snapshot.rows).toEqual([
      {
        identityCreatedAt: "2026-07-30T01:00:00.000Z",
        ownerUuid: OWNER_A,
        remoteIdentityDigest: expectedIdentityDigest(
          OWNER_A,
          "2026-07-30T01:00:00.000Z",
        ),
      },
      {
        identityCreatedAt: "2026-07-30T02:00:00.000Z",
        ownerUuid: OWNER_B,
        remoteIdentityDigest: expectedIdentityDigest(
          OWNER_B,
          "2026-07-30T02:00:00.000Z",
        ),
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("must-not-survive");
    expect(snapshot.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects duplicate owners and any two-read population CAS mismatch", () => {
    expect(() => createRemotePopulationSnapshot({
      issuer: ISSUER,
      users: [
        { id: OWNER_A, created_at: "2026-07-30T01:00:00.000Z" },
        { id: OWNER_A, created_at: "2026-07-30T02:00:00.000Z" },
      ],
    })).toThrow(/duplicate remote owner/u);

    const first = createRemotePopulationSnapshot({
      issuer: ISSUER,
      users: [
        { id: OWNER_A, created_at: "2026-07-30T01:00:00.000Z" },
      ],
    });
    const replaced = createRemotePopulationSnapshot({
      issuer: ISSUER,
      users: [
        { id: OWNER_A, created_at: "2026-07-30T02:00:00.000Z" },
      ],
    });

    expect(() => assertRemotePopulationCas(first, replaced))
      .toThrow(/remote population changed/u);
  });

  it("builds one fail-closed transaction that rejects deletion/recreate and verifies exact mirror equality", () => {
    const snapshot = createRemotePopulationSnapshot({
      issuer: ISSUER,
      users: [
        { id: OWNER_A, created_at: "2026-07-30T01:00:00.000Z" },
      ],
    });
    const sql = buildRemoteIdentityMirrorTransaction({
      dryRun: true,
      issuer: ISSUER,
      revision: 1_800_000_000,
      snapshot,
      verifiedAt: "2027-01-15T08:00:00.000Z",
    });

    expect(sql).toContain("begin;");
    expect(sql).toContain("lock table auth.users in share row exclusive mode;");
    expect(sql).toContain(
      "lock table private.remote_auth_identity_epochs in share row exclusive mode;",
    );
    expect(sql).toContain("remote identity deletion or recreation detected");
    expect(sql).toContain("remote mirror exact population mismatch");
    expect(sql).toContain("public owner identity epoch anti-join mismatch");
    expect(sql).toContain("rollback;");
    expect(sql).not.toMatch(/email|provider|metadata|payload/iu);
  });

  it("independently verifies every persisted identity digest", () => {
    const snapshot = createRemotePopulationSnapshot({
      issuer: ISSUER,
      users: [
        { id: OWNER_A, created_at: "2026-07-30T01:00:00.000Z" },
      ],
    });
    const sql = buildRemoteIdentityMirrorVerificationSql({
      issuer: ISSUER,
      snapshot,
    });

    expect(sql).toContain("remoteIdentityDigestMismatchCount");
    expect(sql).toMatch(
      /mirror\.remote_identity_digest\s+is distinct from remote\.remote_identity_digest/u,
    );
  });

  it("ships server-only dry-run/apply/verify commands without weakening restore", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(ROOT, "package.json"), "utf8"),
    );
    const cli = readFileSync(
      resolve(ROOT, "scripts/hybrid-remote-auth-mirror.mjs"),
      "utf8",
    );

    expect(packageJson.scripts["hybrid-production:mirror-auth"])
      .toBe("node scripts/hybrid-remote-auth-mirror.mjs");
    expect(cli).toContain('createClient(');
    expect(cli).toContain('"dry-run"');
    expect(cli).toContain('"apply"');
    expect(cli).toContain('"verify"');
    expect(cli).not.toContain("console.log");
  });
});
