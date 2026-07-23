export function assertExpectedAdditiveDeploymentState(
  environment,
  slice,
  expectedState,
  actualState,
) {
  if (environment !== "remote") return;
  if (actualState !== expectedState) {
    throw new Error(
      `remote additive deployment state drift for ${slice}: `
      + `expected ${expectedState}, observed ${actualState}`,
    );
  }
}

export function classifyAdditiveDeploymentState(
  additiveContract,
  currentRows,
) {
  const deploymentMarkers = additiveContract.filter(
    (entry) => entry.replaces_baseline !== true,
  );
  if (deploymentMarkers.length === 0) {
    throw new Error(
      "additive function contract requires at least one new deployment marker",
    );
  }

  const currentSignatures = new Set(
    currentRows.map((row) =>
      typeof row === "string" ? row : row.signature,
    ),
  );
  const presentMarkers = deploymentMarkers.filter((entry) =>
    currentSignatures.has(entry.signature),
  );
  if (presentMarkers.length === 0) return "pre-deployment";

  const missing = additiveContract
    .filter((entry) => !currentSignatures.has(entry.signature))
    .map((entry) => entry.signature);
  if (missing.length > 0) {
    throw new Error(
      `partially deployed additive function contract: ${missing.join(", ")}`,
    );
  }

  return "post-migration";
}

export function assertHistoricalReplacementIdentity(
  signature,
  expectedObservation,
  currentRow,
) {
  const identityFields = [
    ["owner", "owner"],
    ["extension", "extension_name"],
    ["result type", "result_type"],
    ["volatility", "provolatile"],
  ];

  for (const [label, currentField] of identityFields) {
    const expectedField = currentField === "provolatile"
      ? "volatility"
      : currentField;
    if (currentRow?.[currentField] !== expectedObservation?.[expectedField]) {
      throw new Error(
        `deployed baseline replacement ${label} drift for ${signature}`,
      );
    }
  }
}
