import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { canonicalizeJcs, parseCanonicalJcs } from "./lib/rfc8785-jcs.mjs";
import { collectReleaseTestInventory } from "./lib/local-mac-production-release-test-inventory.mjs";
import {
  RELEASE_EVIDENCE_NOTE_REF,
  validateLocalMacProductionReleaseEvidence,
} from "./lib/local-mac-production-release-evidence.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const fileIndex = process.argv.indexOf("--file");
const source = fileIndex >= 0
  ? readFileSync(process.argv[fileIndex + 1], "utf8")
  : execFileSync("git", ["notes", `--ref=${RELEASE_EVIDENCE_NOTE_REF}`, "show", "HEAD"], { encoding: "utf8" });
const evidence = parseCanonicalJcs(source.trim());
const inventory = collectReleaseTestInventory();
validateLocalMacProductionReleaseEvidence(evidence, {
  expectedHeadSha: git("rev-parse", "HEAD"),
  expectedTreeSha: git("rev-parse", "HEAD^{tree}"),
  inventory,
});
process.stdout.write(`${canonicalizeJcs({
  evidence_digest: evidence.evidence_digest,
  head_sha: evidence.head_sha,
  note_ref: RELEASE_EVIDENCE_NOTE_REF,
  test_count: evidence.release_suite.test_count,
  valid: true,
})}\n`);
