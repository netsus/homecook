import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { installDevDeployLauncher } from "../scripts/lib/dev-deploy-launcher.mjs";

it("runs the installed tool from another directory without changing that checkout", () => {
  const root = mkdtempSync(join(tmpdir(), "hc-launcher-"));
  const binDirectory = join(root, "bin");
  const entryPoint = join(root, "tool.mjs");
  const repository = join(root, "repository with spaces");
  const elsewhere = join(root, "elsewhere");
  mkdirSync(repository); mkdirSync(elsewhere);
  writeFileSync(entryPoint, 'console.log(JSON.stringify({args:process.argv.slice(2),repo:process.env.HOMECOOK_DEPLOY_REPOSITORY}));');
  const path = installDevDeployLauncher({ binDirectory, entryPoint, repository, nodePath: process.execPath });
  const run = spawnSync(process.execPath, [path, "plan", "--ref", "HEAD"], { cwd: elsewhere, encoding: "utf8" });
  expect(run.status).toBe(0);
  expect(JSON.parse(run.stdout)).toEqual({ args: ["plan", "--ref", "HEAD"], repo: repository });
  expect(lstatSync(path).mode & 0o777).toBe(0o700);
});

it("refuses to replace an unrelated existing command", () => {
  const root = mkdtempSync(join(tmpdir(), "hc-launcher-"));
  const path = join(root, "homecook-deploy");
  writeFileSync(path, "user owned command");
  expect(() => installDevDeployLauncher({ binDirectory: root, entryPoint: "/tool", repository: "/repo", nodePath: process.execPath })).toThrow();
  expect(readFileSync(path, "utf8")).toBe("user owned command");
});
