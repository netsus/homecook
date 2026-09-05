#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installDevDeployLauncher } from "./lib/dev-deploy-launcher.mjs";

const repository = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args[0] === "--help") {
  process.stdout.write("pnpm deploy:dev:install [--ref <committed tool version>]\nInstalls homecook-deploy into ~/.local/bin without changing your working checkout.\n");
} else {
  try {
    if (args.length && (args.length !== 2 || args[0] !== "--ref")) throw new Error("Unknown install arguments");
    if (!/^(?:https:\/\/github\.com\/netsus\/homecook(?:\.git)?|git@github\.com:netsus\/homecook(?:\.git)?)$/u.test(git("remote", "get-url", "origin"))) throw new Error("Expected netsus/homecook repository");
    const ref = git("rev-parse", "--verify", "--end-of-options", `${args[1] ?? "HEAD"}^{commit}`);
    const paths = ["scripts", "infra", ".env.example", "package.json", "supabase/config.toml"];
    const tree = git("ls-tree", "-r", ref, "--", ...paths);
    if (tree.split("\n").some((line) => line.startsWith("120000 ") || line.startsWith("160000 "))) throw new Error("Tool snapshot cannot contain symlinks or submodules");
    git("cat-file", "-e", `${ref}:scripts/deploy-prelaunch-web.mjs`);
    const archive = execFileSync("git", ["-C", repository, "archive", "--format=tar", ref, ...paths], { maxBuffer: 128 * 1024 * 1024 });
    const root = join(homedir(), ".homecook/prelaunch-web/tools");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
    const snapshot = mkdtempSync(join(root, `${ref.slice(0, 12)}-`));
    execFileSync("/usr/bin/tar", ["-xf", "-", "-C", snapshot], { input: archive });
    const entryPoint = join(snapshot, "scripts/deploy-prelaunch-web.mjs");
    const common = resolve(repository, git("rev-parse", "--git-common-dir"));
    const originalRepository = dirname(common);
    const command = installDevDeployLauncher({ binDirectory: join(homedir(), ".local/bin"), entryPoint, repository: originalRepository, nodePath: realpathSync(process.execPath) });
    writeFileSync(join(snapshot, "installation.json"), JSON.stringify({ ref, repository: originalRepository, command }), { mode: 0o600 });
    process.stdout.write(`설치 완료: ${command}\n버전: ${ref}\n어느 폴더에서든 homecook-deploy status / plan / deploy를 사용할 수 있습니다.\n`);
  } catch {
    process.stderr.write("배포 명령 설치 실패: 저장소·커밋·기존 명령을 확인하세요. 기존 작업 파일은 변경하지 않았습니다.\n");
    process.exitCode = 1;
  }
}
