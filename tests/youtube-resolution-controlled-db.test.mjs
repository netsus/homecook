import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  observeYoutubeResolutionWorkerStopped,
  stripExactMigrationWrapper,
} from "../scripts/youtube-resolution-controlled-db.mjs";

test("strips only the exact reviewed top-level transaction wrapper", () => {
  const committed = (name) => execFileSync("git", ["show", `c51d53871f31c7840fe24792b46b191ca963b11b:supabase/migrations/${name}`]);
  const resolution = committed("20261009200000_youtube_ingredient_resolution.sql");
  const saved = committed("20261010010000_youtube_saved_ingredient_links.sql");
  assert.match(stripExactMigrationWrapper(resolution, "20261009200000_youtube_ingredient_resolution.sql"), /^-- Keep extracted source text/u);
  assert.match(stripExactMigrationWrapper(saved, "20261010010000_youtube_saved_ingredient_links.sql"), /^\n?-- Catalog identity/u);
  const changed = Buffer.from(saved); changed[changed.length - 2] = 88;
  assert.throws(() => stripExactMigrationWrapper(changed, "20261010010000_youtube_saved_ingredient_links.sql"), /bytes changed/u);
  assert.throws(() => stripExactMigrationWrapper(saved, "unknown.sql"), /bytes changed/u);
});
test("binds execute to root approval, closure, supabase_admin, locks, snapshot backup and exact receipt", () => {
  const source = readFileSync("scripts/youtube-resolution-controlled-db.mjs", "utf8");
  const planSource = readFileSync("scripts/lib/prelaunch-youtube-resolution-db-plan.mjs", "utf8");
  const combined = `${source}\n${planSource}`;
  for (const expected of [
    "homecook.youtube-resolution-root-approval.v1",
    "assertEnqueueClosureEvidence",
    "supabase_admin",
    "LOCK TABLE homecook_deploy.migrations IN SHARE ROW EXCLUSIVE MODE",
    "LOCK TABLE public.youtube_extraction_jobs IN SHARE ROW EXCLUSIVE MODE",
    "LOCK TABLE public.youtube_extractor_permits IN SHARE ROW EXCLUSIVE MODE",
    "pg_export_snapshot",
    "adapter.backup",
    "assertYoutubeResolutionLockedPrestate",
    "assertYoutubeResolutionDbPoststate",
    "homecook.youtube-resolution-db-apply-receipt.v1",
    "dbRollbackPerformed",
    "postCommitReadback",
    "verifyPrivateProof",
    "observeYoutubeResolutionWorkerStopped",
  ]) assert.match(combined, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(source, /replace\([^\n]+begin|replaceAll\([^\n]+commit/iu);
});

test("observes worker stop from launchd instead of trusting a caller boolean", () => {
  assert.equal(observeYoutubeResolutionWorkerStopped({ uid: 501, run: () => ({ status: 113, stdout: "", stderr: "Could not find service" }) }), true);
  assert.equal(observeYoutubeResolutionWorkerStopped({ uid: 501, run: () => ({ status: 0, stdout: "state = running\npid = 42", stderr: "" }) }), false);
  assert.throws(() => observeYoutubeResolutionWorkerStopped({ uid: 501,
    run: () => ({ status: 1, stdout: "", stderr: "Permission denied" }) }), /ambiguously/u);
});
