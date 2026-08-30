import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSealedRehearsalRpcConfig } from "../scripts/lib/youtube-extraction-worker-artifact.mjs";

function fixture(mutator?: (root: string, config: string) => void) { const root = mkdtempSync(join(tmpdir(), "worker-rpc-reader-")); chmodSync(root, 0o700); const token = join(root, "token"); const config = join(root, "config.json"); writeFileSync(token, "synthetic-token", { flag: "wx", mode: 0o400 }); const value = { schema: "homecook.rehearsal-worker-rpc-config.v1", base_url: "http://postgrest:3000", token_file: "token", fixture_identity: "fixture", creation_nonce: "nonce", policy_snapshot_digest: "a".repeat(64), schema_identity: "schema", allowed_snapshot_digest: "b".repeat(64), lifecycle_version: "v1" }; writeFileSync(config, JSON.stringify(value), { flag: "wx", mode: 0o400 }); mutator?.(root, config); return { root, config }; }
describe("sealed rehearsal RPC reader", () => {
  it("reads valid private config without placing token in config", () => { const f = fixture(); try { const result = readSealedRehearsalRpcConfig(f.config); expect(result.config.token_file).toBe("token"); expect(result.token).toBe("synthetic-token"); expect(JSON.stringify(result.config)).not.toContain("synthetic-token"); } finally { rmSync(f.root, { recursive: true, force: true }); } });
  it("rejects authority mismatch and path escape", () => { const f = fixture(); const escaped = fixture(); try { expect(() => readSealedRehearsalRpcConfig(f.config, { expectedAuthority: { config_digest: "0".repeat(64) } })).toThrow(/authority/iu); chmodSync(escaped.config, 0o600); writeFileSync(escaped.config, JSON.stringify({ schema: "homecook.rehearsal-worker-rpc-config.v1", token_file: "../x" }), { flag: "w" }); chmodSync(escaped.config, 0o400); expect(() => readSealedRehearsalRpcConfig(escaped.config)).toThrow(/closed/iu); } finally { rmSync(f.root, { recursive: true, force: true }); rmSync(escaped.root, { recursive: true, force: true }); } });
});
