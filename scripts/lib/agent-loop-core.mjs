const REVIEW_DECISIONS = new Set(["approve", "revise", "block"]);
const BLOCKER_STATUSES = new Set(["blocker", "non-blocker"]);

function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function ensureStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.flatMap((entry, index) => {
    if (entry === null || entry === undefined) {
      return [];
    }

    if (typeof entry !== "string") {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }

    const trimmed = entry.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  });
}

function ensureOptionalNonEmptyString(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  return ensureNonEmptyString(value, label);
}

function ensureOptionalPositiveInteger(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function slugifyLabel(value, fallback) {
  const candidate =
    typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

  return candidate
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function mapCompatibleDecision(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (
    [
      "approve",
      "approved",
      "approved_with_notes",
      "clean",
      "pass",
      "passed",
      "no_findings",
    ].includes(normalized)
  ) {
    return "approve";
  }

  if (
    [
      "revise",
      "revision_required",
      "revisions_required",
      "requires_changes",
      "changes_required",
      "required_changes",
      "needs_changes",
      "needs_revision",
    ].includes(normalized)
  ) {
    return "revise";
  }

  if (["block", "blocked", "blocker"].includes(normalized)) {
    return "block";
  }

  return normalized;
}

function parseCompatibleLocation(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      filePath: null,
      line: null,
    };
  }

  const match = value.trim().match(/^(.*?):(\d+)$/);
  if (!match) {
    return {
      filePath: value.trim(),
      line: null,
    };
  }

  return {
    filePath: match[1]?.trim() || null,
    line: Number(match[2]),
  };
}

function coerceCompatibleIssue(issue, label, fallbackPrefix, fallbackIndex) {
  const normalized = ensureObject(issue, label);
  if (
    typeof normalized.id === "string" &&
    typeof normalized.title === "string" &&
    typeof normalized.details === "string"
  ) {
    return normalized;
  }

  const title =
    normalized.title ??
    normalized.suggestion ??
    normalized.issue ??
    normalized.summary ??
    normalized.description ??
    normalized.file ??
    `${fallbackPrefix} ${fallbackIndex + 1}`;
  const details =
    normalized.details ??
    normalized.issue ??
    normalized.description ??
    normalized.summary ??
    title;
  const category =
      typeof normalized.category === "string" && normalized.category.trim().length > 0
      ? normalized.category.trim().toLowerCase()
      : fallbackPrefix.toLowerCase();
  const location = parseCompatibleLocation(normalized.location);
  const detailsParts = [
    normalized.details,
    normalized.rationale,
    normalized.expected && normalized.current
      ? `Expected "${normalized.expected}" instead of "${normalized.current}".`
      : null,
    normalized.description,
    normalized.summary,
    normalized.issue,
    title,
  ].filter((value) => typeof value === "string" && value.trim().length > 0);
  const id =
    normalized.id ??
    `${category}-${slugifyLabel(title, `${fallbackPrefix}-${fallbackIndex + 1}`)}`;

  return {
    id,
    title,
    details: detailsParts[0] ?? details,
    file_path:
      normalized.file_path ??
      normalized.file ??
      normalized.path ??
      location.filePath,
    line: normalized.line ?? location.line ?? null,
    source_refs:
      normalized.source_refs ?? normalized.sources ?? normalized.references ?? [],
  };
}

function coerceCompatibleIssueArray(value, label, fallbackPrefix) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((issue, index) =>
    coerceCompatibleIssue(issue, `${label}[${index}]`, fallbackPrefix, index),
  );
}

function coerceCompatibleQuestionArray(value, label) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (entry === null || entry === undefined) {
      return [];
    }

    if (typeof entry === "string") {
      const trimmed = entry.trim();
      return trimmed.length > 0 ? [trimmed] : [];
    }

    if (typeof entry === "object" && !Array.isArray(entry)) {
      const question =
        entry.question ??
        entry.title ??
        entry.summary ??
        entry.details ??
        entry.context ??
        null;

      if (typeof question === "string" && question.trim().length > 0) {
        return [question.trim()];
      }
    }

    throw new Error(
      `${label}[${index}] must be a non-empty string or compatible question object.`,
    );
  });
}

