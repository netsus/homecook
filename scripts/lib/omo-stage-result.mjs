import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  return value.map((entry, index) =>
    ensureNonEmptyString(entry, `${label}[${index}]`),
  );
}

function ensureOptionalStringArray(value, label) {
  if (value === null || value === undefined) {
    return [];
  }

  return ensureStringArray(value, label);
}

function ensureEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}. Got: ${JSON.stringify(value)}`);
  }
  return value;
}

function ensureOptionalEnum(value, allowed, label) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return ensureEnum(value, allowed, label);
}

function ensureOptionalNonNegativeInteger(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return value;
}

function validateFinding(finding, index) {
  const label = `stageResult.findings[${index}]`;
  const f = ensureObject(finding, label);
  return {
    file: ensureNonEmptyString(f.file, `${label}.file`),
    line_hint:
      typeof f.line_hint === "number" && Number.isInteger(f.line_hint) ? f.line_hint : null,
    severity: ensureEnum(f.severity, ["critical", "major", "minor"], `${label}.severity`),
    category: ensureNonEmptyString(f.category, `${label}.category`),
    issue: ensureNonEmptyString(f.issue, `${label}.issue`),
    suggestion: ensureNonEmptyString(f.suggestion, `${label}.suggestion`),
  };
}

function validateOptionalFindings(value) {
  if (!Array.isArray(value) || value.length === 0) return [];
  return value.map((f, i) => validateFinding(f, i));
}

function validateClaimedScope(scope, { strict = false } = {}) {
  if ((scope === null || scope === undefined) && !strict) {
    return {
      files: [],
      endpoints: [],
      routes: [],
      states: [],
      invariants: [],
    };
  }

  const normalizedScope = ensureObject(scope, "stageResult.claimed_scope");
  return {
    files: ensureStringArray(normalizedScope.files ?? [], "stageResult.claimed_scope.files"),
    endpoints: ensureStringArray(normalizedScope.endpoints ?? [], "stageResult.claimed_scope.endpoints"),
    routes: ensureStringArray(normalizedScope.routes ?? [], "stageResult.claimed_scope.routes"),
    states: ensureStringArray(normalizedScope.states ?? [], "stageResult.claimed_scope.states"),
    invariants: ensureStringArray(normalizedScope.invariants ?? [], "stageResult.claimed_scope.invariants"),
  };
}

function validateChecklistUpdates(value, { strict = false } = {}) {
  if ((value === null || value === undefined) && !strict) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("stageResult.checklist_updates must be an array.");
  }

  return value.map((entry, index) => {
    const normalizedEntry = ensureObject(entry, `stageResult.checklist_updates[${index}]`);
    return {
      id: ensureNonEmptyString(normalizedEntry.id, `stageResult.checklist_updates[${index}].id`),
      status: ensureEnum(
        normalizedEntry.status,
        ["checked", "unchecked"],
        `stageResult.checklist_updates[${index}].status`,
      ),
      evidence_refs: ensureOptionalStringArray(
        normalizedEntry.evidence_refs ?? [],
        `stageResult.checklist_updates[${index}].evidence_refs`,
      ),
    };
  });
}

function validateRebuttals(value, { strict = false } = {}) {
  if ((value === null || value === undefined) && !strict) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("stageResult.rebuttals must be an array.");
  }

  return value.map((entry, index) => {
    const normalizedEntry = ensureObject(entry, `stageResult.rebuttals[${index}]`);
    return {
      fix_id: ensureNonEmptyString(normalizedEntry.fix_id, `stageResult.rebuttals[${index}].fix_id`),
      rationale_markdown: ensureNonEmptyString(
        normalizedEntry.rationale_markdown,
        `stageResult.rebuttals[${index}].rationale_markdown`,
      ),
      evidence_refs: ensureOptionalStringArray(
        normalizedEntry.evidence_refs ?? [],
        `stageResult.rebuttals[${index}].evidence_refs`,
      ),
    };
  });
}

function validateReviewScope(value, { strict = false } = {}) {
  if ((value === null || value === undefined) && !strict) {
    return {
      scope: null,
      checklist_ids: [],
    };
  }

  const reviewScope = ensureObject(value, "stageResult.review_scope");
  return {
    scope:
      reviewScope.scope === null || reviewScope.scope === undefined
        ? null
        : ensureNonEmptyString(reviewScope.scope, "stageResult.review_scope.scope"),
    checklist_ids: ensureStringArray(
      reviewScope.checklist_ids ?? [],
      "stageResult.review_scope.checklist_ids",
    ),
  };
}

export function resolveStageResultPath(artifactDir) {
  return resolve(ensureNonEmptyString(artifactDir, "artifactDir"), "stage-result.json");
}

export function readStageResult(artifactDir) {
  const stageResultPath = resolveStageResultPath(artifactDir);
  if (!existsSync(stageResultPath)) {
    return null;
  }

  return JSON.parse(readFileSync(stageResultPath, "utf8"));
}

export function validateStageResult(stage, stageResult, options = {}) {
  const strictExtendedContract = Boolean(options?.strictExtendedContract);
  const subphase =
    typeof options?.subphase === "string" && options.subphase.trim().length > 0
      ? options.subphase.trim()
      : "implementation";
  const normalizedStage = Number(stage);
  const result = ensureObject(stageResult, "stageResult");

  if (normalizedStage === 2 && subphase === "doc_gate_repair") {
    const fallbackCommitSubject =
      typeof result.commit?.subject === "string" && result.commit.subject.trim().length > 0
        ? result.commit.subject
        : result.pr?.title;

    const normalizedRepairResult = {
      result: ensureNonEmptyString(result.result, "stageResult.result"),
      summary_markdown: ensureNonEmptyString(result.summary_markdown, "stageResult.summary_markdown"),
      commit: {
        subject: ensureNonEmptyString(fallbackCommitSubject, "stageResult.commit.subject"),
        body_markdown:
          typeof result.commit?.body_markdown === "string" && result.commit.body_markdown.trim().length > 0
            ? result.commit.body_markdown.trim()
            : null,
      },
      pr: {
        title: ensureNonEmptyString(result.pr?.title, "stageResult.pr.title"),
        body_markdown: ensureNonEmptyString(result.pr?.body_markdown, "stageResult.pr.body_markdown"),
      },
      checks_run: ensureStringArray(result.checks_run ?? [], "stageResult.checks_run"),
      next_route: ensureNonEmptyString(result.next_route, "stageResult.next_route"),
      claimed_scope: validateClaimedScope(result.claimed_scope, {
        strict: true,
      }),
      changed_files: ensureStringArray(result.changed_files, "stageResult.changed_files"),
      tests_touched: ensureOptionalStringArray(result.tests_touched ?? [], "stageResult.tests_touched"),
      artifacts_written: ensureStringArray(result.artifacts_written ?? [], "stageResult.artifacts_written"),
      resolved_doc_finding_ids: ensureStringArray(
        result.resolved_doc_finding_ids ?? [],
        "stageResult.resolved_doc_finding_ids",
      ),
      contested_doc_fix_ids: ensureStringArray(
        result.contested_doc_fix_ids ?? [],
        "stageResult.contested_doc_fix_ids",
      ),
      rebuttals: validateRebuttals(result.rebuttals, {
        strict: true,
      }),
    };

    const rebuttalFixIds = normalizedRepairResult.rebuttals.map((entry) => entry.fix_id);
    const missingRebuttals = normalizedRepairResult.contested_doc_fix_ids.filter((id) => !rebuttalFixIds.includes(id));
    const foreignRebuttals = rebuttalFixIds.filter((id) => !normalizedRepairResult.contested_doc_fix_ids.includes(id));
    if (missingRebuttals.length > 0 || foreignRebuttals.length > 0) {
      throw new Error("stageResult.rebuttals must exactly match stageResult.contested_doc_fix_ids.");
    }

    const overlap = normalizedRepairResult.resolved_doc_finding_ids.filter((id) =>
      normalizedRepairResult.contested_doc_fix_ids.includes(id),
    );
    if (overlap.length > 0) {
      throw new Error("stageResult.resolved_doc_finding_ids and stageResult.contested_doc_fix_ids must be disjoint.");
    }

    return normalizedRepairResult;
  }

  if (normalizedStage === 2 && subphase === "doc_gate_review") {
    const findings = validateOptionalFindings(result.findings);
    const reviewedDocFindingIds = ensureStringArray(
      result.reviewed_doc_finding_ids ?? [],
      "stageResult.reviewed_doc_finding_ids",
    );
    const requiredDocFixIds = ensureStringArray(
      result.required_doc_fix_ids ?? [],
      "stageResult.required_doc_fix_ids",
    );
    const waivedDocFixIds = ensureStringArray(
      result.waived_doc_fix_ids ?? [],
      "stageResult.waived_doc_fix_ids",
    );
    const decision = ensureNonEmptyString(result.decision, "stageResult.decision");

    if (decision === "request_changes" && requiredDocFixIds.length === 0) {
      throw new Error("stageResult.required_doc_fix_ids must include at least one entry for request_changes reviews.");
    }

    if (decision === "approve" && requiredDocFixIds.length > 0) {
      throw new Error("stageResult.required_doc_fix_ids must be empty for approve reviews.");
    }

    const overlap = requiredDocFixIds.filter((id) => waivedDocFixIds.includes(id));
    if (overlap.length > 0) {
      throw new Error("stageResult.required_doc_fix_ids and stageResult.waived_doc_fix_ids must be disjoint.");
    }

    return {
      decision,
      body_markdown: ensureNonEmptyString(result.body_markdown, "stageResult.body_markdown"),
      route_back_stage:
        result.route_back_stage === null || result.route_back_stage === undefined
          ? null
          : Number(result.route_back_stage),
      approved_head_sha:
        typeof result.approved_head_sha === "string" && result.approved_head_sha.trim().length > 0
          ? result.approved_head_sha.trim()
          : null,
      review_scope: {
        scope: "doc_gate",
        checklist_ids: [],
      },
      reviewed_doc_finding_ids: reviewedDocFindingIds,
      required_doc_fix_ids: requiredDocFixIds,
      waived_doc_fix_ids: waivedDocFixIds,
      findings,
    };
  }

  if (normalizedStage === 4 && subphase === "authority_precheck") {
    const fallbackCommitSubject =
      typeof result.commit?.subject === "string" && result.commit.subject.trim().length > 0
        ? result.commit.subject
        : result.pr?.title;

    return {
      result: ensureNonEmptyString(result.result, "stageResult.result"),
      summary_markdown: ensureNonEmptyString(result.summary_markdown, "stageResult.summary_markdown"),
      commit: {
        subject: ensureNonEmptyString(fallbackCommitSubject, "stageResult.commit.subject"),
        body_markdown:
          typeof result.commit?.body_markdown === "string" && result.commit.body_markdown.trim().length > 0
            ? result.commit.body_markdown.trim()
            : null,
      },
      pr: {
        title: ensureNonEmptyString(result.pr?.title, "stageResult.pr.title"),
        body_markdown: ensureNonEmptyString(result.pr?.body_markdown, "stageResult.pr.body_markdown"),
      },
      checks_run: ensureStringArray(result.checks_run ?? [], "stageResult.checks_run"),
      next_route: ensureNonEmptyString(result.next_route, "stageResult.next_route"),
      claimed_scope: validateClaimedScope(result.claimed_scope, {
        strict: true,
      }),
      changed_files: ensureStringArray(result.changed_files, "stageResult.changed_files"),
      tests_touched: ensureOptionalStringArray(result.tests_touched ?? [], "stageResult.tests_touched"),
      artifacts_written: ensureStringArray(result.artifacts_written ?? [], "stageResult.artifacts_written"),
      checklist_updates: validateChecklistUpdates(result.checklist_updates, {
        strict: strictExtendedContract,
      }),
      contested_fix_ids: strictExtendedContract
        ? ensureStringArray(result.contested_fix_ids ?? [], "stageResult.contested_fix_ids")
        : ensureOptionalStringArray(result.contested_fix_ids ?? [], "stageResult.contested_fix_ids"),
      rebuttals: validateRebuttals(result.rebuttals, {
        strict: strictExtendedContract,
      }),
      authority_verdict: ensureEnum(
        result.authority_verdict,
        ["pass", "conditional-pass", "hold"],
        "stageResult.authority_verdict",
      ),
      reviewed_screen_ids: ensureStringArray(
        result.reviewed_screen_ids ?? [],
        "stageResult.reviewed_screen_ids",
      ),
      authority_report_paths: ensureStringArray(
        result.authority_report_paths ?? [],
        "stageResult.authority_report_paths",
      ),
      evidence_artifact_refs: ensureStringArray(
        result.evidence_artifact_refs ?? [],
        "stageResult.evidence_artifact_refs",
      ),
      blocker_count: ensureOptionalNonNegativeInteger(
        result.blocker_count,
        "stageResult.blocker_count",
      ),
      major_count: ensureOptionalNonNegativeInteger(
        result.major_count,
        "stageResult.major_count",
      ),
      minor_count: ensureOptionalNonNegativeInteger(
        result.minor_count,
        "stageResult.minor_count",
      ),
    };
  }

  if ([1, 2, 4].includes(normalizedStage)) {
    const fallbackCommitSubject =
      typeof result.commit?.subject === "string" && result.commit.subject.trim().length > 0
        ? result.commit.subject
        : result.pr?.title;

    const normalizedCodeStageResult = {
      result: ensureNonEmptyString(result.result, "stageResult.result"),
      summary_markdown: ensureNonEmptyString(
        result.summary_markdown,
        "stageResult.summary_markdown",
      ),
      commit: {
        subject: ensureNonEmptyString(fallbackCommitSubject, "stageResult.commit.subject"),
        body_markdown:
          typeof result.commit?.body_markdown === "string" &&
          result.commit.body_markdown.trim().length > 0
            ? result.commit.body_markdown.trim()
            : null,
      },
      pr: {
        title: ensureNonEmptyString(result.pr?.title, "stageResult.pr.title"),
        body_markdown: ensureNonEmptyString(
          result.pr?.body_markdown,
          "stageResult.pr.body_markdown",
        ),
      },
      checks_run: ensureStringArray(result.checks_run ?? [], "stageResult.checks_run"),
      next_route: ensureNonEmptyString(result.next_route, "stageResult.next_route"),
      claimed_scope: validateClaimedScope(result.claimed_scope, {
        strict: strictExtendedContract,
      }),
      changed_files: strictExtendedContract
        ? ensureStringArray(result.changed_files, "stageResult.changed_files")
        : ensureOptionalStringArray(result.changed_files, "stageResult.changed_files"),
      tests_touched: strictExtendedContract
        ? ensureStringArray(result.tests_touched, "stageResult.tests_touched")
        : ensureOptionalStringArray(result.tests_touched, "stageResult.tests_touched"),
      artifacts_written: strictExtendedContract
        ? ensureStringArray(result.artifacts_written, "stageResult.artifacts_written")
        : ensureOptionalStringArray(result.artifacts_written, "stageResult.artifacts_written"),
      checklist_updates: validateChecklistUpdates(result.checklist_updates, {
        strict: strictExtendedContract,
      }),
      contested_fix_ids: strictExtendedContract
        ? ensureStringArray(result.contested_fix_ids ?? [], "stageResult.contested_fix_ids")
        : ensureOptionalStringArray(result.contested_fix_ids ?? [], "stageResult.contested_fix_ids"),
      rebuttals: validateRebuttals(result.rebuttals, {
        strict: strictExtendedContract,
      }),
    };

    if (strictExtendedContract) {
      const rebuttalFixIds = normalizedCodeStageResult.rebuttals.map((entry) => entry.fix_id);
      const contestedFixIds = normalizedCodeStageResult.contested_fix_ids;
      const missingRebuttals = contestedFixIds.filter((id) => !rebuttalFixIds.includes(id));
      const foreignRebuttals = rebuttalFixIds.filter((id) => !contestedFixIds.includes(id));
      if (missingRebuttals.length > 0 || foreignRebuttals.length > 0) {
        throw new Error("stageResult.rebuttals must exactly match stageResult.contested_fix_ids.");
      }

      const checkedIds = normalizedCodeStageResult.checklist_updates
        .filter((entry) => entry.status === "checked")
        .map((entry) => entry.id);
      const contestedAsChecked = contestedFixIds.filter((id) => checkedIds.includes(id));
      if (contestedAsChecked.length > 0) {
        throw new Error("stageResult.contested_fix_ids cannot also appear as checked checklist_updates.");
      }
    }

    return normalizedCodeStageResult;
  }

  const decision = ensureNonEmptyString(result.decision, "stageResult.decision");
  const findings = validateOptionalFindings(result.findings);
  const reviewScope = validateReviewScope(result.review_scope, {
    strict: strictExtendedContract,
  });
  const reviewedChecklistIds = strictExtendedContract
    ? ensureStringArray(result.reviewed_checklist_ids, "stageResult.reviewed_checklist_ids")
    : ensureOptionalStringArray(result.reviewed_checklist_ids, "stageResult.reviewed_checklist_ids");
  const requiredFixIds = strictExtendedContract
    ? ensureStringArray(result.required_fix_ids ?? [], "stageResult.required_fix_ids")
    : ensureOptionalStringArray(result.required_fix_ids ?? [], "stageResult.required_fix_ids");
  const waivedFixIds = strictExtendedContract
    ? ensureStringArray(result.waived_fix_ids ?? [], "stageResult.waived_fix_ids")
    : ensureOptionalStringArray(result.waived_fix_ids ?? [], "stageResult.waived_fix_ids");

  if (strictExtendedContract && decision === "request_changes" && findings.length === 0) {
    throw new Error("stageResult.findings must include at least one entry for request_changes reviews.");
  }

  if (strictExtendedContract && decision === "request_changes" && requiredFixIds.length === 0) {
    throw new Error("stageResult.required_fix_ids must include at least one entry for request_changes reviews.");
  }

  if (strictExtendedContract && decision === "approve" && requiredFixIds.length > 0) {
    throw new Error("stageResult.required_fix_ids must be empty for approve reviews.");
  }

  if (strictExtendedContract) {
    const overlap = requiredFixIds.filter((id) => waivedFixIds.includes(id));
    if (overlap.length > 0) {
      throw new Error("stageResult.required_fix_ids and stageResult.waived_fix_ids must be disjoint.");
    }

    const unknownWaivedIds = waivedFixIds.filter((id) => !reviewedChecklistIds.includes(id));
    if (unknownWaivedIds.length > 0) {
      throw new Error("stageResult.waived_fix_ids must be a subset of reviewed_checklist_ids.");
    }
  }

  return {
    decision,
    body_markdown: ensureNonEmptyString(
      result.body_markdown,
      "stageResult.body_markdown",
    ),
    route_back_stage:
      result.route_back_stage === null || result.route_back_stage === undefined
        ? null
        : Number(result.route_back_stage),
    approved_head_sha:
      typeof result.approved_head_sha === "string" &&
      result.approved_head_sha.trim().length > 0
        ? result.approved_head_sha.trim()
        : null,
    findings,
    review_scope: reviewScope,
    reviewed_checklist_ids: reviewedChecklistIds,
    required_fix_ids: requiredFixIds,
    waived_fix_ids: waivedFixIds,
    authority_verdict: ensureOptionalEnum(
      result.authority_verdict,
      ["pass", "conditional-pass", "hold"],
      "stageResult.authority_verdict",
    ),
    reviewed_screen_ids: ensureOptionalStringArray(
      result.reviewed_screen_ids ?? [],
      "stageResult.reviewed_screen_ids",
    ),
    authority_report_paths: ensureOptionalStringArray(
      result.authority_report_paths ?? [],
      "stageResult.authority_report_paths",
    ),
    blocker_count: ensureOptionalNonNegativeInteger(
      result.blocker_count,
      "stageResult.blocker_count",
    ),
    major_count: ensureOptionalNonNegativeInteger(
      result.major_count,
      "stageResult.major_count",
    ),
    minor_count: ensureOptionalNonNegativeInteger(
      result.minor_count,
      "stageResult.minor_count",
    ),
  };
}
