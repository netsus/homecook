export function resolveSliceFromBranch(branchName) {
  const match = /^feature\/(be|fe)-(.+)$/.exec(branchName);
  return match ? match[2] : null;
}

export function resolveWorkpackSlice({ slice, baseRef, spawnSyncFn }) {
  const statusResult = spawnSyncFn(
    "git",
    ["show", "HEAD:.workflow-v2/status.json"],
    { encoding: "utf8" },
  );
  if (statusResult.status === 0) {
    try {
      const status = JSON.parse(statusResult.stdout);
      const expectedBranches = new Set([
        `feature/be-${slice}`,
        `feature/fe-${slice}`,
      ]);
      const mappedItems = Array.isArray(status.items)
        ? status.items.filter(
            (item) =>
              typeof item?.id === "string"
              && expectedBranches.has(item.branch),
          )
        : [];
      if (mappedItems.length === 1) {
        return mappedItems[0].id;
      }
    } catch {
      // Fall through to the established direct/retrofit resolution.
    }
  }

  if (!/^\d{2}-retrofit$/.test(slice)) {
    return slice;
  }

  const slicePrefix = slice.split("-")[0];
  const result = spawnSyncFn(
    "git",
    ["ls-tree", "-r", "--name-only", `origin/${baseRef}`, "docs/workpacks"],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    return slice;
  }

  const workpackDirs = Array.from(
    new Set(
      result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^docs\/workpacks\/[^/]+\/README\.md$/.test(line))
        .map((line) => line.split("/")[2]),
    ),
  ).filter((dir) => dir.startsWith(`${slicePrefix}-`));

  return workpackDirs.length === 1 ? workpackDirs[0] : slice;
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
  const workpackSlice = resolveWorkpackSlice({ slice, baseRef, spawnSyncFn });
  const paths = [
    `docs/workpacks/${workpackSlice}/README.md`,
    `docs/workpacks/${workpackSlice}/acceptance.md`,
  ];
  return paths.filter((p) => {
    const r = spawnSyncFn("git", ["show", `origin/${baseRef}:${p}`], { stdio: "ignore" });
    return r.status !== 0;
  });
}
