import { existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function hasLinkedProject(root, requireEnvironment) {
  return existsSync(path.join(root, "supabase/.temp/project-ref"))
    && (!requireEnvironment || existsSync(path.join(root, ".env.local")));
}

function explicitLinkedRoot(argv, environment) {
  const linkedRootIndex = argv.indexOf("--linked-root");
  if (linkedRootIndex >= 0) {
    const value = argv[linkedRootIndex + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--linked-root requires a repository path");
    }
    return value;
  }
  return environment.SECURITY_FUNCTION_LINKED_ROOT ?? null;
}

function mainWorktree(cwd) {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return result.stdout.match(/^worktree (.+)$/mu)?.[1] ?? null;
}

export function resolveSecurityFunctionLinkedRoot({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  environment = process.env,
  requireEnvironment = false,
} = {}) {
  const explicit = explicitLinkedRoot(argv, environment);
  if (explicit) {
    const resolved = path.resolve(cwd, explicit);
    if (!hasLinkedProject(resolved, requireEnvironment)) {
      throw new Error(`linked Supabase root is incomplete: ${resolved}`);
    }
    return realpathSync(resolved);
  }

  if (hasLinkedProject(cwd, requireEnvironment)) return realpathSync(cwd);

  const primary = mainWorktree(cwd);
  if (primary && hasLinkedProject(primary, requireEnvironment)) return realpathSync(primary);

  const requiredFiles = requireEnvironment
    ? "supabase/.temp/project-ref and .env.local"
    : "supabase/.temp/project-ref";
  throw new Error(
    `linked Supabase root was not found; pass --linked-root or SECURITY_FUNCTION_LINKED_ROOT with ${requiredFiles}`,
  );
}
