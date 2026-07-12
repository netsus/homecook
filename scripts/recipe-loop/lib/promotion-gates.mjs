function finite(value) {
  return Number.isFinite(Number(value));
}

function meetsMinimum(actual, minimum) {
  return finite(actual) && Number(actual) >= Number(minimum);
}

function meetsMaximum(actual, maximum) {
  return finite(actual) && Number(actual) <= Number(maximum);
}

function belowExclusiveMaximum(actual, maximum) {
  return finite(actual) && Number(actual) < Number(maximum);
}

export function evaluatePromotionGates({
  gates = {},
  deterministic = {},
  semantic = {},
  timing = {},
  modelCallCounts = [],
  expectedCount = null,
  longVideoSceneScanImprovement = null,
}) {
  const failures = [];
  const checks = {};
  const failUnless = (name, condition) => {
    checks[name] = Boolean(condition);
    if (!condition) failures.push(name);
  };

  if (gates.deterministic) {
    failUnless("deterministic.execution", deterministic.success === true);
    for (const [metric, minimum] of Object.entries(gates.deterministic)) {
      failUnless(`deterministic.${metric}`, meetsMinimum(deterministic[metric], minimum));
    }
  }

  if (gates.semantic) {
    failUnless("semantic.execution", semantic.success === true);
    for (const [metric, minimum] of Object.entries(gates.semantic)) {
      failUnless(`semantic.${metric}`, meetsMinimum(semantic[metric], minimum));
    }
  }

  if (gates.timing) {
    failUnless("timing.runType", timing.runType === gates.timing.runType);
    failUnless(
      "timing.sampleCount",
      Number.isInteger(timing.sampleCount)
        && timing.sampleCount > 0
        && (!Number.isInteger(expectedCount) || timing.sampleCount === expectedCount),
    );
    if (gates.timing.p50MaxSeconds !== undefined) {
      failUnless("timing.p50MaxSeconds", meetsMaximum(timing.p50, gates.timing.p50MaxSeconds));
    }
    if (gates.timing.p95MaxSeconds !== undefined) {
      failUnless("timing.p95MaxSeconds", meetsMaximum(timing.p95, gates.timing.p95MaxSeconds));
    }
    if (gates.timing.p95ExclusiveMaxSeconds !== undefined) {
      failUnless(
        "timing.p95ExclusiveMaxSeconds",
        belowExclusiveMaximum(timing.p95, gates.timing.p95ExclusiveMaxSeconds),
      );
    }
  }

  if (gates.modelCallCountMax !== undefined) {
    failUnless(
      "modelCallCountMax",
      Array.isArray(modelCallCounts)
        && modelCallCounts.length > 0
        && (!Number.isInteger(expectedCount) || modelCallCounts.length === expectedCount)
        && modelCallCounts.every((count) => Number.isInteger(count) && count <= gates.modelCallCountMax),
    );
  }

  if (gates.longVideoSceneScanImprovementMin !== undefined) {
    failUnless(
      "longVideoSceneScanImprovementMin",
      meetsMinimum(longVideoSceneScanImprovement, gates.longVideoSceneScanImprovementMin),
    );
  }

  return { success: failures.length === 0, checks, failures };
}
