import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalReleaseRehearsalRunnerAdapters } from "../scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs";

const digest = "a".repeat(64);
const tools = { log: { path: "/usr/bin/log", identity: { id: 1 } }, lsof: { path: "/usr/sbin/lsof", identity: { id: 2 } }, ps: { path: "/bin/ps", identity: { id: 3 } } };
function options(overrides = {}) { const root = mkdtempSync(join(tmpdir(), "r2-adapter-")); return { candidateInput: root, namespaceRoot: root, runId: "11111111-2222-4333-8444-555555555555", platform: "darwin", dockerBin: "/private/test/docker", dockerEndpointResolver: () => ({ realpath: "/tmp/docker.sock", identity_digest: digest, url: "unix:///tmp/docker.sock" }), productionSnapshotReader: async () => ({ surface_digest: digest }), daemonSnapshotReader: async () => ({ snapshot_digest: digest }), trustedToolResolver: tools, runCommand: async () => ({ status: 0, signal: null, truncated: false, stdout: "[]" }), ...overrides }; }
describe("R2 adapter trusted dependency seam", () => {
  it("constructs a default trusted observer from injected authorities", () => {
    const adapters = createLocalReleaseRehearsalRunnerAdapters(options());
    expect(adapters.independentObserver).toMatchObject({ begin: expect.any(Function), registerChild: expect.any(Function), end: expect.any(Function) });
  });
  it("keeps trusted macOS observer construction on the production default path", () => {
    const source = readFileSync("scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs", "utf8");
    expect(source).toContain("createTrustedMacOsIndependentObserver");
    expect(source).toContain("independentObserver,");
    expect(source).not.toContain("independentObserver: null");
  });
  it("rejects null and non-macOS trusted observer construction", () => {
    expect(() => createLocalReleaseRehearsalRunnerAdapters(options({ dockerEndpointResolver: null }))).toThrow(/dependencies/iu);
    expect(() => createLocalReleaseRehearsalRunnerAdapters(options({ platform: "linux" }))).toThrow(/non-macOS/iu);
  });
});
