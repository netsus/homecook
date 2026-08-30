import { describe, expect, it } from "vitest";
import { createTrustedMacOsIndependentObserver } from "../scripts/lib/local-mac-production-rehearsal-macos-observer.mjs";

const digest = "a".repeat(64);
const canonicalSubject = {
  container_id: "app-container",
  component: "app",
  host_pid: 9,
  host_pgid: 9,
  started_at: "2026-08-29T00:00:00.000Z",
  image_digest: "c".repeat(64),
  config_digest: "d".repeat(64),
  executable_identity_digest: "b".repeat(64),
};
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  let psCalls = 0;
  const runCommand = async ({ command, args }: { command: string; args: string[] }) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "/usr/bin/log") return { status: 0, signal: null, truncated: false, stdout: "[]" };
    if (command === "/bin/ps") return { status: 0, signal: null, truncated: false, stdout: ++psCalls === 1 ? "9 1 9 /usr/bin/node\n10 9 9 /usr/bin/node\n" : "" };
    return { status: 0, signal: null, truncated: false, stdout: "" };
  };
  const surface = { surface_digest: digest }; const daemon = { snapshot_digest: digest };
  return { calls, observer: createTrustedMacOsIndependentObserver({ runCommand, clock: (() => { let n = Date.parse("2026-08-29T00:00:00.000Z"); return () => (n += 1000); })(), sleep: async () => {}, collectProductionSnapshot: async () => surface, snapshotDockerDaemon: async () => daemon, toolResolver: { fixture: true, logPath: "/usr/bin/log", lsofPath: "/usr/sbin/lsof", psPath: "/bin/ps", logDigest: digest, lsofDigest: digest, psDigest: digest, ...overrides } }) };
}
describe("trusted macOS observer fixture", () => {
  it("freezes subject process evidence before cleanup and finalizes the live observation window after cleanup", async () => {
    let cleaned = false;
    const snapshots = [digest, digest];
    const daemonSnapshots = ["e".repeat(64), "e".repeat(64)];
    const psStates: string[] = [];
    const observer = createTrustedMacOsIndependentObserver({
      runCommand: async ({ command }: { command: string }) => {
        if (command === "/bin/ps") {
          psStates.push(cleaned ? "after-cleanup" : "before-cleanup");
          return { status: 0, signal: null, truncated: false, stdout: cleaned ? "" : "9 1 9 /usr/bin/node\n10 9 9 /usr/bin/node\n" };
        }
        if (command === "/usr/bin/log") return { status: 0, signal: null, truncated: false, stdout: "[]" };
        return { status: 0, signal: null, truncated: false, stdout: "" };
      },
      clock: (() => { let value = Date.parse("2026-08-29T00:00:00.000Z"); return () => (value += 1000); })(),
      sleep: async () => {},
      collectProductionSnapshot: async () => ({ surface_digest: snapshots.shift() }),
      snapshotDockerDaemon: async () => ({ snapshot_digest: daemonSnapshots.shift() }),
      toolResolver: { fixture: true, logPath: "/usr/bin/log", lsofPath: "/usr/sbin/lsof", psPath: "/bin/ps", logDigest: digest, lsofDigest: digest, psDigest: digest },
    });
    await observer.begin({ preSnapshot: { surface_digest: digest } });
    await observer.registerChild(canonicalSubject);
    const frozenSubjects = await observer.captureSubjects();
    cleaned = true;
    const result = await observer.end({
      postSnapshot: { surface_digest: digest },
      registeredSubjects: frozenSubjects,
    });
    expect(psStates).toEqual(["before-cleanup", "after-cleanup"]);
    expect(result.registered_subjects).toEqual([canonicalSubject]);
    expect(result.pre_snapshot_digest).toBe(digest);
    expect(result.post_snapshot_digest).toBe(digest);
  });

  it("rejects an orphaned registered process after cleanup", async () => {
    let postCleanup = false;
    const observer = createTrustedMacOsIndependentObserver({
      runCommand: async ({ command }: { command: string }) => {
        if (command === "/bin/ps") return { status: 0, signal: null, truncated: false, stdout: postCleanup ? "10 1 9 /usr/bin/node\n" : "9 1 9 /usr/bin/node\n10 9 9 /usr/bin/node\n" };
        if (command === "/usr/bin/log") return { status: 0, signal: null, truncated: false, stdout: "[]" };
        return { status: 0, signal: null, truncated: false, stdout: "" };
      },
      clock: (() => { let value = Date.parse("2026-08-29T00:00:00.000Z"); return () => (value += 1000); })(),
      sleep: async () => {},
      collectProductionSnapshot: async () => ({ surface_digest: digest }),
      snapshotDockerDaemon: async () => ({ snapshot_digest: "e".repeat(64) }),
      toolResolver: { fixture: true, logPath: "/usr/bin/log", lsofPath: "/usr/sbin/lsof", psPath: "/bin/ps", logDigest: digest, lsofDigest: digest, psDigest: digest },
    });
    await observer.begin({ preSnapshot: { surface_digest: digest } });
    await observer.registerChild(canonicalSubject);
    const registeredSubjects = await observer.captureSubjects();
    postCleanup = true;
    await expect(observer.end({ postSnapshot: { surface_digest: digest }, registeredSubjects }))
      .rejects.toThrow(/orphan|residue|process.*cleanup|zero/iu);
  });

  it("fails closed when post-cleanup ps is missing", async () => {
    let psCalls = 0;
    const observer = createTrustedMacOsIndependentObserver({
      runCommand: async ({ command }: { command: string }) => {
        if (command === "/bin/ps") return ++psCalls === 1
          ? { status: 0, signal: null, truncated: false, stdout: "9 1 9 /usr/bin/node\n" }
          : { status: 1, signal: null, truncated: false, stdout: "" };
        if (command === "/usr/bin/log") return { status: 0, signal: null, truncated: false, stdout: "[]" };
        return { status: 0, signal: null, truncated: false, stdout: "" };
      },
      clock: (() => { let value = Date.parse("2026-08-29T00:00:00.000Z"); return () => (value += 1000); })(), sleep: async () => {},
      collectProductionSnapshot: async () => ({ surface_digest: digest }), snapshotDockerDaemon: async () => ({ snapshot_digest: digest }),
      toolResolver: { fixture: true, logPath: "/usr/bin/log", lsofPath: "/usr/sbin/lsof", psPath: "/bin/ps", logDigest: digest, lsofDigest: digest, psDigest: digest },
    });
    await observer.begin({ preSnapshot: { surface_digest: digest } });
    await observer.registerChild(canonicalSubject);
    const registeredSubjects = await observer.captureSubjects();
    await expect(observer.end({ postSnapshot: { surface_digest: digest }, registeredSubjects }))
      .rejects.toThrow(/post-cleanup|process table|ps/iu);
  });

  it("takes final snapshots before ending and queries the complete sandbox window", async () => {
    const order: string[] = [];
    let psCalls = 0;
    const clockValues = [
      Date.parse("2026-08-29T00:00:00.000Z"),
      Date.parse("2026-08-29T00:00:01.000Z"),
      Date.parse("2026-08-29T00:00:05.000Z"),
    ];
    const observer = createTrustedMacOsIndependentObserver({
      runCommand: async ({ command, args }: { command: string; args: string[] }) => {
        if (command === "/bin/ps") { order.push(++psCalls === 1 ? "capture-ps" : "post-ps"); return { status: 0, signal: null, truncated: false, stdout: psCalls === 1 ? "9 1 9 /usr/bin/node\n" : "" }; }
        if (command === "/usr/bin/log") { order.push(`log:${args[args.indexOf("--end") + 1]}`); return { status: 0, signal: null, truncated: false, stdout: JSON.stringify([{ processIdentifier: 9, timestamp: "2026-08-29T00:00:05.000Z", eventMessage: "production denied" }]) }; }
        return { status: 0, signal: null, truncated: false, stdout: "" };
      },
      clock: () => clockValues.shift()!,
      sleep: async () => { order.push("flush"); },
      collectProductionSnapshot: async () => { order.push(order.length === 0 ? "pre-snapshot" : "post-snapshot"); return { surface_digest: digest }; },
      snapshotDockerDaemon: async () => { order.push(order.includes("post-snapshot") ? "post-daemon" : "pre-daemon"); return { snapshot_digest: digest }; },
      toolResolver: { fixture: true, logPath: "/usr/bin/log", lsofPath: "/usr/sbin/lsof", psPath: "/bin/ps", logDigest: digest, lsofDigest: digest, psDigest: digest },
    });
    await observer.begin({ preSnapshot: { surface_digest: digest } });
    await observer.registerChild(canonicalSubject);
    const registeredSubjects = await observer.captureSubjects();
    await expect(observer.end({ postSnapshot: { surface_digest: digest }, registeredSubjects }))
      .rejects.toThrow(/relevant|production/iu);
    expect(order).toEqual([
      "pre-snapshot", "pre-daemon", "capture-ps", "post-ps", "post-snapshot", "post-daemon", "flush", "log:2026-08-29T00:00:05.000Z",
    ]);
  });

  it("fails closed when finalization has no frozen subject capture", async () => {
    const { observer } = fixture();
    await observer.begin({ preSnapshot: { surface_digest: digest } });
    await observer.registerChild(canonicalSubject);
    await expect(observer.end({ postSnapshot: { surface_digest: digest }, registeredSubjects: [canonicalSubject] }))
      .rejects.toThrow(/capture/iu);
  });

  it("fails closed when frozen subjects, daemon identity, or production snapshots drift", async () => {
    const create = (overrides: { daemonPost?: string; surfacePost?: string } = {}) => {
      let psCalls = 0;
      return createTrustedMacOsIndependentObserver({
      runCommand: async ({ command }: { command: string }) => {
        if (command === "/bin/ps") return { status: 0, signal: null, truncated: false, stdout: ++psCalls === 1 ? "9 1 9 /usr/bin/node\n" : "" };
        if (command === "/usr/bin/log") return { status: 0, signal: null, truncated: false, stdout: "[]" };
        return { status: 0, signal: null, truncated: false, stdout: "" };
      },
      clock: (() => { let value = Date.parse("2026-08-29T00:00:00.000Z"); return () => (value += 1000); })(),
      sleep: async () => {},
      collectProductionSnapshot: (() => {
        const values = [digest, overrides.surfacePost ?? digest];
        return async () => ({ surface_digest: values.shift() });
      })(),
      snapshotDockerDaemon: (() => {
        const values = ["e".repeat(64), overrides.daemonPost ?? "e".repeat(64)];
        return async () => ({ snapshot_digest: values.shift() });
      })(),
      toolResolver: { fixture: true, logPath: "/usr/bin/log", lsofPath: "/usr/sbin/lsof", psPath: "/bin/ps", logDigest: digest, lsofDigest: digest, psDigest: digest },
    });
    };
    const exercise = async (observer: ReturnType<typeof createTrustedMacOsIndependentObserver>, registeredSubjects = [canonicalSubject]) => {
      await observer.begin({ preSnapshot: { surface_digest: digest } });
      await observer.registerChild(canonicalSubject);
      const frozen = await observer.captureSubjects();
      return observer.end({ postSnapshot: { surface_digest: digest }, registeredSubjects: registeredSubjects.length ? registeredSubjects : frozen });
    };
    await expect(exercise(create(), [{ ...canonicalSubject, container_id: "substituted" }])).rejects.toThrow(/subject/iu);
    await expect(exercise(create({ daemonPost: "f".repeat(64) }))).rejects.toThrow(/daemon/iu);
    await expect(exercise(create({ surfacePost: "f".repeat(64) }))).rejects.toThrow(/snapshot/iu);
  });

  it("uses pinned log, ps, and lsof in order", async () => {
    const { observer, calls } = fixture(); await observer.begin({ preSnapshot: { surface_digest: digest } }); await observer.registerChild({ container_id: "c", host_pid: 9, host_pgid: 9, executable_identity_digest: "b".repeat(64) });
    const registeredSubjects = await observer.captureSubjects();
    const result = await observer.end({ postSnapshot: { surface_digest: digest }, registeredSubjects }); expect(calls[0]).toContain("/bin/ps -axo pid=,ppid=,pgid=,comm="); expect(calls[1]).toContain("/usr/sbin/lsof -nP -p 9"); expect(calls[2]).toContain("/usr/sbin/lsof -nP -p 10"); expect(calls[3]).toContain("/bin/ps -axo pid=,ppid=,pgid=,comm="); expect(calls[4]).toContain("/usr/bin/log show --style json --start"); expect(result.schema).toBe("homecook.r2-production-observer.v1");
  });
  it("fails closed for missing tools", async () => {
    const observer = createTrustedMacOsIndependentObserver({ runCommand: async () => ({}), collectProductionSnapshot: async () => ({ surface_digest: digest }), snapshotDockerDaemon: async () => ({ snapshot_digest: digest }), toolResolver: { fixture: true } });
    await observer.begin({ preSnapshot: { surface_digest: digest } }); await observer.registerChild({ container_id: "c", host_pid: 9, host_pgid: 9, executable_identity_digest: "b".repeat(64) });
    await expect(observer.captureSubjects()).rejects.toThrow(/tool/iu);
  });
  it("treats a same-process-group child production DB connection as relevant", async () => {
    let psCalls = 0;
    const observer = createTrustedMacOsIndependentObserver({
      runCommand: async ({ command, args }: { command: string; args: string[] }) => {
        if (command === "/usr/bin/log") return { status: 0, signal: null, truncated: false, stdout: "[]" };
        if (command === "/bin/ps") return { status: 0, signal: null, truncated: false, stdout: ++psCalls === 1 ? "9 1 9 /usr/bin/node\n10 9 9 /usr/bin/node\n" : "" };
        return { status: 0, signal: null, truncated: false, stdout: args.includes("10") ? "n127.0.0.1:5432\n" : "" };
      },
      clock: (() => { let value = Date.parse("2026-08-29T00:00:00.000Z"); return () => (value += 1000); })(),
      sleep: async () => {},
      collectProductionSnapshot: async () => ({ surface_digest: digest }),
      snapshotDockerDaemon: async () => ({ snapshot_digest: digest }),
      toolResolver: { fixture: true, logPath: "/usr/bin/log", lsofPath: "/usr/sbin/lsof", psPath: "/bin/ps", logDigest: digest, lsofDigest: digest, psDigest: digest },
    });
    await observer.begin({ preSnapshot: { surface_digest: digest } });
    await observer.registerChild({ container_id: "app-container", component: "app", host_pid: 9, host_pgid: 9, executable_identity_digest: "b".repeat(64) });
    const registeredSubjects = await observer.captureSubjects();
    await expect(observer.end({ postSnapshot: { surface_digest: digest }, registeredSubjects })).rejects.toThrow(/relevant|production/iu);
  });
});
