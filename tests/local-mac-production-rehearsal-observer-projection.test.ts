import { describe, expect, it } from "vitest";
import { projectTrustedObservation } from "../scripts/lib/local-mac-production-rehearsal-observer-projection.mjs";

const digest = "a".repeat(64);
const subject = { container_id: "c", host_pid: 9, host_pgid: 9, executable_identity_digest: "b".repeat(64) };
const clean = { logEvents: [{ pid: 77, pgid: 1, executable_identity_digest: digest, timestamp: "2026-08-29T00:00:00.000Z", kind: "noise" }], lsofEvents: [], processEvents: [], subjects: [subject], toolIdentities: { log: digest, lsof: digest, ps: digest }, preSurfaceDigest: digest, postSurfaceDigest: digest, daemonDigest: digest, startedAt: "2026-08-29T00:00:00.000Z", completedAt: "2026-08-29T00:01:00.000Z" };
describe("R2 trusted observation projection", () => {
  it("accepts canonical unrelated noise", () => expect(projectTrustedObservation(clean).unrelated_noise_count).toBe(1));
  it("rejects relevant access, truncation-shaped malformed events, and PID reuse", () => {
    expect(() => projectTrustedObservation({ ...clean, logEvents: [{ pid: 9, pgid: 9, executable_identity_digest: subject.executable_identity_digest, timestamp: "2026-08-29T00:00:00.000Z", kind: "socket", relevant: true }] })).toThrow(/relevant/iu);
    expect(() => projectTrustedObservation({ ...clean, logEvents: [{ pid: 9, pgid: 9, executable_identity_digest: subject.executable_identity_digest, timestamp: "bad", kind: "x" }] })).toThrow(/malformed/iu);
    expect(() => projectTrustedObservation({ ...clean, logEvents: [{ pid: 9, pgid: 10, executable_identity_digest: subject.executable_identity_digest, timestamp: "2026-08-29T00:00:00.000Z", kind: "x" }] })).toThrow(/identity/iu);
    expect(() => projectTrustedObservation({ ...clean, logEvents: [{ pid: 202, pgid: 9, executable_identity_digest: digest, timestamp: "2026-08-29T00:00:00.000Z", kind: "production-5432", relevant: true }] })).toThrow(/relevant/iu);
    expect(() => projectTrustedObservation({ ...clean, logEvents: [{ pid: 202, pgid: 0, executable_identity_digest: digest, timestamp: "2026-08-29T00:00:00.000Z", kind: "/var/run/docker.sock", relevant: true }] })).toThrow(/unbound|relevant/iu);
  });
});
