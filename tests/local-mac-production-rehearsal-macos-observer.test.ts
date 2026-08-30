import { describe, expect, it } from "vitest";
import { createTrustedMacOsIndependentObserver } from "../scripts/lib/local-mac-production-rehearsal-macos-observer.mjs";

const digest = "a".repeat(64);
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const runCommand = async ({ command, args }: { command: string; args: string[] }) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "/usr/bin/log") return { status: 0, signal: null, truncated: false, stdout: "[]" };
    if (command === "/bin/ps") return { status: 0, signal: null, truncated: false, stdout: "9 1 9 /usr/bin/node\n10 9 9 /usr/bin/node\n" };
    return { status: 0, signal: null, truncated: false, stdout: "" };
  };
  const surface = { surface_digest: digest }; const daemon = { snapshot_digest: digest };
  return { calls, observer: createTrustedMacOsIndependentObserver({ runCommand, clock: (() => { let n = Date.parse("2026-08-29T00:00:00.000Z"); return () => (n += 1000); })(), sleep: async () => {}, collectProductionSnapshot: async () => surface, snapshotDockerDaemon: async () => daemon, toolResolver: { fixture: true, logPath: "/usr/bin/log", lsofPath: "/usr/sbin/lsof", psPath: "/bin/ps", logDigest: digest, lsofDigest: digest, psDigest: digest, ...overrides } }) };
}
describe("trusted macOS observer fixture", () => {
  it("uses pinned log, ps, and lsof in order", async () => {
    const { observer, calls } = fixture(); await observer.begin(); await observer.registerChild({ container_id: "c", host_pid: 9, host_pgid: 9, executable_identity_digest: "b".repeat(64) });
    const result = await observer.end(); expect(calls[0]).toContain("/usr/bin/log show --style json --start"); expect(calls[1]).toContain("/bin/ps -axo pid=,ppid=,pgid=,comm="); expect(calls[2]).toContain("/usr/sbin/lsof -nP -p 9"); expect(calls[3]).toContain("/usr/sbin/lsof -nP -p 10"); expect(result.schema).toBe("homecook.r2-production-observer.v1");
  });
  it("fails closed for missing tools", async () => {
    const observer = createTrustedMacOsIndependentObserver({ runCommand: async () => ({}), collectProductionSnapshot: async () => ({ surface_digest: digest }), snapshotDockerDaemon: async () => ({ snapshot_digest: digest }), toolResolver: { fixture: true } });
    await observer.begin(); await observer.registerChild({ container_id: "c", host_pid: 9, host_pgid: 9, executable_identity_digest: "b".repeat(64) });
    await expect(observer.end()).rejects.toThrow(/tool/iu);
  });
  it("treats a same-process-group child production DB connection as relevant", async () => {
    const observer = createTrustedMacOsIndependentObserver({
      runCommand: async ({ command, args }: { command: string; args: string[] }) => {
        if (command === "/usr/bin/log") return { status: 0, signal: null, truncated: false, stdout: "[]" };
        if (command === "/bin/ps") return { status: 0, signal: null, truncated: false, stdout: "9 1 9 /usr/bin/node\n10 9 9 /usr/bin/node\n" };
        return { status: 0, signal: null, truncated: false, stdout: args.includes("10") ? "n127.0.0.1:5432\n" : "" };
      },
      clock: (() => { let value = Date.parse("2026-08-29T00:00:00.000Z"); return () => (value += 1000); })(),
      sleep: async () => {},
      collectProductionSnapshot: async () => ({ surface_digest: digest }),
      snapshotDockerDaemon: async () => ({ snapshot_digest: digest }),
      toolResolver: { fixture: true, logPath: "/usr/bin/log", lsofPath: "/usr/sbin/lsof", psPath: "/bin/ps", logDigest: digest, lsofDigest: digest, psDigest: digest },
    });
    await observer.begin();
    await observer.registerChild({ container_id: "app-container", component: "app", host_pid: 9, host_pgid: 9, executable_identity_digest: "b".repeat(64) });
    await expect(observer.end()).rejects.toThrow(/relevant|production/iu);
  });
});
