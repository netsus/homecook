import { describe, expect, it } from "vitest";

import {
  buildPingPongLogMarkdown,
  buildIssueSignature,
  evaluateLoopRound,
  formatAgentSetting,
  normalizePlanResponse,
  normalizeReview,
  parseClaudeInvocationMetadata,
  parseCodexInvocationMetadata,
  parseStructuredOutput,
} from "../scripts/lib/agent-plan-loop.mjs";

describe("agent plan loop", () => {
  it("normalizes structured review payloads", () => {
    const review = normalizeReview("claude", {
      decision: "revise",
      summary: "Need clearer validation scope.",
      blocker_status: "non-blocker",
      required_changes: [
        {
          id: "validation-scope",
          title: "Clarify validation ownership",
          details: "State who runs which checks before implementation.",
          source_refs: ["docs/engineering/subagents.md"],
        },
      ],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(review.agent).toBe("claude");
    expect(review.required_changes).toHaveLength(1);
    expect(review.required_changes[0]?.source_refs).toEqual([
      "docs/engineering/subagents.md",
    ]);
  });

  it("drops blank strings from optional question and source arrays", () => {
    const review = normalizeReview("claude", {
      decision: "revise",
      summary: "Looks good.",
      blocker_status: "non-blocker",
      required_changes: [
        {
          id: "scope",
          title: "Clarify scope",
          details: "Need exact scope text.",
          source_refs: [null, "", "docs/workpacks/README.md"],
        },
      ],
      recommended_changes: [],
      unresolved_questions: [null, "", "Which slice is next?"],
    });

    expect(review.required_changes[0]?.source_refs).toEqual([
      "docs/workpacks/README.md",
    ]);
    expect(review.unresolved_questions).toEqual(["Which slice is next?"]);
  });

  it("fails when a required review field is missing", () => {
    expect(() =>
      normalizeReview("codex", {
        decision: "approve",
        blocker_status: "non-blocker",
        required_changes: [],
        recommended_changes: [],
        unresolved_questions: [],
      }),
    ).toThrow(/summary/i);
  });

  it("rejects contradictory review payloads", () => {
    expect(() =>
      normalizeReview("claude", {
        decision: "approve",
        summary: "Looks good.",
        blocker_status: "non-blocker",
        required_changes: [
          {
            id: "scope",
            title: "Clarify scope",
            details: "Still missing exact scope.",
            source_refs: [],
          },
        ],
        recommended_changes: [],
        unresolved_questions: [],
      }),
    ).toThrow(/approved with required changes/i);

    expect(() =>
      normalizeReview("codex", {
        decision: "block",
        summary: "This is blocked.",
        blocker_status: "non-blocker",
        required_changes: [],
        recommended_changes: [],
        unresolved_questions: [],
      }),
    ).toThrow(/decision=block/i);
  });

  it("normalizes plan payloads and drops blank optional entries", () => {
    const plan = normalizePlanResponse({
      title: "Plan title",
      summary: "Plan summary",
      plan_markdown: "## Plan\n\n1. Do the work.",
      change_log: [null, "", "Added blocked-path coverage."],
      assumptions: ["  Official docs are current.  ", null, ""],
      open_questions: [null, "", "Do we need max-rounds guidance?"],
      out_of_scope: [null, "", "CI rollout changes"],
      sources_used: [null, "", "docs/engineering/agent-plan-loop.md"],
    });

    expect(plan.change_log).toEqual(["Added blocked-path coverage."]);
    expect(plan.assumptions).toEqual(["Official docs are current."]);
    expect(plan.open_questions).toEqual(["Do we need max-rounds guidance?"]);
    expect(plan.out_of_scope).toEqual(["CI rollout changes"]);
    expect(plan.sources_used).toEqual(["docs/engineering/agent-plan-loop.md"]);
  });

  it("fails when a required plan field is missing or invalid", () => {
    expect(() =>
      normalizePlanResponse({
        title: "Plan title",
        summary: "Plan summary",
        plan_markdown: "",
        change_log: [],
        assumptions: [],
        open_questions: [],
        out_of_scope: [],
        sources_used: [],
      }),
    ).toThrow(/plan_markdown/i);

    expect(() =>
      normalizePlanResponse({
        title: "Plan title",
        summary: "Plan summary",
        plan_markdown: "## Plan",
        change_log: null,
        assumptions: [],
        open_questions: [],
        out_of_scope: [],
        sources_used: [],
      }),
    ).toThrow(/change_log/i);
  });

  it("parses Claude result wrappers that contain fenced JSON strings", () => {
    expect(
      parseStructuredOutput(
        JSON.stringify({
          type: "result",
          subtype: "success",
          result:
            '```json\n{"decision":"approve","summary":"ok","blocker_status":"non-blocker","required_changes":[],"recommended_changes":[],"unresolved_questions":[]}\n```',
        }),
      ),
    ).toMatchObject({
      decision: "approve",
      blocker_status: "non-blocker",
    });
  });

  it("coerces compatible Claude verdict payloads that use requires_changes", () => {
    const review = normalizeReview(
      "claude",
      parseStructuredOutput(
        JSON.stringify({
          type: "result",
          subtype: "success",
          result: [
            "```json",
            JSON.stringify(
              {
                verdict: "requires_changes",
                required_changes: [
                  {
                    id: "stalled-rule-tighten",
                    title: "Tighten stalled convergence rule",
                    description: "Exact same set must repeat before stalled.",
                    file_path: "docs/engineering/agent-review-loop.md",
                  },
                ],
                recommendations: [],
                blockers: [],
                summary: "One required design change remains.",
              },
              null,
              2,
            ),
            "```",
          ].join("\n"),
        }),
      ),
    );

    expect(review).toMatchObject({
      decision: "revise",
      blocker_status: "non-blocker",
      summary: "One required design change remains.",
    });
    expect(review.required_changes).toEqual([
      expect.objectContaining({
        id: "stalled-rule-tighten",
        title: "Tighten stalled convergence rule",
      }),
    ]);
  });

  it("treats compatible blocked verdicts as blocker reviews even without blocker_status", () => {
    const review = normalizeReview(
      "claude",
      parseStructuredOutput(
        JSON.stringify({
          type: "result",
          subtype: "success",
          result: [
            "```json",
            JSON.stringify(
              {
                verdict: "blocked",
                required_changes: [],
                recommendations: [],
                blockers: [],
                summary: "Waiting on an operator decision before continuing.",
              },
              null,
              2,
            ),
            "```",
          ].join("\n"),
        }),
      ),
    );

    expect(review).toMatchObject({
      decision: "block",
      blocker_status: "blocker",
      summary: "Waiting on an operator decision before continuing.",
    });
  });

  it("coerces plain-language Claude approvals from result wrappers", () => {
    const review = normalizeReview(
      "claude",
      parseStructuredOutput(
        JSON.stringify({
          type: "result",
          subtype: "success",
          result: [
            "## Ratification Decision",
            "",
            "**APPROVED with no required changes.**",
            "",
            "The current V1 `agent-review-loop` design is now implementation-ready.",
            "",
            "## Required Changes",
            "",
            "None.",
          ].join("\n"),
        }),
      ),
    );

    expect(review).toMatchObject({
      decision: "approve",
      blocker_status: "non-blocker",
    });
    expect(review.required_changes).toEqual([]);
  });

  it("parses the first valid JSON object from mixed text output", () => {
    expect(
      parseStructuredOutput(
        [
          "preface text",
          '{"decision":"approve","summary":"ok","blocker_status":"non-blocker","required_changes":[],"recommended_changes":[],"unresolved_questions":[]}',
          "trailing note",
          '{"ignored":true}',
        ].join("\n"),
      ),
    ).toMatchObject({
      decision: "approve",
      blocker_status: "non-blocker",
    });
  });

  it("includes a preview when structured output parsing fails", () => {
    expect(() => parseStructuredOutput("not-json at all")).toThrow(/Preview:/i);
  });

  it("parses Codex invocation metadata from stderr banner", () => {
    expect(
      parseCodexInvocationMetadata(
        [
          "OpenAI Codex v0.x",
          "  Model: gpt-5.4",
          "  Reasoning Effort: xhigh",
        ].join("\n"),
      ),
    ).toEqual({
      model: "gpt-5.4",
      effort: "xhigh",
    });
  });

  it("parses Claude invocation metadata from JSON output", () => {
    expect(
      parseClaudeInvocationMetadata(
        JSON.stringify({
          modelUsage: {
            "claude-opus-4-6": {
              inputTokens: 3,
            },
          },
        }),
      ),
    ).toEqual({
      model: "claude-opus-4-6",
    });
  });

  it("avoids duplicate source labels in agent setting strings", () => {
    expect(formatAgentSetting("pending", "pending")).toBe("pending");
    expect(formatAgentSetting(null, null)).toBe("default");
    expect(formatAgentSetting(null, "pending")).toBe("pending");
    expect(formatAgentSetting(null, "configured")).toBe("unresolved (configured)");
  });

  it("builds a single markdown timeline for ping-pong history", () => {
    const markdown = buildPingPongLogMarkdown({
      goal: "Create a slice plan",
      status: "needs_revision",
      roundsCompleted: 1,
      maxRounds: 3,
      workpack: "03-recipe-like",
      agentConfig: {
        codex: {
          model: "gpt-5.4-mini",
          modelSource: "resolved",
          effort: "low",
          effortSource: "requested",
        },
        claude: {
          model: "sonnet",
          modelSource: "configured",
          effort: "medium",
          effortSource: "configured",
        },
      },
      currentArtifactLabel: "current-plan",
      currentArtifactPath: "plans/00-codex-draft.md",
      currentPlanPath: "plans/00-codex-draft.md",
      finalSummaryPath: null,
      lastUpdated: "2026-03-19T00:00:00.000Z",
      entries: [
        {
          heading: "00. Codex Draft",
          kind: "plan",
          agent: "codex",
          model: "gpt-5.4-mini",
          modelSource: "resolved",
          effort: "low",
          effortSource: "requested",
          timestamp: "2026-03-19T00:00:05.000Z",
          round: 0,
          promptPath: "prompts/00-codex-draft.txt",
          artifactPath: "plans/00-codex-draft.md",
          rawOutputPath: "plans/00-codex-draft.raw.json",
          title: "Initial plan",
          summary: "Drafted a first pass.",
          openQuestionCount: 2,
        },
        {
          heading: "01. Claude Review",
          kind: "review",
          agent: "claude",
          model: "sonnet",
          modelSource: "configured",
          effort: "medium",
          effortSource: "configured",
          timestamp: "2026-03-19T00:00:08.000Z",
          round: 1,
          promptPath: "prompts/01-claude-review.txt",
          artifactPath: "reviews/01-claude-review.md",
          rawOutputPath: "reviews/01-claude-review.raw.json",
          decision: "revise",
          blockerStatus: "non-blocker",
          summary: "Need clearer scope boundaries.",
          requiredChangeCount: 1,
          requiredChangeTitles: "scope: Clarify scope boundaries",
          recommendedChangeCount: 1,
          recommendedChangeTitles: "rollout: Add rollout note",
        },
        {
          heading: "01. Round Status",
          kind: "round_status",
          round: 1,
          roundStatus: "needs_revision",
          shouldContinue: true,
          requiredIssueCount: 1,
        },
      ],
    });

    expect(markdown).toContain("# Ping-Pong Log");
    expect(markdown).toContain("## Agent Config");
    expect(markdown).toContain(
      "Codex: model=gpt-5.4-mini (resolved), effort=low (requested)",
    );
    expect(markdown).toContain("### 00. Codex Draft");
    expect(markdown).toContain("- Model: gpt-5.4-mini (resolved)");
    expect(markdown).toContain("- Timestamp: 2026-03-19T00:00:05.000Z");
    expect(markdown).toContain("[prompt](prompts/00-codex-draft.txt)");
    expect(markdown).toContain("Required Change Titles: scope: Clarify scope boundaries");
    expect(markdown).toContain("### 01. Round Status");
    expect(markdown).toContain("Continue Loop: yes");
  });

  it("converges only when both agents approve without required changes", () => {
    const claudeReview = normalizeReview("claude", {
      decision: "approve",
      summary: "Plan is aligned with the official docs.",
      blocker_status: "non-blocker",
      required_changes: [],
      recommended_changes: [
        {
          id: "nice-to-have",
          title: "Add rollout note",
          details: "Optional follow-up note for rollout timing.",
          source_refs: [],
        },
      ],
      unresolved_questions: [],
    });

    const codexReview = normalizeReview("codex", {
      decision: "approve",
      summary: "No further fixes needed before execution.",
      blocker_status: "non-blocker",
      required_changes: [],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(
      evaluateLoopRound({
        round: 2,
        maxRounds: 4,
        claudeReview,
        codexReview,
        previousRequiredIssueSignatures: new Set<string>(),
      }),
    ).toMatchObject({
      status: "approved",
      shouldContinue: false,
    });
  });

  it("continues when either agent still requires changes", () => {
    const claudeReview = normalizeReview("claude", {
      decision: "revise",
      summary: "The validation plan is underspecified.",
      blocker_status: "non-blocker",
      required_changes: [
        {
          id: "validation-matrix",
          title: "Add validation matrix",
          details: "Cover lint, typecheck, unit, and e2e ownership.",
          source_refs: ["package.json"],
        },
      ],
      recommended_changes: [],
      unresolved_questions: [],
    });

    const codexReview = normalizeReview("codex", {
      decision: "approve",
      summary: "Ready once Claude's required change is addressed.",
      blocker_status: "non-blocker",
      required_changes: [],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(
      evaluateLoopRound({
        round: 1,
        maxRounds: 4,
        claudeReview,
        codexReview,
        previousRequiredIssueSignatures: new Set<string>(),
      }),
    ).toMatchObject({
      status: "needs_revision",
      shouldContinue: true,
    });
  });

  it("stops immediately when either agent returns a blocking decision", () => {
    const claudeReview = normalizeReview("claude", {
      decision: "block",
      summary: "The plan contradicts the source-of-truth docs.",
      blocker_status: "blocker",
      required_changes: [
        {
          id: "doc-conflict",
          title: "Resolve document conflict first",
          details: "The plan cannot proceed until the conflicting docs are reconciled.",
          source_refs: ["docs/sync/CURRENT_SOURCE_OF_TRUTH.md"],
        },
      ],
      recommended_changes: [],
      unresolved_questions: [],
    });

    const codexReview = normalizeReview("codex", {
      decision: "approve",
      summary: "Ready if the blocker is resolved.",
      blocker_status: "non-blocker",
      required_changes: [],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(
      evaluateLoopRound({
        round: 1,
        maxRounds: 4,
        claudeReview,
        codexReview,
        previousRequiredIssueSignatures: new Set<string>(),
      }),
    ).toMatchObject({
      status: "blocked",
      shouldContinue: false,
    });
  });

  it("stops when blocker status is raised even without a block decision", () => {
    const claudeReview = normalizeReview("claude", {
      decision: "revise",
      summary: "A rollout blocker remains unresolved.",
      blocker_status: "blocker",
      required_changes: [
        {
          id: "release-blocker",
          title: "Resolve rollout dependency",
          details: "The plan depends on a missing precondition.",
          source_refs: ["docs/engineering/agent-workflow-overview.md"],
        },
      ],
      recommended_changes: [],
      unresolved_questions: [],
    });

    const codexReview = normalizeReview("codex", {
      decision: "revise",
      summary: "The dependency must be cleared before continuing.",
      blocker_status: "non-blocker",
      required_changes: [],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(
      evaluateLoopRound({
        round: 2,
        maxRounds: 4,
        claudeReview,
        codexReview,
        previousRequiredIssueSignatures: new Set<string>(),
      }),
    ).toMatchObject({
      status: "blocked",
      shouldContinue: false,
    });
  });

  it("marks the loop as stalled when only repeated required issues remain", () => {
    const repeatedIssue = {
      id: "source-of-truth",
      title: "Anchor the slice to current official docs",
      details: "The plan needs exact source references.",
      source_refs: ["docs/sync/CURRENT_SOURCE_OF_TRUTH.md"],
    };

    const claudeReview = normalizeReview("claude", {
      decision: "revise",
      summary: "Still missing the same source-of-truth anchors.",
      blocker_status: "non-blocker",
      required_changes: [repeatedIssue],
      recommended_changes: [],
      unresolved_questions: [],
    });

    const codexReview = normalizeReview("codex", {
      decision: "revise",
      summary: "The remaining gap is unchanged from the prior round.",
      blocker_status: "non-blocker",
      required_changes: [repeatedIssue],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(
      evaluateLoopRound({
        round: 3,
        maxRounds: 4,
        claudeReview,
        codexReview,
        previousRequiredIssueSignatures: new Set([
          buildIssueSignature(repeatedIssue),
        ]),
      }),
    ).toMatchObject({
      status: "stalled",
      shouldContinue: false,
    });
  });

  it("does not mark partial progress as stalled when the signature set shrinks", () => {
    const priorIssueA = {
      id: "source-of-truth",
      title: "Anchor the slice to current official docs",
      details: "The plan needs exact source references.",
      file_path: "docs/engineering/agent-review-loop.md",
      line: 10,
      source_refs: [],
    };
    const priorIssueB = {
      id: "approval-gate",
      title: "Clarify approval gate",
      details: "The plan needs clearer approval criteria.",
      file_path: "docs/engineering/agent-review-loop.md",
      line: 11,
      source_refs: [],
    };

    const claudeReview = normalizeReview("claude", {
      decision: "revise",
      summary: "One issue was resolved, one remains.",
      blocker_status: "non-blocker",
      required_changes: [
        {
          id: "source-of-truth",
          title: "Anchor the slice to current docs with stable IDs",
          details: "The same remaining issue is still open.",
          file_path: "docs/engineering/agent-review-loop.md",
          line: 10,
          source_refs: [],
        },
      ],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(
      evaluateLoopRound({
        round: 2,
        maxRounds: 4,
        claudeReview,
        codexReview: null,
        previousRequiredIssueSignatures: new Set([
          buildIssueSignature(priorIssueA),
          buildIssueSignature(priorIssueB),
        ]),
      }),
    ).toMatchObject({
      status: "needs_revision",
      shouldContinue: true,
    });
  });

  it("keeps stalled as the terminal status even on the final round", () => {
    const repeatedIssue = {
      id: "source-of-truth",
      title: "Anchor the slice to current official docs",
      details: "The plan needs exact source references.",
      source_refs: ["docs/sync/CURRENT_SOURCE_OF_TRUTH.md"],
    };

    const claudeReview = normalizeReview("claude", {
      decision: "revise",
      summary: "Still missing the same source-of-truth anchors.",
      blocker_status: "non-blocker",
      required_changes: [repeatedIssue],
      recommended_changes: [],
      unresolved_questions: [],
    });

    const codexReview = normalizeReview("codex", {
      decision: "revise",
      summary: "The remaining gap is unchanged from the prior round.",
      blocker_status: "non-blocker",
      required_changes: [repeatedIssue],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(
      evaluateLoopRound({
        round: 3,
        maxRounds: 3,
        claudeReview,
        codexReview,
        previousRequiredIssueSignatures: new Set([
          buildIssueSignature(repeatedIssue),
        ]),
      }),
    ).toMatchObject({
      status: "stalled",
      shouldContinue: false,
    });
  });

  it("stops at the max round limit", () => {
    const claudeReview = normalizeReview("claude", {
      decision: "revise",
      summary: "One required fix remains.",
      blocker_status: "non-blocker",
      required_changes: [
        {
          id: "handoff",
          title: "Clarify handoff after planning",
          details: "Document how the approved plan is handed to implementation.",
          source_refs: ["docs/engineering/agent-workflow-overview.md"],
        },
      ],
      recommended_changes: [],
      unresolved_questions: [],
    });

    const codexReview = normalizeReview("codex", {
      decision: "revise",
      summary: "The same final clarification is still open.",
      blocker_status: "non-blocker",
      required_changes: [],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(
      evaluateLoopRound({
        round: 4,
        maxRounds: 4,
        claudeReview,
        codexReview,
        previousRequiredIssueSignatures: new Set<string>(),
      }),
    ).toMatchObject({
      status: "max_rounds_reached",
      shouldContinue: false,
    });
  });
});
