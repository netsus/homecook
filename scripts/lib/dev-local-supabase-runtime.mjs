import path from "node:path";

export function buildLocalSupabaseNextDevArgs(nextArgs = []) {
  return ["exec", "next", "dev", "--turbopack", ...nextArgs];
}

export function getLocalSupabaseNextArtifactsToReset(cwd) {
  return [path.join(cwd, ".next")];
}
