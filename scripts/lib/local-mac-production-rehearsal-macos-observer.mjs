import { projectTrustedObservation } from "./local-mac-production-rehearsal-observer-projection.mjs";

const floorTime = (value) => new Date(Math.floor(value / 1000) * 1000).toISOString();
const ceilTime = (value) => new Date(Math.ceil(value / 1000) * 1000).toISOString();
const fail = (message) => { throw new Error(`R2 macOS observer rejected: ${message}`); };

export function createTrustedMacOsIndependentObserver({ runCommand, clock = () => Date.now(), sleep = async () => {}, collectProductionSnapshot, snapshotDockerDaemon, toolResolver }) {
  if (process.platform !== "darwin" && toolResolver?.fixture !== true) fail("non-macOS observer success is forbidden");
  const subjects = [];
  let pre = null;
  let started = null;
  return Object.freeze({
    async begin() { started = clock(); pre = await collectProductionSnapshot(); await snapshotDockerDaemon(); },
    async registerChild(subject) { if (!subject?.container_id || subjects.some((item) => item.container_id === subject.container_id)) fail("observer subject is invalid"); subjects.push(subject); },
    async end() {
      if (!pre || !started || subjects.length === 0) fail("observer begin or subjects are missing");
      await sleep(1000);
      const ended = clock(); const logPath = toolResolver.logPath; const lsofPath = toolResolver.lsofPath; const psPath = toolResolver.psPath;
      for (const path of [logPath, lsofPath, psPath]) if (typeof path !== "string" || !path.startsWith("/")) fail("trusted observer tool is unavailable");
      const log = await runCommand({ command: logPath, args: ["show", "--style", "json", "--start", floorTime(started), "--end", ceilTime(ended), "--predicate", "subsystem == 'com.apple.sandbox'"], timeoutMs: 30_000, maxOutputBytes: 1_048_576 });
      if (log.status !== 0 || log.signal || log.truncated) fail("unified log observation is unavailable");
      const lsofEvents = []; const processEvents = [];
      for (const subject of subjects) {
        const ps = await runCommand({ command: psPath, args: ["-o", "pid=,pgid=,comm=", "-p", String(subject.host_pid)], timeoutMs: 10_000, maxOutputBytes: 65_536 });
        const lsof = await runCommand({ command: lsofPath, args: ["-nP", "-p", String(subject.host_pid), "-Fpcn"], timeoutMs: 10_000, maxOutputBytes: 65_536 });
        if (ps.status !== 0 || ps.signal || ps.truncated || lsof.status !== 0 || lsof.signal || lsof.truncated) fail("lsof or ps observation is unavailable");
        const [pid, pgid, executable] = ps.stdout.trim().split(/\s+/, 3);
        if (Number(pid) !== subject.host_pid || Number(pgid) !== subject.host_pgid || !executable) fail("registered process identity drifted");
        processEvents.push({ pid: subject.host_pid, pgid: subject.host_pgid, executable_identity_digest: subject.executable_identity_digest, timestamp: new Date(ended).toISOString(), kind: "process" });
        for (const line of lsof.stdout.split(/\r?\n/u).filter(Boolean)) lsofEvents.push({ pid: subject.host_pid, pgid: subject.host_pgid, executable_identity_digest: subject.executable_identity_digest, timestamp: new Date(ended).toISOString(), kind: line, relevant: /(?:\.sock|5432|provider|supabase|mumeok)/iu.test(line) });
      }
      const post = await collectProductionSnapshot(); const daemon = await snapshotDockerDaemon();
      let events; try { events = JSON.parse(log.stdout); } catch { fail("unified log JSON is invalid"); }
      return projectTrustedObservation({ logEvents: events, lsofEvents, processEvents, subjects, toolIdentities: { log: toolResolver.logDigest, lsof: toolResolver.lsofDigest, ps: toolResolver.psDigest }, preSurfaceDigest: pre.surface_digest, postSurfaceDigest: post.surface_digest, daemonDigest: daemon.snapshot_digest });
    },
  });
}
