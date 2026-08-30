import { sha256Jcs } from "./rfc8785-jcs.mjs";

const DIGEST = /^[0-9a-f]{64}$/u;
const TIME = /^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/u;

function fail(message) { throw new Error(`R2 observer projection rejected: ${message}`); }

/** Canonicalize trusted tool output, retaining only events tied to registered subjects. */
export function projectTrustedObservation({ logEvents, lsofEvents, processEvents, subjects, toolIdentities, preSurfaceDigest, postSurfaceDigest, daemonDigest }) {
  if (!Array.isArray(logEvents) || !Array.isArray(lsofEvents) || !Array.isArray(processEvents) || !Array.isArray(subjects) || subjects.length === 0) fail("observer inputs are incomplete");
  for (const digest of [preSurfaceDigest, postSurfaceDigest, daemonDigest, ...Object.values(toolIdentities ?? {})]) if (!DIGEST.test(digest ?? "")) fail("observer identity digest is invalid");
  if (preSurfaceDigest !== postSurfaceDigest) fail("production surface drifted");
  const byPid = new Map(subjects.map((subject) => [subject.host_pid, subject]));
  if (byPid.size !== subjects.length) fail("registered subjects are duplicated");
  const relevant = [];
  let unrelatedNoiseCount = 0;
  for (const event of [...logEvents, ...lsofEvents, ...processEvents]) {
    if (!event || !Number.isSafeInteger(event.pid) || !TIME.test(event.timestamp ?? "")) fail("observer event is malformed");
    const subject = byPid.get(event.pid);
    if (!subject) { unrelatedNoiseCount++; continue; }
    if (event.pgid !== subject.host_pgid || event.executable_identity_digest !== subject.executable_identity_digest) fail("observer PID identity drifted");
    if (event.relevant === true) relevant.push({ pid: event.pid, kind: event.kind, timestamp: event.timestamp });
  }
  if (relevant.length > 0) fail("observer detected relevant production access");
  const artifact = { schema: "homecook.r2-trusted-observation-projection.v1", pre_surface_digest: preSurfaceDigest, post_surface_digest: postSurfaceDigest, daemon_digest: daemonDigest, tool_identity_digests: toolIdentities, registered_subjects: subjects, relevant_event_count: 0, unrelated_noise_count: unrelatedNoiseCount, event_digest: sha256Jcs({ logEvents, lsofEvents, processEvents }) };
  return Object.freeze({ ...artifact, artifact_digest: sha256Jcs(artifact) });
}
