import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as runnerAdaptersModule from "../scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs";

const { createLocalReleaseRehearsalRunnerAdapters, normalizeObserverComponent } = runnerAdaptersModule;

const digest = "a".repeat(64);
const tools = { log: { path: "/usr/bin/log", identity: { id: 1 } }, lsof: { path: "/usr/sbin/lsof", identity: { id: 2 } }, ps: { path: "/bin/ps", identity: { id: 3 } } };
function options(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "r2-adapter-"));
  const runId = "11111111-2222-4333-8444-555555555555";
  mkdirSync(join(root, runId, "runtime-state"), { recursive: true, mode: 0o700 });
  return {
    candidateInput: root,
    namespaceRoot: root,
    runId,
    platform: "darwin",
    dockerBin: "/private/test/docker",
    dockerEndpointResolver: () => ({ schema: "homecook.release-rehearsal-local-docker-endpoint.v1", realpath: "/tmp/docker.sock", identity_digest: digest, url: "unix:///tmp/docker.sock" }),
    productionSnapshotReader: async () => ({ surface_digest: digest }),
    daemonSnapshotReader: async () => ({ snapshot_digest: digest }),
    trustedToolResolver: tools,
    runCommand: async () => ({ status: 0, signal: null, truncated: false, stdout: "[]" }),
    ...overrides,
  };
}

function enclosingFunctionName(node: ts.Node) {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText();
    current = current.parent;
  }
  return "<module>";
}

function collectAdapterBoundaryInventory() {
  const path = "scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs";
  const source = readFileSync(path, "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const allowFailure: Array<{ owner: string; outcome: string }> = [];
  const dockerJson: Array<{ owner: string; shape: string }> = [];
  const rawJsonParse: Array<{ owner: string }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === "allowFailure") {
      allowFailure.push({
        owner: enclosingFunctionName(node),
        outcome: ts.isStringLiteral(node.initializer) ? node.initializer.text : `<${node.initializer.getText(file)}>`,
      });
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "parseDockerOutputJson") {
      const shape = node.arguments[1];
      dockerJson.push({
        owner: enclosingFunctionName(node),
        shape: shape && ts.isStringLiteral(shape) ? shape.text : `<${shape?.getText(file) ?? "missing"}>`,
      });
    }
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "JSON"
      && node.expression.name.text === "parse"
    ) rawJsonParse.push({ owner: enclosingFunctionName(node) });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { allowFailure, dockerJson, rawJsonParse };
}

