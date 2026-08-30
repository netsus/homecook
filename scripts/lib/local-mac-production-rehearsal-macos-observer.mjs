import { projectTrustedObservation } from "./local-mac-production-rehearsal-observer-projection.mjs";
import { sha256Jcs } from "./rfc8785-jcs.mjs";

const floorTime = (value) => new Date(Math.floor(value / 1000) * 1000).toISOString();
const ceilTime = (value) => new Date(Math.ceil(value / 1000) * 1000).toISOString();
const fail = (message) => { throw new Error(`R2 macOS observer rejected: ${message}`); };
const PRODUCTION_ACCESS = /(?:homecook-(?:production|full-local)|production|mumeok|\/var\/run\/docker\.sock)/iu;

function parseProcessTable(source) {
  const rows = source.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
    if (!match) fail("process table is malformed");
    return { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), executable: match[4] };
  });
  if (rows.some((row) => !Number.isSafeInteger(row.pid) || row.pid <= 0 || !Number.isSafeInteger(row.ppid) || row.ppid < 0 || !Number.isSafeInteger(row.pgid) || row.pgid <= 0)) fail("process table identity is invalid");
  return rows;
}

function relatedProcesses(subject, rows) {
  const root = rows.find((row) => row.pid === subject.host_pid);
  if (!root || root.pgid !== subject.host_pgid) fail("registered root process is unavailable");
  const selected = new Set([root.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!selected.has(row.pid) && (row.pgid === subject.host_pgid || selected.has(row.ppid))) {
        selected.add(row.pid);
        changed = true;
      }
    }
  }
  return rows.filter((row) => selected.has(row.pid));
}

function normalizeSandboxEvents(events, processRows, subjects) {
  const processByPid = new Map(processRows.map((row) => [row.pid, row]));
  const subjectByPgid = new Map(subjects.map((subject) => [subject.host_pgid, subject]));
  return events.map((event) => {
    const pid = Number(event.processIdentifier ?? event.pid ?? 0);
    const rawTimestamp = event.timestamp ?? event.date;
    if (!Number.isSafeInteger(pid) || pid <= 0 || rawTimestamp === undefined || Number.isNaN(Date.parse(rawTimestamp))) fail("sandbox event identity or timestamp is invalid");
    const process = processByPid.get(pid);
    const subject = process ? subjectByPgid.get(process.pgid) : null;
    const message = String(event.eventMessage ?? event.kind ?? "sandbox-event");
    const timestamp = new Date(rawTimestamp).toISOString();
    return {
      pid,
      pgid: process?.pgid ?? 0,
      executable_identity_digest: process ? (pid === subject?.host_pid ? subject.executable_identity_digest : sha256Jcs(process.executable)) : sha256Jcs(String(event.process ?? "unknown")),
      timestamp,
      kind: message,
      relevant: PRODUCTION_ACCESS.test(message),
      ...(subject ? { subject_container_id: subject.container_id } : {}),
    };
  });
}

export function createTrustedMacOsIndependentObserver({ runCommand, clock = () => Date.now(), sleep = async () => {}, collectProductionSnapshot, snapshotDockerDaemon, toolResolver, platform = process.platform }) {
  if (platform !== "darwin" && toolResolver?.fixture !== true) fail("non-macOS observer success is forbidden");
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
      const processTable = await runCommand({ command: psPath, args: ["-axo", "pid=,ppid=,pgid=,comm="], timeoutMs: 10_000, maxOutputBytes: 1_048_576 });
      if (processTable.status !== 0 || processTable.signal || processTable.truncated) fail("process table observation is unavailable");
      const processRows = parseProcessTable(processTable.stdout);
      const lsofEvents = []; const processEvents = []; const observedPids = new Set();
      for (const subject of subjects) {
        for (const process of relatedProcesses(subject, processRows)) {
          if (observedPids.has(process.pid)) fail("observer process belongs to multiple subjects");
          observedPids.add(process.pid);
          const executableIdentity = process.pid === subject.host_pid ? subject.executable_identity_digest : sha256Jcs(process.executable);
          const lsof = await runCommand({ command: lsofPath, args: ["-nP", "-p", String(process.pid), "-Fpcn"], timeoutMs: 10_000, maxOutputBytes: 65_536 });
          if (lsof.status !== 0 || lsof.signal || lsof.truncated) fail("lsof observation is unavailable");
          processEvents.push({ pid: process.pid, pgid: process.pgid, executable_identity_digest: executableIdentity, timestamp: new Date(ended).toISOString(), kind: "process", subject_container_id: subject.container_id });
          for (const line of lsof.stdout.split(/\r?\n/u).filter(Boolean)) lsofEvents.push({ pid: process.pid, pgid: process.pgid, executable_identity_digest: executableIdentity, timestamp: new Date(ended).toISOString(), kind: line, relevant: PRODUCTION_ACCESS.test(line) || (["app", "worker"].includes(subject.component) && /(?:^|\D)5432(?:\D|$)/u.test(line)), subject_container_id: subject.container_id });
        }
      }
      const post = await collectProductionSnapshot(); const daemon = await snapshotDockerDaemon();
      let events; try { events = JSON.parse(log.stdout); } catch { fail("unified log JSON is invalid"); }
      if (!Array.isArray(events)) fail("unified log JSON is not an array");
      return projectTrustedObservation({ logEvents: normalizeSandboxEvents(events, processRows, subjects), lsofEvents, processEvents, subjects, toolIdentities: { log: toolResolver.logDigest, lsof: toolResolver.lsofDigest, ps: toolResolver.psDigest }, preSurfaceDigest: pre.surface_digest, postSurfaceDigest: post.surface_digest, daemonDigest: daemon.snapshot_digest, startedAt: new Date(started).toISOString(), completedAt: new Date(ended).toISOString() });
    },
  });
}
