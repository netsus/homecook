import { sha256Jcs } from "./rfc8785-jcs.mjs";

const DIGEST = /^[0-9a-f]{64}$/u;
const TIME = /^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/u;

function fail(message) { throw new Error(`R2 observer projection rejected: ${message}`); }

/** Canonicalize trusted tool output, retaining only events tied to registered subjects. */
export function projectTrustedObservation({ logEvents, lsofEvents, processEvents, subjects, toolIdentities, preSurfaceDigest, postSurfaceDigest, daemonDigest, startedAt, completedAt }) {
  if (!Array.isArray(logEvents) || !Array.isArray(lsofEvents) || !Array.isArray(processEvents) || !Array.isArray(subjects) || subjects.length === 0) fail("observer inputs are incomplete");
  for (const digest of [preSurfaceDigest, postSurfaceDigest, daemonDigest, ...Object.values(toolIdentities ?? {})]) if (!DIGEST.test(digest ?? "")) fail("observer identity digest is invalid");
  if (preSurfaceDigest !== postSurfaceDigest) fail("production surface drifted");
  const byPid = new Map(subjects.map((subject) => [subject.host_pid, subject]));
  const byPgid = new Map(subjects.map((subject) => [subject.host_pgid, subject]));
  const byContainer = new Map(subjects.map((subject) => [subject.container_id, subject]));
  if (byPid.size !== subjects.length || byPgid.size !== subjects.length || byContainer.size !== subjects.length) fail("registered subjects are duplicated");
  if (!TIME.test(startedAt ?? "") || !TIME.test(completedAt ?? "") || Date.parse(startedAt) > Date.parse(completedAt)) fail("observer interval is invalid");
  const relevant = [];
  let unrelatedNoiseCount = 0;
  for (const event of [...logEvents, ...lsofEvents, ...processEvents]) {
    if (!event || !Number.isSafeInteger(event.pid) || !TIME.test(event.timestamp ?? "")) fail("observer event is malformed");
    const subject = byPid.get(event.pid)
      ?? byPgid.get(event.pgid)
      ?? byContainer.get(event.subject_container_id);
    if (!subject) {
      if (event.relevant === true) fail("unbound observer event contains relevant production access");
      unrelatedNoiseCount++;
      continue;
    }
    if (event.pgid !== subject.host_pgid || !DIGEST.test(event.executable_identity_digest ?? "")) fail("observer PID identity drifted");
    if (event.pid === subject.host_pid && event.executable_identity_digest !== subject.executable_identity_digest) fail("observer root PID identity drifted");
    if (event.subject_container_id !== undefined && event.subject_container_id !== subject.container_id) fail("observer descendant container identity drifted");
    if (event.relevant === true) relevant.push({ pid: event.pid, kind: event.kind, timestamp: event.timestamp });
  }
  if (relevant.length > 0) fail("observer detected relevant production access");
  const observationDigest = sha256Jcs({ logEvents, lsofEvents, processEvents });
  return Object.freeze({
    schema: "homecook.r2-production-observer.v1",
    source_identity_digest: sha256Jcs(toolIdentities),
    started_at: startedAt,
    completed_at: completedAt,
    pre_snapshot_digest: preSurfaceDigest,
    post_snapshot_digest: postSurfaceDigest,
    process_binding_digest: sha256Jcs({ subjects, processEvents }),
    docker_daemon_identity_digest: daemonDigest,
    observation_digest: observationDigest,
    available: true,
    truncated: false,
    production_db_connection_count: 0,
    production_db_write_count: 0,
    production_credential_access_count: 0,
    production_socket_access_count: 0,
    provider_remote_access_count: 0,
    production_mutation_count: 0,
    unrelated_noise_count: unrelatedNoiseCount,
    registered_subjects: subjects,
  });
}