describe("R2 adapter trusted dependency seam", () => {
  it("normalizes every exact full-local service subject while preserving app and worker components", () => {
    for (const service of ["api-gateway", "auth", "auth-proxy", "postgres", "postgrest", "postgrest-probe", "storage"]) {
      expect(normalizeObserverComponent(service)).toBe("full_local");
    }
    expect(normalizeObserverComponent("app")).toBe("app");
    expect(normalizeObserverComponent("worker")).toBe("worker");
    expect(() => normalizeObserverComponent("substituted-service")).toThrow(/component/iu);
  });
  it("constructs a default trusted observer from injected authorities", () => {
    const adapters = createLocalReleaseRehearsalRunnerAdapters(options());
    expect(adapters.independentObserver).toMatchObject({ begin: expect.any(Function), registerChild: expect.any(Function), captureSubjects: expect.any(Function), end: expect.any(Function) });
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

  it.each([
    ["spawn error", { status: null, signal: null, truncated: false, error: { code: "ENOENT", message: "/private/provider-secret" } }],
    ["signal", { status: null, signal: "SIGKILL", truncated: false }],
    ["null status", { status: null, signal: null, truncated: false }],
    ["truncated output", { status: 1, signal: null, truncated: true }],
    ["output overflow", { status: null, signal: null, truncated: true, error: { code: "ENOBUFS", message: "private payload overflow" } }],
  ])("maps %s to docker_command_failed even for an expected-absence inspect", async (_label, result) => {
    const privateOutput = "/private/provider-secret\nSUPABASE_SERVICE_ROLE_KEY=private-value";
    const adapters = createLocalReleaseRehearsalRunnerAdapters(options({
      runCommand: async () => ({ ...result, stdout: privateOutput, stderr: privateOutput }),
    }));
    let failure: unknown = null;
    try {
      await adapters.inspectResource({ kind: "container", id: "b".repeat(64), name: "expected-absent" });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("docker_command_failed: isolated Docker command failed.");
    expect((failure as Error).message).not.toContain(privateOutput);
  });

  it("allows only the exact documented resource-absence status", async () => {
    const entry = { kind: "container", id: "b".repeat(64), name: "expected-absent" };
    const absent = createLocalReleaseRehearsalRunnerAdapters(options({
      runCommand: async () => ({ status: 1, signal: null, truncated: false, stdout: "", stderr: "No such container" }),
    }));
    await expect(absent.inspectResource(entry)).resolves.toBeNull();

    for (const result of [
      { status: 2, signal: null, truncated: false, stdout: "", stderr: "unexpected" },
      { status: 1, signal: null, truncated: false, stdout: "{}", stderr: "unexpected payload" },
    ]) {
      const adapters = createLocalReleaseRehearsalRunnerAdapters(options({ runCommand: async () => result }));
      await expect(adapters.inspectResource(entry)).rejects.toThrow(/^docker_command_failed: isolated Docker command failed\.$/u);
    }
  });

  it.each([
    ["record", "{}", "[]"],
    ["string-array", '["value"]', "[1]"],
    ["record-array", '[{"value":1}]', '["value"]'],
  ] as const)("strictly parses the %s Docker JSON consumer category", (shape, valid, unexpected) => {
    const parseDockerOutputJson = (runnerAdaptersModule as Record<string, unknown>).parseDockerOutputJson;
    expect(parseDockerOutputJson).toBeTypeOf("function");
    if (typeof parseDockerOutputJson !== "function") return;
    expect(parseDockerOutputJson(valid, shape)).toEqual(JSON.parse(valid));
    for (const source of ["", "{malformed", unexpected]) {
      expect(() => parseDockerOutputJson(source, shape)).toThrow(/^docker_output_invalid: isolated Docker command output was invalid\.$/u);
    }
  });

  it("generates a closed inventory for allowFailure and every Docker JSON parse site", () => {
    expect(collectAdapterBoundaryInventory()).toEqual({
      allowFailure: [
        { owner: "inspectResource", outcome: "resource_absent" },
        { owner: "readContainerIdentity", outcome: "startup_identity_pending" },
        { owner: "runCanaries", outcome: "worker_evidence_pending" },
        { owner: "runCanaries", outcome: "network_probe_outcome" },
      ],
      dockerJson: [
        { owner: "inspectResource", shape: "record" },
        { owner: "readContainerObserverSubject", shape: "record" },
        { owner: "verifyCreatedContainerImages", shape: "record" },
        { owner: "verifyCreatedContainerImages", shape: "string-array" },
        { owner: "runOwnedPostgrestFixtureProbe", shape: "record" },
        { owner: "parseAndValidateWorkerFixtureReadback", shape: "record" },
        { owner: "readContainerIdentity", shape: "record" },
        { owner: "snapshotDockerDaemon", shape: "record" },
        { owner: "snapshotDockerDaemon", shape: "record" },
        { owner: "createResources", shape: "record" },
        { owner: "createResources", shape: "record" },
        { owner: "runCanaries", shape: "record" },
        { owner: "runCanaries", shape: "record" },
        { owner: "readNetworkEvidence", shape: "record" },
        { owner: "readNetworkEvidence", shape: "record" },
        { owner: "readIsolationTelemetry", shape: "string-array" },
        { owner: "readIsolationTelemetry", shape: "record-array" },
      ],
      rawJsonParse: [
        { owner: "parseDockerOutputJson" },
        { owner: "ensureIssuedWorkerCredential" },
        { owner: "ensureIssuedWorkerCredential" },
        { owner: "materializeWorkerHealthBundle" },
        { owner: "prepareYoutubeWorkerSyntheticFixture" },
      ],
    });
  });
});
