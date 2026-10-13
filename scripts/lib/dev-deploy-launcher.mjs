import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "// homecook-dev-deploy-launcher";

export const DEV_DEPLOY_SNAPSHOT_PATHS = Object.freeze([
  "scripts", "infra", ".env.example", "package.json", "supabase/config.toml",
  // Static data imported by the deployment tool's worker artifact validator.
  "lib/server/youtube-extraction-worker-timing.json",
]);

export function verifyDevDeployToolLoad({ entryPoint, repository, nodePath }) {
  if (![entryPoint, repository, nodePath].every(isAbsolute)) throw new Error("Tool load paths must be absolute");
  const result = spawnSync(nodePath, ["--", entryPoint, "--help"], {
    cwd: repository, env: { ...process.env, HOMECOOK_DEPLOY_REPOSITORY: repository },
    timeout: 5000, maxBuffer: 32768, stdio: ["ignore", "ignore", "pipe"],
  });
  if (result.status !== 0) throw new Error("Deployment snapshot could not load");
}

export function installDevDeployLauncher({ binDirectory, entryPoint, repository, nodePath }) {
  if (![binDirectory, entryPoint, repository, nodePath].every(isAbsolute)) throw new Error("Launcher paths must be absolute");
  mkdirSync(binDirectory, { recursive: true, mode: 0o700 });
  const directory = lstatSync(binDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Launcher directory must be a real directory");
  const target = join(binDirectory, "homecook-deploy");
  let existing;
  try { existing = lstatSync(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || !readFileSync(target, "utf8").startsWith(`#!/usr/bin/env node\n${MARKER}\n`))) {
    throw new Error("Refusing to replace an unrelated homecook-deploy command");
  }
  const script = `#!/usr/bin/env node\n${MARKER}\nconst { spawn } = require("node:child_process");\nconst child = spawn(${JSON.stringify(nodePath)}, [${JSON.stringify(entryPoint)}, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, HOMECOOK_DEPLOY_REPOSITORY: ${JSON.stringify(repository)} } });\nfor (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));\nchild.on("error", () => { process.stderr.write("배포 도구를 시작하지 못했습니다. 다시 설치해 주세요.\\n"); process.exitCode = 1; });\nchild.on("exit", (code) => { process.exitCode = code ?? 1; });\n`;
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, script, { mode: 0o700, flag: "wx" });
  chmodSync(temporary, 0o700);
  renameSync(temporary, target);
  return target;
}
