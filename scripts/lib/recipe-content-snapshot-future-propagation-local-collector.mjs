import {
  assertRecipeContentSnapshotFuturePropagationReleaseMatrix,
  assertRecipeContentSnapshotFuturePropagationTwoOwnerResult,
} from "./recipe-content-snapshot-future-propagation-local-rehearsal-verifier.mjs";

function requireAdapterMethod(adapter, name) {
  const method = adapter?.[name];
  if (typeof method !== "function") {
    throw new Error(`local collector adapter requires ${name}()`);
  }
  return method.bind(adapter);
}

function requirePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("local collector requires an isolated resource plan");
  }
  if (
    typeof plan.current_head_sha !== "string"
    || typeof plan.immediate_previous_sha !== "string"
    || plan.current_head_sha === plan.immediate_previous_sha
    || plan.external_writes !== 0
  ) {
    throw new Error("local collector plan must lock distinct exact SHAs and zero external writes");
  }
  return plan;
}

export async function runRecipeContentSnapshotFuturePropagationLocalCollector({
  adapter,
  plan: rawPlan,
  reportPath,
}) {
  const plan = requirePlan(rawPlan);
  if (typeof reportPath !== "string" || !reportPath.startsWith("/")) {
    throw new Error("local collector requires an absolute report path");
  }
  const prepare = requireAdapterMethod(adapter, "prepare");
  const collectRelease = requireAdapterMethod(adapter, "collectRelease");
  const collectTwoOwner = requireAdapterMethod(adapter, "collectTwoOwner");
  const writeReport = requireAdapterMethod(adapter, "writeReport");
  const cleanup = requireAdapterMethod(adapter, "cleanup");

  let cleanupAttempted = false;
  let prepareAttempted = false;
  let runtime = null;
  try {
    prepareAttempted = true;
    runtime = await prepare({ plan });
    const immediatePreviousRelease = await collectRelease({
      plan,
      releaseSha: plan.immediate_previous_sha,
      releaseSlot: "immediate_previous",
      runtime,
    });
    const currentRelease = await collectRelease({
      plan,
      releaseSha: plan.current_head_sha,
      releaseSlot: "current",
      runtime,
    });
    const twoOwnerResult =
      assertRecipeContentSnapshotFuturePropagationTwoOwnerResult(
        await collectTwoOwner({
          plan,
          releaseSha: plan.current_head_sha,
          runtime,
        }),
      );

    cleanupAttempted = true;
    await cleanup({ plan, runtime });

    const releaseMatrix =
      assertRecipeContentSnapshotFuturePropagationReleaseMatrix({
        current_head_sha: plan.current_head_sha,
        immediate_previous_sha: plan.immediate_previous_sha,
        current_release: currentRelease,
        immediate_previous_release: immediatePreviousRelease,
        external_writes: 0,
        local_fixture_mutation: "isolated-and-cleaned",
      });
    const report = {
      two_owner_result: twoOwnerResult,
      release_matrix: releaseMatrix,
    };
    await writeReport({ report, reportPath });
    return report;
  } finally {
    if (prepareAttempted && !cleanupAttempted) {
      await cleanup({ plan, runtime });
    }
  }
}
