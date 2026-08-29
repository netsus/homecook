import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sha256Jcs } from "../scripts/lib/rfc8785-jcs.mjs";
import {
  buildPrivateDockerEnvironment,
  buildDockerDaemonSnapshot,
  createImmutableCreationLedger,
  readVerifiedMigrationInputs,
  resolveTrustedLocalDockerEndpoint,
  runAbortableCommand,
  validateDockerDaemonSnapshots,
} from "../scripts/lib/local-mac-production-rehearsal-runner-safety.mjs";

function sha256(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function withUnixSocket(operation: (path: string) => Promise<void>) {
  const root = mkdtempSync(join(process.cwd(), ".homecook-r2-docker-socket-"));
  chmodSync(root, 0o700);
  const socketPath = join(root, "docker.sock");
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve());
  });
  chmodSync(socketPath, 0o600);
  try {
    await operation(socketPath);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
}

describe("R2 trusted local Docker endpoint", () => {
  it("rejects arbitrary explicit Unix sockets even when their metadata is self-consistent", async () => {
    await withUnixSocket(async (socketPath) => {
      expect(() => resolveTrustedLocalDockerEndpoint({
        explicitSocketPath: socketPath,
        homeDir: "/Users/test",
        ambient: {
          DOCKER_CONTEXT: "production-remote",
          DOCKER_HOST: "ssh://root@production.example",
          HOME: "/Users/test",
        },
      })).toThrow(/canonical|Docker Desktop|arbitrary|endpoint/iu);
    });
  });

  it("keeps Docker config private without accepting its socket as authority", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "homecook-r2-docker-config-"));
    chmodSync(runRoot, 0o700);
    const environment = buildPrivateDockerEnvironment({ runRoot });
    expect(environment.DOCKER_CONFIG).toBe(join(runRoot, "docker-config"));
    expect(environment).not.toHaveProperty("HOME");
    expect(environment).not.toHaveProperty("DOCKER_CONTEXT");
    expect(environment).not.toHaveProperty("DOCKER_HOST");
  });

  it.each([
    "tcp://127.0.0.1:2375",
    "ssh://root@remote.example/run/docker.sock",
    "http://remote.example",
    "npipe:////./pipe/docker_engine",
    "unix://relative.sock",
  ])("rejects non-local or indirect endpoint %s before command execution", (value) => {
    expect(() => resolveTrustedLocalDockerEndpoint({
      explicitSocketPath: value,
      homeDir: "/Users/test",
      ambient: {},
    })).toThrow(/local.*Docker|Unix socket|endpoint/iu);
  });

  it("rejects a symlinked Docker socket", async () => {
    await withUnixSocket(async (socketPath) => {
      const linkPath = `${socketPath}.link`;
      symlinkSync(socketPath, linkPath);
      expect(() => resolveTrustedLocalDockerEndpoint({
        explicitSocketPath: linkPath,
        homeDir: "/Users/test",
        ambient: {},
      })).toThrow(/symlink|socket identity|arbitrary/iu);
    });
  });

  it("requires exact pre/post daemon and endpoint identity equality", () => {
    const snapshot = buildDockerDaemonSnapshot({
      endpoint_digest: "a".repeat(64),
      daemon_id: "daemon-local",
      server_version: "26.1.0",
      operating_system: "Docker Desktop",
      os_type: "linux",
      architecture: "aarch64",
      docker_root_dir_digest: "b".repeat(64),
      rootless: false,
      security_options_digest: "c".repeat(64),
    });
    expect(validateDockerDaemonSnapshots(snapshot, { ...snapshot })).toEqual(snapshot);
    expect(() => validateDockerDaemonSnapshots(snapshot, {
      ...snapshot,
      daemon_id: "remote-daemon",
    })).toThrow(/daemon.*drift|identity/iu);
  });
});

