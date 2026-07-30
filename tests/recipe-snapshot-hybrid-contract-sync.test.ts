import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sliceId = "recipe-snapshot-authority-foundation";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

describe("recipe snapshot hybrid contract lock", () => {
  const readmePath = `docs/workpacks/${sliceId}/README.md`;
  const acceptancePath = `docs/workpacks/${sliceId}/acceptance.md`;
  const automationPath = `docs/workpacks/${sliceId}/automation-spec.json`;
  const workItemPath = `.workflow-v2/work-items/${sliceId}.json`;

  it("uses only the current official document tuple", () => {
    const bundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
    ].join("\n");

    expect(bundle).toContain("요구사항기준선-v1.7.26.md");
    expect(bundle).toContain("화면정의서-v1.5.30.md");
    expect(bundle).toContain("유저flow맵-v1.3.28.md");
    expect(bundle).toContain("db설계-v1.3.27.md");
    expect(bundle).toContain("api문서-v1.2.30.md");
    expect(bundle).not.toMatch(/v1\.7\.25|v1\.5\.29|v1\.3\.26|v1\.2\.29/);
  });

  it("locks hybrid Auth and local Data verification instead of the retired local-first verifier", () => {
    const automation = read(automationPath);
    const workItem = read(workItemPath);
    const status = read(".workflow-v2/status.json");
    const bundle = [automation, workItem, status].join("\n");

    expect(bundle).not.toContain("verify-recipe-snapshot-authority-local-first.mjs");
    expect(bundle).toContain("verify-recipe-snapshot-authority-hybrid.mjs");
    expect(bundle).toContain("remote Auth");
    expect(bundle).toContain("local application DB");
    expect(bundle).toContain("local auth.users=0");
    expect(bundle).toContain("exact epoch");
    expect(read(readmePath)).toContain("historical merged SHA");
    expect(read(automationPath)).toContain("origin/master ancestor");
  });

  it("records the merged regression evidence while keeping full verification pending", () => {
    const readme = read(readmePath);
    const workItem = readJson(workItemPath);
    const statusFile = readJson(".workflow-v2/status.json");
    const statusItems = statusFile.items as Array<Record<string, unknown>>;
    const statusItem = statusItems.find((item) => item.id === sliceId);
    const roadmap = read("docs/workpacks/README.md");
    const evidenceBundle = [
      readme,
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
      read(".workflow-v2/status.json"),
    ].join("\n");

    expect(readme).toContain("PR #1218");
    expect(readme).toContain("PR #1219");
    expect(readme).toContain("PR #1220");
    expect(readme).toContain("PR #1232 merged");
    expect(evidenceBundle).toContain("PR #1233");
    expect(evidenceBundle).toContain(
      "4a7718ee6bac66fb39b5163742783ac2092e5b5c",
    );
    expect(evidenceBundle).toContain(
      "d9468881b7ae77f5b9b333e6f2a82452eb9dd60e",
    );
    expect(evidenceBundle).toContain(
      "da054a96afb7c6108a7007bfafbf3d328ef47656",
    );
    expect(evidenceBundle).toContain("PR #1251");
    expect(evidenceBundle).toContain(
      "75d09a37f6341772c77e27a12a59730b7ef7914e",
    );
    expect(evidenceBundle).toContain(
      "94ae1a2077d63974c73a506add7b6647bf69d6d0",
    );
    expect(evidenceBundle).toContain(
      "29115dee2830f657a594ab68a8a6a3efe107dec9",
    );
    expect(evidenceBundle).toContain("historical dry-run passed");
    expect(evidenceBundle).toContain("14 success and 10 intended skips");
    expect(evidenceBundle).toContain("clean master dry-run passed");
    expect(evidenceBundle).toContain(
      "full local/remote evidence remains pending",
    );
    expect(readme).toContain("hybrid delta/reverification");
    expect((workItem.status as Record<string, unknown>)).toMatchObject({
      lifecycle: "in_progress",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
    expect(statusItem).toMatchObject({
      branch: "docs/recipe-snapshot-historical-dry-run-evidence",
      pr_path: "https://github.com/netsus/homecook/pull/1253",
      lifecycle: "in_progress",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
    expect(roadmap).toMatch(
      /\|\s*4\s*\|\s*B\s*\|\s*`recipe-snapshot-authority-foundation`\s*\|\s*in-progress\s*\|/,
    );
    expect(read(acceptancePath)).toContain(
      "- [ ] merged-exact-SHA hybrid verifier reads the local application DB/Storage authority",
    );
  });

  it("requires snapshot cleanup to run inside the hybrid exact-epoch deletion saga", () => {
    const acceptance = read(acceptancePath);

    expect(acceptance).toContain("session-authority gateway");
    expect(acceptance).toContain("active epoch");
    expect(acceptance).toContain("session-liveness HMAC binding");
    expect(acceptance).toContain("local owner fence/cleanup");
    expect(acceptance).toContain("remote exact-epoch delete");
    expect(acceptance).toContain("terminal readback");
    expect(acceptance).toContain("mirror terminal");
  });

  it("locks the hybrid exact-epoch cleanup regression into required automation", () => {
    const automation = read(automationPath);

    expect(automation).toContain(
      "tests/recipe-snapshot-hybrid-account-cleanup-postgres.integration.test.ts",
    );
  });

  it("bounds PostgreSQL subprocesses and fails closed when teardown cannot stop the server", () => {
    const runner = read(
      "scripts/run-recipe-snapshot-hybrid-account-cleanup-postgres-integration.mjs",
    );

    expect(runner).toContain("COMMAND_TIMEOUT_MS");
    expect(runner).toContain("timeout: COMMAND_TIMEOUT_MS");
    expect(runner).toContain("POSTGRES_STOP_FAILED");
  });
});
