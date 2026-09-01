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
  const readExpectedNonzeroInventory = (runnerAdaptersModule as Record<string, unknown>).getExpectedDockerNonzeroContractInventory;
  return {
    allowFailure,
    expectedNonzero: typeof readExpectedNonzeroInventory === "function"
      ? readExpectedNonzeroInventory()
      : "<missing>",
    dockerJson,
    rawJsonParse,
  };
}

const resourceAbsenceCases = [
  {
    kind: "container",
    id: "b".repeat(64),
    stderrForms: [
      `Error: No such object: ${"b".repeat(64)}`,
      `Error: No such container: ${"b".repeat(64)}`,
      `Error response from daemon: No such container: ${"b".repeat(64)}`,
    ],
  },
  {
    kind: "network",
    id: "c".repeat(64),
    stderrForms: [
      `Error: No such network: ${"c".repeat(64)}`,
      `Error response from daemon: network ${"c".repeat(64)} not found`,
    ],
  },
  {
    kind: "volume",
    id: "homecook-r2-missing-volume",
    stderrForms: [
      "Error: No such volume: homecook-r2-missing-volume",
      "Error response from daemon: get homecook-r2-missing-volume: no such volume",
    ],
  },
] as const;

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

  it.each(resourceAbsenceCases)("accepts only closed $kind absence stderr with one optional line ending", async ({ kind, id, stderrForms }) => {
    const entry = { kind, id, name: "expected-absent" };
    for (const stderr of stderrForms.flatMap((value) => [value, `${value}\n`, `${value}\r\n`])) {
      const adapters = createLocalReleaseRehearsalRunnerAdapters(options({
        runCommand: async () => ({ status: 1, signal: null, truncated: false, stdout: "", stderr }),
      }));
      await expect(adapters.inspectResource(entry)).resolves.toBeNull();
    }
  });

  it.each(resourceAbsenceCases)("rejects status 1 with near-miss, prefixed, suffixed, or private-path $kind stderr", async ({ kind, id, stderrForms }) => {
    const entry = { kind, id, name: "expected-absent" };
    const exact = stderrForms[0];
    for (const stderr of [
      "unexpected-status-one",
      `prefix:${exact}`,
      `${exact}:suffix`,
      `${exact}\n/private/provider-secret`,
      `/private/provider-secret\n${exact}`,
      `${exact}\n\n`,
      exact.replace(id, `${id}-near-miss`),
    ]) {
      const adapters = createLocalReleaseRehearsalRunnerAdapters(options({
        runCommand: async () => ({ status: 1, signal: null, truncated: false, stdout: "", stderr }),
      }));
      await expect(adapters.inspectResource(entry)).rejects.toThrow(/^docker_command_failed: isolated Docker command failed\.$/u);
    }
  });

  it.each([
    { kind: "container", id: "/private/provider-container", stderr: "Error: No such container: /private/provider-container" },
    { kind: "network", id: "c".repeat(63), stderr: `Error: No such network: ${"c".repeat(63)}` },
    { kind: "volume", id: "/private/provider-volume", stderr: "Error: No such volume: /private/provider-volume" },
  ])("rejects non-canonical $kind identities even when stderr echoes them exactly", async ({ kind, id, stderr }) => {
    const adapters = createLocalReleaseRehearsalRunnerAdapters(options({
      runCommand: async () => ({ status: 1, signal: null, truncated: false, stdout: "", stderr }),
    }));
    await expect(adapters.inspectResource({ kind, id, name: "expected-absent" })).rejects.toThrow(
      /^docker_command_failed: isolated Docker command failed\.$/u,
    );
  });

  it("requires the dedicated startup identity pending code and exact no-output contract", () => {
    const matchesExpectedDockerNonzero = (runnerAdaptersModule as Record<string, unknown>).matchesExpectedDockerNonzero;
    expect(matchesExpectedDockerNonzero).toBeTypeOf("function");
    if (typeof matchesExpectedDockerNonzero !== "function") return;
    const startupArgs = [
      "exec", "b".repeat(64), "node", "-e",
      "const f=require('node:fs');const p=\"/tmp/homecook-r2-identity.json\";if(!f.existsSync(p))process.exit(45);process.stdout.write(f.readFileSync(p,'utf8'))",
    ];
    expect(matchesExpectedDockerNonzero(
      { status: 45, signal: null, truncated: false, stdout: "", stderr: "" },
      "startup_identity_pending",
      startupArgs,
    )).toBe(true);
    for (const result of [
      { status: 1, signal: null, truncated: false, stdout: "", stderr: "" },
      { status: 45, signal: null, truncated: false, stdout: "pending", stderr: "" },
      { status: 45, signal: null, truncated: false, stdout: "", stderr: "pending" },
      { status: 45, signal: "SIGKILL", truncated: false, stdout: "", stderr: "" },
      { status: null, signal: null, truncated: false, stdout: "", stderr: "" },
      { status: 45, signal: null, truncated: true, stdout: "", stderr: "" },
      { status: 45, signal: null, truncated: false, error: { code: "EIO" }, stdout: "", stderr: "" },
    ]) {
      expect(matchesExpectedDockerNonzero(result, "startup_identity_pending", startupArgs)).toBe(false);
    }
    expect(matchesExpectedDockerNonzero(
      { status: 45, signal: null, truncated: false, stdout: "", stderr: "" },
      "startup_identity_pending",
      ["exec", "/private/provider-container", ...startupArgs.slice(2)],
    )).toBe(false);
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
      expectedNonzero: [
        { outcome: "resource_absent", commandClass: "inspect_container", status: 1, stdoutForm: "empty", stderrMatcher: "container_absence_exact_optional_newline" },
        { outcome: "resource_absent", commandClass: "inspect_network", status: 1, stdoutForm: "empty", stderrMatcher: "network_absence_exact_optional_newline" },
        { outcome: "resource_absent", commandClass: "inspect_volume", status: 1, stdoutForm: "empty", stderrMatcher: "volume_absence_exact_optional_newline" },
        { outcome: "startup_identity_pending", commandClass: "exec_startup_identity", status: 45, stdoutForm: "empty", stderrMatcher: "empty" },
        { outcome: "worker_evidence_pending", commandClass: "exec_worker_evidence", status: 44, stdoutForm: "empty", stderrMatcher: "empty" },
        { outcome: "network_probe_outcome", commandClass: "exec_network_probe", status: 41, stdoutForm: "empty", stderrMatcher: "empty" },
        { outcome: "network_probe_outcome", commandClass: "exec_network_probe", status: 42, stdoutForm: "empty", stderrMatcher: "empty" },
        { outcome: "network_probe_outcome", commandClass: "exec_network_probe", status: 43, stdoutForm: "empty", stderrMatcher: "empty" },
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
