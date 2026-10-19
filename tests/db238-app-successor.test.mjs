import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import * as successor from "../scripts/lib/prelaunch-db-app-successor.mjs";
import { hash, sha, ref, route, operator, operatorPair, successorInput, successorWithPin } from "./fixtures/db238-app-successor-fixture.mjs";

test("unbound app approval fails before any private read", async () => {
  const scoped = await successorWithPin({ path: null, sha256: null });
  let reads = 0;
  assert.throws(() => scoped.readDbAppSuccessorReview(() => { reads++; throw Error("unexpected private read"); }), /DB_APP_SUCCESSOR_PIN_UNBOUND/u);
  assert.equal(reads, 0);
});

test("approval reader pins raw bytes, not reparsed JSON", async () => {
  const source = readFileSync(new URL("../scripts/lib/prelaunch-db-app-successor.mjs", import.meta.url), "utf8");
  const bytes = Buffer.from(JSON.stringify(successorInput().review));
  const pin = /^export const DB_APP_SUCCESSOR_REVIEW_PIN\s*=\s*Object\.freeze\([^;]+\);/mu;
  assert.equal([...source.matchAll(new RegExp(pin.source, "gmu"))].length, 1);
  const patched = source.replace(pin, `export const DB_APP_SUCCESSOR_REVIEW_PIN = Object.freeze(${JSON.stringify({ path: "/synthetic-db238/approval.json", sha256: hash(bytes) })});`)
    .replace(/from (["'])(\.\/[^"'\n]+)\1/gu, (_all, _quote, relative) => `from "${pathToFileURL(resolve("scripts/lib", relative)).href}"`);
  const scoped = await import(`data:text/javascript;base64,${Buffer.from(patched).toString("base64")}`);
  assert.deepEqual(scoped.readDbAppSuccessorReview(() => bytes), JSON.parse(bytes));
  assert.throws(() => scoped.readDbAppSuccessorReview(() => Buffer.concat([bytes, Buffer.from("\n")])), /DB_APP_SUCCESSOR_REVIEW_DIGEST/u);
});

test("exact committed238 app candidate does not create an old source-handoff grant", () => {
  const result = successor.assertDbAppSuccessor(successorInput());
  assert(result.supportFiles instanceof Set);
  assert.equal(result.supportFiles.size, 0);
});

test("only the historical operator singleton is returned as support", () => {
  const input = successorInput();
  input.files.push(operator);
  input.digests[operator] = [...operatorPair];
  input.review.files[operator] = [...operatorPair];
  assert.deepEqual([...successor.assertDbAppSuccessor(input).supportFiles], [operator]);
  input.digests[operator][1] = sha("f");
  input.review.files[operator][1] = sha("f");
  assert.throws(() => successor.assertDbAppSuccessor(input), /^Error: DB_APP_SUCCESSOR_OPERATOR$/u);
});

const expectedMutationErrors = {
  "unknown feature": /^Saved nutrition exact maintenance: fixed current196-to-candidate pair required$/u,
  "uncommitted receipt": /^Saved nutrition exact maintenance: bound238 receipt\/backup\/original transaction evidence required$/u,
  "foreign guard": /^Saved nutrition exact maintenance: terminal\/guard binding differs$/u,
  "changed maintenance binding": /^DB_APP_SUCCESSOR_MAINTENANCE$/u,
  "reader floor is not live ancestor": /^DB_APP_SUCCESSOR_ANCESTRY$/u,
  "live is not candidate ancestor": /^DB_APP_SUCCESSOR_ANCESTRY$/u,
  "different live ref": /^DB_APP_SUCCESSOR_SOURCE$/u,
  "different live build": /^DB_APP_SUCCESSOR_SOURCE$/u,
  "different live plist": /^DB_APP_SUCCESSOR_SOURCE$/u,
  "different source": /^DB_APP_SUCCESSOR_SOURCE$/u,
  "different candidate": /^DB_APP_SUCCESSOR_SOURCE$/u,
  "missing file": /^DB_APP_SUCCESSOR_FILES$/u,
  "duplicate file": /^DB_APP_SUCCESSOR_FILES$/u,
  "changed before blob": /^DB_APP_SUCCESSOR_FILES$/u,
  "changed after blob": /^DB_APP_SUCCESSOR_FILES$/u,
  "no read-only DB verification": /^DB_APP_SUCCESSOR_OPTIONS$/u,
  "missing DB config": /^DB_APP_SUCCESSOR_OPTIONS$/u,
  "unreviewed ref option": /^DB_APP_SUCCESSOR_OPTIONS$/u,
  "environment patch": /^DB_APP_SUCCESSOR_OPTIONS$/u,
  "DB baseline": /^DB_APP_SUCCESSOR_OPTIONS$/u,
  "other reviewed mode": /^DB_APP_SUCCESSOR_OPTIONS$/u,
};

for (const [name, mutate] of [
  ["unknown feature", x => { x.maintenance.review.feature = "foreign"; }],
  ["uncommitted receipt", x => { x.maintenance.record.status = "unknown"; }],
  ["foreign guard", x => { x.maintenance.guardPointer.sha256 = sha("f"); }],
  ["changed maintenance binding", x => { x.review.maintenance.receipt.sha256 = sha("f"); }],
  ["reader floor is not live ancestor", x => { x.readerFloorAncestor = false; }],
  ["live is not candidate ancestor", x => { x.liveAncestor = false; }],
  ["different live ref", x => { x.live.ref = ref("e"); }],
  ["different live build", x => { x.live.buildId = "foreign"; }],
  ["different live plist", x => { x.live.plistSha256 = sha("f"); }],
  ["different source", x => { x.from = ref("e"); }],
  ["different candidate", x => { x.to = ref("e"); }],
  ["missing file", x => { x.files = []; }],
  ["duplicate file", x => { x.files.push(route); }],
  ["changed before blob", x => { x.digests[route][0] = sha("f"); }],
  ["changed after blob", x => { x.digests[route][1] = sha("f"); }],
  ["no read-only DB verification", x => { x.options.alreadyAppliedDb = false; }],
  ["missing DB config", x => { x.options.dbConfig = ""; }],
  ["unreviewed ref option", x => { x.options.refOption = "--ref"; }],
  ["environment patch", x => { x.options.envFile = "/synthetic-db238/not-read"; }],
  ["DB baseline", x => { x.options.dbBaseline = "/synthetic-db238/not-read-baseline"; }],
  ["other reviewed mode", x => { x.options.reviewedProtectedRollout = true; }],
]) test(`rejects ${name}`, () => {
  const input = successorInput(); mutate(input);
  assert.throws(() => successor.assertDbAppSuccessor(input), error => error instanceof Error
    && !(error instanceof TypeError) && !(error instanceof ReferenceError)
    && expectedMutationErrors[name].test(error.message));
});

for (const file of ["supabase/migrations/20261020000000_forbidden.sql", ".env.example", "package.json", "next.config.ts",
  "lib/supabase/server.ts", "lib/server/hybrid-auth/example.ts", "lib/server/account-generation/session-authority.ts",
  "lib/server/full-local-auth/runtime.ts", "scripts/lib/youtube-extraction-worker-runtime.mjs",
  "app/api/v1/auth/callback/route.ts", "scripts/lib/prelaunch-database.mjs", "app/api/v1/marketing/leads/route.ts",
  "../app/api/v1/recipes/route.ts", "app/api/v1/../auth/route.ts", "docs/..", "docs/./file.md", "docs//file.md"])
  test(`rejects forbidden path even with exact matching approval: ${file}`, () => {
    const input = successorInput(); input.files.push(file);
    input.digests[file] = [sha("3"), sha("4")]; input.review.files[file] = [sha("3"), sha("4")];
    assert.throws(() => successor.assertDbAppSuccessor(input), /^Error: DB_APP_SUCCESSOR_SCOPE$/u);
  });
