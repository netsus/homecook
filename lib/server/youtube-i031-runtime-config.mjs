import path from "node:path";

export const YOUTUBE_I031_CODEX_CLI_VERSION = "0.144.0-alpha.4";

export function resolveYoutubeI031CodexBin(projectRoot) {
  return path.resolve(projectRoot, ".youtube-i031-tools", "bin", "codex");
}

export function resolveYoutubeI031InstalledCodexBin(projectRoot) {
  return path.resolve(
    projectRoot,
    ".youtube-i031-tools",
    "node_modules",
    ".pnpm",
    `@openai+codex@${YOUTUBE_I031_CODEX_CLI_VERSION}-darwin-arm64`,
    "node_modules",
    "@openai",
    "codex",
    "vendor",
    "aarch64-apple-darwin",
    "bin",
    "codex",
  );
}