function normalizeNarrativeLine(line) {
  return line
    .replace(/^[#>*\-\d.\)\s]+/, "")
    .replace(/[*_`]+/g, "")
    .trim();
}

function coerceNarrativeReview(resultText) {
  if (typeof resultText !== "string" || resultText.trim().length === 0) {
    return null;
  }

  const normalizedText = resultText.toLowerCase();
  let decision = null;

  if (
    normalizedText.includes("approved with no required changes") ||
    (normalizedText.includes("approved") &&
      /required changes\s*\n+\s*none\.?/i.test(resultText))
  ) {
    decision = "approve";
  } else if (
    /(requires_changes|requires changes|required changes|needs revision|needs changes|not ready)/i.test(
      resultText,
    )
  ) {
    decision = "revise";
  } else if (/\bblocked\b|\bblocker\b/i.test(resultText)) {
    decision = "block";
  }

  if (!decision) {
    return null;
  }

  const summary =
    resultText
      .split("\n")
      .map(normalizeNarrativeLine)
      .find(
        (line) =>
          line.length > 0 &&
          !/^ratification decision$/i.test(line) &&
          !/^validation summary$/i.test(line) &&
          !/^required changes$/i.test(line) &&
          !/^recommended changes$/i.test(line) &&
          !/^unresolved questions$/i.test(line) &&
          !/^none\.?$/i.test(line),
      ) ??
    (decision === "approve"
      ? "Approved with no required changes."
      : "Review parsed from narrative Claude output.");

  return {
    decision,
    summary,
    blocker_status: decision === "block" ? "blocker" : "non-blocker",
    required_changes: [],
    recommended_changes: [],
    unresolved_questions: [],
  };
}

function coerceCompatibleReview(review) {
  const normalized = ensureObject(review, "review");
  const narrativeReview =
    normalized.decision === undefined &&
    normalized.status === undefined &&
    normalized.verdict === undefined
      ? coerceNarrativeReview(normalized.result)
      : null;

  if (narrativeReview) {
    return narrativeReview;
  }

  const decision = mapCompatibleDecision(
    normalized.decision ?? normalized.status ?? normalized.verdict ?? null,
  );
  const requiredChanges = coerceCompatibleIssueArray(
    normalized.required_changes,
    "review.required_changes",
    "required",
  );
  const blockerIssues = coerceCompatibleIssueArray(
    normalized.blockers,
    "review.blockers",
    "blocker",
  );
  const directRecommendedChanges = coerceCompatibleIssueArray(
    normalized.recommended_changes,
    "review.recommended_changes",
    "suggestion",
  );
  const optionalSuggestionChanges = coerceCompatibleIssueArray(
    normalized.optional_suggestions,
    "review.optional_suggestions",
    "suggestion",
  );
  const recommendationChanges = coerceCompatibleIssueArray(
    normalized.recommendations,
    "review.recommendations",
    "suggestion",
  );
  const recommendedChanges =
    normalized.recommended_changes !== undefined
      ? directRecommendedChanges
      : normalized.optional_suggestions !== undefined
        ? optionalSuggestionChanges
        : recommendationChanges;
  const hasCompatibleBlocker =
    blockerIssues.length > 0 ||
    (Array.isArray(normalized.required_changes) &&
      normalized.required_changes.some(
        (issue) =>
          issue &&
          typeof issue === "object" &&
          !Array.isArray(issue) &&
          "blocker" in issue &&
          issue.blocker === true,
      )) ||
    (Array.isArray(normalized.blockers) &&
      normalized.blockers.some(
        (issue) =>
          issue &&
          typeof issue === "object" &&
          !Array.isArray(issue) &&
          "blocker" in issue &&
          issue.blocker === true,
      )) ||
    recommendedChanges.some(
      (issue) =>
        issue &&
        typeof issue === "object" &&
        "blocker" in issue &&
        issue.blocker === true,
    );

  return {
    decision: decision ?? normalized.decision,
    summary: normalized.summary,
    blocker_status:
      normalized.blocker_status ??
      (decision === "block" || hasCompatibleBlocker ? "blocker" : "non-blocker"),
    required_changes: [...requiredChanges, ...blockerIssues],
    recommended_changes: recommendedChanges,
    unresolved_questions: coerceCompatibleQuestionArray(
      normalized.unresolved_questions ?? normalized.open_questions ?? [],
      "review.unresolved_questions",
    ),
  };
}

function normalizeIssue(issue, label) {
  const normalized = ensureObject(issue, label);

  return {
    id: ensureNonEmptyString(normalized.id, `${label}.id`),
    title: ensureNonEmptyString(normalized.title, `${label}.title`),
    details: ensureNonEmptyString(normalized.details, `${label}.details`),
    file_path: ensureOptionalNonEmptyString(
      normalized.file_path,
      `${label}.file_path`,
    ),
    line: ensureOptionalPositiveInteger(normalized.line, `${label}.line`),
    source_refs: Array.isArray(normalized.source_refs)
      ? ensureStringArray(normalized.source_refs, `${label}.source_refs`)
      : [],
  };
}

function normalizeIssueArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((issue, index) => normalizeIssue(issue, `${label}[${index}]`));
}

export function normalizeReview(agent, review) {
  const normalized = coerceCompatibleReview(
    ensureObject(review, `${agent} review`),
  );
  const decision = ensureNonEmptyString(
    normalized.decision,
    `${agent} review.decision`,
  ).toLowerCase();
  const blockerStatus = ensureNonEmptyString(
    normalized.blocker_status,
    `${agent} review.blocker_status`,
  ).toLowerCase();

  if (!REVIEW_DECISIONS.has(decision)) {
    throw new Error(`${agent} review.decision must be approve, revise, or block.`);
  }

  if (!BLOCKER_STATUSES.has(blockerStatus)) {
    throw new Error(
      `${agent} review.blocker_status must be blocker or non-blocker.`,
    );
  }

  const requiredChanges = normalizeIssueArray(
    normalized.required_changes,
    `${agent} review.required_changes`,
  );
  const recommendedChanges = normalizeIssueArray(
    normalized.recommended_changes,
    `${agent} review.recommended_changes`,
  );
  const unresolvedQuestions = ensureStringArray(
    normalized.unresolved_questions,
    `${agent} review.unresolved_questions`,
  );

  if (decision === "approve" && blockerStatus === "blocker") {
    throw new Error(`${agent} review cannot be approved while marked as blocker.`);
  }

  if (decision === "approve" && requiredChanges.length > 0) {
    throw new Error(`${agent} review cannot be approved with required changes.`);
  }

  if (decision === "block" && blockerStatus !== "blocker") {
    throw new Error(`${agent} review must be marked as blocker when decision=block.`);
  }

  return {
    agent,
    decision,
    summary: ensureNonEmptyString(normalized.summary, `${agent} review.summary`),
    blocker_status: blockerStatus,
    required_changes: requiredChanges,
    recommended_changes: recommendedChanges,
    unresolved_questions: unresolvedQuestions,
  };
}

export function buildIssueSignature(issue) {
  const normalized = normalizeIssue(issue, "issue");
  const filePath = normalized.file_path?.toLowerCase() ?? "";
  const line = normalized.line === null ? "" : String(normalized.line);

  return [
    normalized.id.toLowerCase(),
    filePath,
    line,
  ].join("::");
}

function collectRequiredIssueSignatures(...reviews) {
  const signatures = new Set();

  for (const review of reviews) {
    if (!review) continue;

    for (const issue of review.required_changes) {
      signatures.add(buildIssueSignature(issue));
    }
  }

  return signatures;
}

export function evaluateLoopRound({
  round,
  maxRounds,
  claudeReview,
  codexReview,
  previousRequiredIssueSignatures,
}) {
  if (!Number.isInteger(round) || round <= 0) {
    throw new Error("round must be a positive integer.");
  }

  if (!Number.isInteger(maxRounds) || maxRounds <= 0) {
    throw new Error("maxRounds must be a positive integer.");
  }

  const priorSignatures =
    previousRequiredIssueSignatures instanceof Set
      ? previousRequiredIssueSignatures
      : new Set();
  const requiredIssueSignatures = collectRequiredIssueSignatures(
    claudeReview,
    codexReview,
  );

  const hasRequiredChanges = requiredIssueSignatures.size > 0;
  const hasBlocker =
    claudeReview?.decision === "block" ||
    codexReview?.decision === "block" ||
    claudeReview?.blocker_status === "blocker" ||
    codexReview?.blocker_status === "blocker";

  if (
    !hasRequiredChanges &&
    claudeReview?.decision === "approve" &&
    codexReview?.decision === "approve"
  ) {
    return {
      status: "approved",
      shouldContinue: false,
      requiredIssueSignatures,
    };
  }

  if (hasBlocker) {
    return {
      status: "blocked",
      shouldContinue: false,
      requiredIssueSignatures,
    };
  }

  const hasOnlyRepeatedIssues =
    hasRequiredChanges &&
    requiredIssueSignatures.size === priorSignatures.size &&
    [...requiredIssueSignatures].every((signature) => priorSignatures.has(signature));

  if (hasOnlyRepeatedIssues) {
    return {
      status: "stalled",
      shouldContinue: false,
      requiredIssueSignatures,
    };
  }

  if (round >= maxRounds) {
    return {
      status: "max_rounds_reached",
      shouldContinue: false,
      requiredIssueSignatures,
    };
  }

  return {
    status: "needs_revision",
    shouldContinue: true,
    requiredIssueSignatures,
  };
}

export function parseStructuredOutput(raw) {
  const text = ensureNonEmptyString(raw, "structured output");
  const extracted = extractJsonValue(text);
  if (extracted) return unwrapStructuredPayload(extracted);

  throw new Error(
    `Unable to parse structured JSON output from agent response. Preview: ${text.slice(0, 200)}`,
  );
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function unwrapStructuredPayload(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.result === "string") {
      const nested = extractJsonValue(value.result);
      if (nested) return nested;
    }

    if (
      value.result &&
      typeof value.result === "object" &&
      !Array.isArray(value.result)
    ) {
      return value.result;
    }
  }

  return value;
}

function extractJsonValue(text) {
  const direct = tryParseJson(text);
  if (direct) return direct;

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fencedMatch?.[1]) {
    const fenced = tryParseJson(fencedMatch[1]);
    if (fenced) return fenced;
  }

  for (const candidate of extractJsonObjectCandidates(text)) {
    const extracted = tryParseJson(candidate);
    if (extracted) return extracted;
  }

  return null;
}

function extractJsonObjectCandidates(text) {
  const candidates = [];
  let startIndex = null;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) {
        startIndex = index;
      }

      depth += 1;
      continue;
    }

    if (character === "}" && depth > 0) {
      depth -= 1;

      if (depth === 0 && startIndex !== null) {
        candidates.push(text.slice(startIndex, index + 1));
        startIndex = null;
      }
    }
  }

  return candidates;
}

export function formatReviewMarkdown(review) {
  const lines = [
    `- Agent: ${review.agent}`,
    `- Decision: ${review.decision}`,
    `- Blocker: ${review.blocker_status}`,
    `- Summary: ${review.summary}`,
  ];

  lines.push("- Required Changes:");
  if (review.required_changes.length === 0) {
    lines.push("  - none");
  } else {
    for (const issue of review.required_changes) {
      const location = issue.file_path
        ? ` (${issue.file_path}${issue.line ? `:${issue.line}` : ""})`
        : "";
      lines.push(`  - ${issue.id}: ${issue.title}${location}`);
    }
  }

  lines.push("- Recommended Changes:");
  if (review.recommended_changes.length === 0) {
    lines.push("  - none");
  } else {
    for (const issue of review.recommended_changes) {
      const location = issue.file_path
        ? ` (${issue.file_path}${issue.line ? `:${issue.line}` : ""})`
        : "";
      lines.push(`  - ${issue.id}: ${issue.title}${location}`);
    }
  }

  if (review.unresolved_questions.length > 0) {
    lines.push("- Unresolved Questions:");
    for (const question of review.unresolved_questions) {
      lines.push(`  - ${question}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function buildPingPongLogMarkdown({
  goal,
  status,
  roundsCompleted,
  maxRounds,
  workpack,
  agentConfig,
  currentArtifactLabel,
  currentArtifactPath,
  currentPlanPath,
  finalSummaryPath,
  entries,
  lastUpdated,
}) {
  const resolvedCurrentArtifactLabel = currentArtifactLabel ?? "current-plan";
  const resolvedCurrentArtifactPath = currentArtifactPath ?? currentPlanPath ?? null;
  const lines = [
    "# Ping-Pong Log",
    "",
    `- Goal: ${goal}`,
    `- Status: ${status}`,
    `- Rounds Completed: ${roundsCompleted}`,
    `- Max Rounds: ${maxRounds}`,
    `- Workpack: ${workpack ?? "project-wide"}`,
    `- Current Artifact: ${formatMarkdownLink(
      resolvedCurrentArtifactLabel,
      resolvedCurrentArtifactPath,
    )}`,
    `- Final Summary: ${formatMarkdownLink("final-summary", finalSummaryPath)}`,
    `- Last Updated: ${lastUpdated}`,
    "",
    "## Agent Config",
    "",
    `- Codex: model=${formatAgentSetting(agentConfig?.codex?.model, agentConfig?.codex?.modelSource)}, effort=${formatAgentSetting(agentConfig?.codex?.effort, agentConfig?.codex?.effortSource)}`,
    `- Claude: model=${formatAgentSetting(agentConfig?.claude?.model, agentConfig?.claude?.modelSource)}, effort=${formatAgentSetting(agentConfig?.claude?.effort, agentConfig?.claude?.effortSource)}`,
    "",
    "## Timeline",
    "",
  ];

  if (!entries || entries.length === 0) {
    lines.push("No ping-pong steps have completed yet.", "");
    return `${lines.join("\n")}\n`;
  }

  for (const entry of entries) {
    lines.push(`### ${entry.heading}`);
    lines.push("");
    lines.push(`- Type: ${entry.kind}`);

    if (entry.agent) {
      lines.push(`- Agent: ${entry.agent}`);
    }

    if (entry.model) {
      lines.push(`- Model: ${formatAgentSetting(entry.model, entry.modelSource)}`);
    }

    if (entry.effort) {
      lines.push(`- Effort: ${formatAgentSetting(entry.effort, entry.effortSource)}`);
    }

    if (entry.timestamp) {
      lines.push(`- Timestamp: ${entry.timestamp}`);
    }

    if (Number.isInteger(entry.round)) {
      lines.push(`- Round: ${entry.round}`);
    }

    if (entry.promptPath) {
      lines.push(`- Prompt: ${formatMarkdownLink("prompt", entry.promptPath)}`);
    }

    if (entry.artifactPath) {
      lines.push(`- Artifact: ${formatMarkdownLink("artifact", entry.artifactPath)}`);
    }

    if (entry.rawOutputPath) {
      lines.push(
        `- Raw Output: ${formatMarkdownLink("raw-output", entry.rawOutputPath)}`,
      );
    }

    if (entry.title) {
      lines.push(`- Title: ${entry.title}`);
    }

    if (entry.summary) {
      lines.push(`- Summary: ${entry.summary}`);
    }

    if (entry.decision) {
      lines.push(`- Decision: ${entry.decision}`);
    }

    if (entry.blockerStatus) {
      lines.push(`- Blocker: ${entry.blockerStatus}`);
    }

    if (Number.isInteger(entry.requiredChangeCount)) {
      lines.push(`- Required Changes: ${entry.requiredChangeCount}`);
    }

    if (entry.requiredChangeTitles) {
      lines.push(`- Required Change Titles: ${entry.requiredChangeTitles}`);
    }

    if (Number.isInteger(entry.recommendedChangeCount)) {
      lines.push(`- Recommended Changes: ${entry.recommendedChangeCount}`);
    }

    if (entry.recommendedChangeTitles) {
      lines.push(
        `- Recommended Change Titles: ${entry.recommendedChangeTitles}`,
      );
    }

    if (Number.isInteger(entry.openQuestionCount)) {
      lines.push(`- Open Questions: ${entry.openQuestionCount}`);
    }

    if (entry.basedOn) {
      lines.push(`- Based On: ${entry.basedOn}`);
    }

    if (entry.roundStatus) {
      lines.push(`- Round Status: ${entry.roundStatus}`);
    }

    if (entry.verificationStatus) {
      lines.push(`- Verification Status: ${entry.verificationStatus}`);
    }

    if (entry.filesChanged) {
      lines.push(`- Files Changed: ${entry.filesChanged}`);
    }

    if (entry.testsRun) {
      lines.push(`- Tests Run: ${entry.testsRun}`);
    }

    if (entry.command) {
      lines.push(`- Command: ${entry.command}`);
    }

    if (typeof entry.exitCode === "number") {
      lines.push(`- Exit Code: ${entry.exitCode}`);
    }

    if (typeof entry.shouldContinue === "boolean") {
      lines.push(`- Continue Loop: ${entry.shouldContinue ? "yes" : "no"}`);
    }

    if (Number.isInteger(entry.requiredIssueCount)) {
      lines.push(`- Required Issue Count: ${entry.requiredIssueCount}`);
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function formatMarkdownLink(label, target) {
  if (!target) return "pending";
  return `[${label}](${target})`;
}

export function formatAgentSetting(value, source) {
  const label =
    value && String(value).trim().length > 0 ? String(value).trim() : null;

  if (label) {
    return source && source !== label ? `${label} (${source})` : label;
  }

  if (source === "pending" || source === "default") {
    return source;
  }

  if (source) {
    return `unresolved (${source})`;
  }

  return "default";
}

export function parseCodexInvocationMetadata(stderr) {
  const text = typeof stderr === "string" ? stderr : "";
  const model = text.match(/^\s*model\s*:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const effort =
    text.match(/^\s*reasoning effort\s*:\s*(.+)$/im)?.[1]?.trim() ?? null;

  return {
    model,
    effort,
  };
}

export function parseClaudeInvocationMetadata(stdout) {
  const parsed = tryParseJson(typeof stdout === "string" ? stdout : "");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      model: null,
    };
  }

  const modelUsage =
    parsed.modelUsage &&
    typeof parsed.modelUsage === "object" &&
    !Array.isArray(parsed.modelUsage)
      ? parsed.modelUsage
      : null;
  const model = modelUsage ? Object.keys(modelUsage)[0] ?? null : null;

  return {
    model,
  };
}
