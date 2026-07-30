import {
  chmod,
  copyFile,
  link,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import {
  resolveYoutubeI031CodexBin,
  resolveYoutubeI031InstalledCodexBin,
  YOUTUBE_I031_CODEX_CLI_VERSION,
} from "../lib/server/youtube-i031-runtime-config.mjs";

const projectRoot = process.cwd();
const toolRoot = path.join(projectRoot, ".youtube-i031-tools");
const packageJsonPath = path.join(toolRoot, "package.json");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`command exited with ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const pnpmScript = process.env.npm_execpath;
  if (!pnpmScript) {
    throw new Error("이 설정 명령은 pnpm으로 실행해야 합니다.");
  }
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("YouTube i031 runtime은 Apple Silicon macOS에서만 지원합니다.");
  }

  await mkdir(toolRoot, { recursive: true });
  await writeFile(packageJsonPath, `${JSON.stringify({
    name: "homecook-youtube-i031-tools",
    private: true,
    dependencies: {
      "@openai/codex": YOUTUBE_I031_CODEX_CLI_VERSION,
    },
  }, null, 2)}\n`, "utf8");

  await run(pnpmScript, [
    "--dir",
    toolRoot,
    "install",
    "--ignore-workspace",
    "--frozen-lockfile=false",
  ]);

  const installedCodexBin = resolveYoutubeI031InstalledCodexBin(projectRoot);
  const codexBin = resolveYoutubeI031CodexBin(projectRoot);
  await mkdir(path.dirname(codexBin), { recursive: true });
  await rm(codexBin, { force: true });
  try {
    await link(installedCodexBin, codexBin);
  } catch {
    await copyFile(installedCodexBin, codexBin);
  }
  await chmod(codexBin, 0o755);
  await run(codexBin, ["--version"]);
  process.stdout.write("YouTube i031 Codex CLI 설치를 확인했습니다.\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
