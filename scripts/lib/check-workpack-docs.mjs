export function resolveSliceFromBranch(branchName) {
  const match = /^feature\/(be|fe)-(.+)$/.exec(branchName);
  return match ? match[2] : null;
}

export function resolveBaseRef(env, spawnSyncFn) {
  const base = env.BASE_REF ?? env.GITHUB_BASE_REF;
  if (base) return base;

  const result = spawnSyncFn("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], {
    encoding: "utf8",
  });
  if (result.status === 0) {
    return result.stdout.trim().replace(/^origin\//, "");
  }

  return null;
}

export function checkWorkpackDocs({ slice, baseRef, spawnSyncFn }) {
  const paths = [
    `docs/workpacks/${slice}/README.md`,
    `docs/workpacks/${slice}/acceptance.md`,
  ];
  return paths.filter((p) => {
    const r = spawnSyncFn("git", ["show", `origin/${baseRef}:${p}`], { stdio: "ignore" });
    return r.status !== 0;
  });
}