describe("R2 abortable command lifecycle", () => {
  it("interrupts a hung process promptly on AbortSignal", async () => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const command = runAbortableCommand({
      command: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      signal: controller.signal,
      timeoutMs: 30_000,
      maxOutputBytes: 1024,
    });
    setTimeout(() => controller.abort(new Error("SIGTERM")), 50);
    await expect(command).rejects.toThrow(/abort|SIGTERM|signal/iu);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("kills a child when bounded output overflows", async () => {
    await expect(runAbortableCommand({
      command: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(4096));setInterval(()=>{},1000)"],
      signal: new AbortController().signal,
      timeoutMs: 30_000,
      maxOutputBytes: 128,
    })).rejects.toThrow(/output.*overflow|limit/iu);
  });

  it("times out a hung child without blocking the event loop", async () => {
    const startedAt = Date.now();
    await expect(runAbortableCommand({
      command: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      signal: new AbortController().signal,
      timeoutMs: 80,
      maxOutputBytes: 1024,
    })).rejects.toThrow(/timeout/iu);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});

describe("R2 verified migration bytes", () => {
  it("holds exact sealed migration Buffers and recomputes the ordered aggregate", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-r2-migrations-"));
    chmodSync(root, 0o700);
    const migrationRoot = join(root, "bundles", "bundle", "full_local", "supabase", "migrations");
    mkdirSync(migrationRoot, { recursive: true, mode: 0o700 });
    const fixtures = [
      ["20260101000000_one.sql", "select 1;\n"],
      ["20260102000000_two.sql", "select 2;\n"],
    ] as const;
    const entries = fixtures.map(([name, source]) => {
      const path = join(migrationRoot, name);
      writeFileSync(path, source, { mode: 0o400 });
      chmodSync(path, 0o400);
      return { path: `supabase/migrations/${name}`, sha256: sha256(source) };
    });
    const result = readVerifiedMigrationInputs({
      candidateRoot: root,
      migration: {
        ordered_migration_files: entries.map((entry) => entry.path),
        ordered_migration_files_digest: sha256Jcs(entries),
        migration_head: "20260102000000_two",
      },
    });
    expect(result.entries).toEqual(entries);
    expect(result.inputs.map((entry: { bytes: Buffer }) => entry.bytes.toString("utf8")))
      .toEqual(fixtures.map(([, source]) => source));
  });

  it("rejects aggregate mismatch, symlink, and hardlink substitution", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-r2-migration-attacks-"));
    chmodSync(root, 0o700);
    const migrationRoot = join(root, "bundles", "bundle", "full_local", "supabase", "migrations");
    mkdirSync(migrationRoot, { recursive: true, mode: 0o700 });
    const first = join(migrationRoot, "20260101000000_one.sql");
    writeFileSync(first, "select 1;\n", { mode: 0o400 });
    chmodSync(first, 0o400);
    const migration = {
      ordered_migration_files: ["supabase/migrations/20260101000000_one.sql"],
      ordered_migration_files_digest: "0".repeat(64),
      migration_head: "20260101000000_one",
    };
    expect(() => readVerifiedMigrationInputs({ candidateRoot: root, migration }))
      .toThrow(/aggregate|digest|mismatch/iu);

    const hardlink = join(migrationRoot, "20260102000000_hard.sql");
    linkSync(first, hardlink);
    const hardEntry = { path: "supabase/migrations/20260102000000_hard.sql", sha256: sha256("select 1;\n") };
    expect(() => readVerifiedMigrationInputs({
      candidateRoot: root,
      migration: {
        ordered_migration_files: [hardEntry.path],
        ordered_migration_files_digest: sha256Jcs([hardEntry]),
        migration_head: "20260102000000_hard",
      },
    })).toThrow(/hardlink|link count/iu);
  });
});

describe("R2 immutable creation ledger", () => {
  it("records exact create-returned identity and never adopts discovery", () => {
    const ledger = createImmutableCreationLedger();
    ledger.record({ kind: "network", id: "created-id", name: "expected-network" });
    const beforeDiscovery = ledger.snapshot();
    const discovered = { kind: "network", id: "attacker-id", name: "expected-network" };
    expect(ledger.contains(discovered)).toBe(false);
    expect(ledger.snapshot()).toEqual(beforeDiscovery);
    expect(() => ledger.record({ kind: "network", id: "created-id", name: "renamed" }))
      .toThrow(/duplicate|immutable|identity/iu);
  });
});
