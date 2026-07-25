export function buildPreparedFoodSearchIndexReleasePlan({ mode }) {
  if (mode === "isolated-test") {
    return {
      mode,
      requiresMergedOriginMaster: false,
      requiresCleanTrackedTree: false,
      requiresIsolatedSentinel: true,
      allowsLocalDatabase: true,
      requiresTls: false,
    };
  }

  if (mode === "post-merge-release") {
    return {
      mode,
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
      requiresIsolatedSentinel: false,
      allowsLocalDatabase: false,
      requiresTls: true,
    };
  }

  throw new Error(
    `unsupported prepared food search index release mode: ${mode ?? "missing"}`,
  );
}

export function assertMergedExactSource({
  head,
  originMaster,
  trackedStatus,
}) {
  if (head !== originMaster) {
    throw new Error(
      "post-merge release requires HEAD to equal origin/master",
    );
  }
  if (trackedStatus !== "") {
    throw new Error("post-merge release requires a clean tracked tree");
  }
  return head;
}
