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
  });

  it("preserves the implemented history while keeping the reopened lifecycle honest", () => {
    const readme = read(readmePath);
    const workItem = readJson(workItemPath);
    const statusFile = readJson(".workflow-v2/status.json");
    const statusItems = statusFile.items as Array<Record<string, unknown>>;
    const statusItem = statusItems.find((item) => item.id === sliceId);
    const roadmap = read("docs/workpacks/README.md");

    expect(readme).toContain("PR #1218");
    expect(readme).toContain("PR #1219");
    expect(readme).toContain("PR #1220");
    expect(readme).toContain("hybrid delta/reverification");
    expect((workItem.status as Record<string, unknown>).lifecycle).toBe("planned");
    expect(statusItem?.lifecycle).toBe("planned");
    expect(roadmap).toMatch(
      /\|\s*4\s*\|\s*B\s*\|\s*`recipe-snapshot-authority-foundation`\s*\|\s*docs\s*\|/,
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
});
