import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildIssueSignature,
  normalizeReview,
  parseStructuredOutput,
} from "../scripts/lib/agent-loop-core.mjs";
import {
  assertActionableReviewTargets,
  buildReviewLoopContextBundle,
  buildReviewLoopSummary,
  collectCurrentReviewTargetSnapshot,
  collectReviewTargets,
  DEFAULT_REVIEW_LOOP_CONTEXT_FILES,
  evaluateFinalApprovalGate,
  enforceOmittedTargetApprovalGate,
  mergeStableAgentReview,
  normalizeFixResponse,
  normalizeReviewTargetSpec,
  resolveReviewLoopContextFiles,
  runApprovalVerificationGate,
  runVerificationCommands,
  writeFailureArtifacts,
} from "../scripts/lib/agent-review-loop.mjs";

function createTempGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), "agent-review-loop-"));
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Codex Test"], {
    cwd: dir,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.email", "codex@example.com"], {
    cwd: dir,
    stdio: "pipe",
  });

  writeFileSync(join(dir, "README.md"), "# temp repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });

  return dir;
}

describe("agent review loop", () => {
  it("preserves optional review issue locations and includes them in issue signatures", () => {
    const review = normalizeReview("claude", {
      decision: "revise",
      summary: "Need one targeted code fix.",
      blocker_status: "non-blocker",
      required_changes: [
        {
          id: "missing-guard",
          title: "Add missing guard",
          details: "Prevent empty review targets.",
          file_path: "scripts/agent-review-loop.mjs",
          line: 42,
          source_refs: ["docs/engineering/agent-review-loop.md"],
        },
      ],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(review.required_changes[0]).toMatchObject({
      file_path: "scripts/agent-review-loop.mjs",
      line: 42,
    });

    expect(
      buildIssueSignature({
        id: "missing-guard",
        title: "Add missing guard",
        details: "Prevent empty review targets.",
        file_path: "scripts/agent-review-loop.mjs",
        line: 42,
        source_refs: ["docs/engineering/agent-review-loop.md"],
      }),
    ).not.toBe(
      buildIssueSignature({
        id: "missing-guard",
        title: "Add missing guard",
        details: "Prevent empty review targets.",
        file_path: "scripts/agent-review-loop.mjs",
        line: 99,
        source_refs: ["docs/engineering/agent-review-loop.md"],
      }),
    );
  });

  it("ignores source refs when building stalled issue signatures", () => {
    expect(
      buildIssueSignature({
        id: "missing-guard",
        title: "Add missing guard",
        details: "Prevent empty review targets.",
        file_path: "scripts/agent-review-loop.mjs",
        line: 42,
        source_refs: ["docs/engineering/agent-review-loop.md"],
      }),
    ).toBe(
      buildIssueSignature({
        id: "missing-guard",
        title: "Add missing guard",
        details: "Prevent empty review targets.",
        file_path: "scripts/agent-review-loop.mjs",
        line: 42,
        source_refs: ["scripts/lib/agent-loop-core.mjs"],
      }),
    );
  });

  it("ignores title wording changes when building stalled issue signatures", () => {
    expect(
      buildIssueSignature({
        id: "missing-guard",
        title: "Add missing guard",
        details: "Prevent empty review targets.",
        file_path: "scripts/agent-review-loop.mjs",
        line: 42,
        source_refs: [],
      }),
    ).toBe(
      buildIssueSignature({
        id: "missing-guard",
        title: "Add explicit empty-target guard",
        details: "Prevent empty review targets.",
        file_path: "scripts/agent-review-loop.mjs",
        line: 42,
        source_refs: [],
      }),
    );
  });

  it("coerces compatible Claude review payloads from result wrappers", () => {
    const raw = JSON.stringify({
      type: "result",
      subtype: "success",
      result: [
        "Based on my review:",
        "```json",
        JSON.stringify(
          {
            round: 1,
            reviewer: "claude",
            status: "changes_required",
            required_changes: [
              {
                file: "smoke-review-loop-note.md",
                line: 3,
                issue: "Typo: 'teh' should be 'the'",
                severity: "minor",
                category: "correctness",
              },
            ],
            optional_suggestions: [],
            blockers: [],
            verification_needed: false,
            summary: "Simple typo correction needed.",
          },
          null,
          2,
        ),
        "```",
      ].join("\n"),
    });

    const review = normalizeReview("claude", parseStructuredOutput(raw));

    expect(review).toMatchObject({
      decision: "revise",
      blocker_status: "non-blocker",
      summary: "Simple typo correction needed.",
    });
    expect(review.required_changes).toEqual([
      expect.objectContaining({
        id: "correctness-typo-teh-should-be-the",
        title: "Typo: 'teh' should be 'the'",
        details: "Typo: 'teh' should be 'the'",
        file_path: "smoke-review-loop-note.md",
        line: 3,
      }),
    ]);
  });

  it("coerces verdict and location based Claude review payloads", () => {
    const raw = JSON.stringify({
      type: "result",
      subtype: "success",
      result: [
        "Structured feedback:",
        "```json",
        JSON.stringify(
          {
            round: 1,
            reviewer: "Claude",
            verdict: "REQUIRED_CHANGES",
            required_changes: [
              {
                type: "typo",
                location: "smoke-review-loop-note.md:3",
                issue: "Typo: 'teh' should be 'the'",
                current: "This file exists for teh isolated smoke test.",
                expected: "This file exists for the isolated smoke test.",
                blocker: false,
                rationale: "Minor spelling error that should be corrected.",
              },
            ],
            recommendations: [
              {
                category: "documentation",
                suggestion: "Consider adding more context",
                rationale: "The note is extremely minimal.",
              },
            ],
            blockers: [],
            summary: "One typo found.",
          },
          null,
          2,
        ),
        "```",
      ].join("\n"),
    });

    const review = normalizeReview("claude", parseStructuredOutput(raw));

    expect(review).toMatchObject({
      decision: "revise",
      blocker_status: "non-blocker",
      summary: "One typo found.",
    });
    expect(review.required_changes).toEqual([
      expect.objectContaining({
        file_path: "smoke-review-loop-note.md",
        line: 3,
        details: "Minor spelling error that should be corrected.",
      }),
    ]);
    expect(review.recommended_changes).toEqual([
      expect.objectContaining({
        title: "Consider adding more context",
        details: "The note is extremely minimal.",
      }),
    ]);
  });

  it("treats compatible blocked status payloads as blocker reviews without blocker_status", () => {
    const raw = JSON.stringify({
      type: "result",
      subtype: "success",
      result: [
        "Structured feedback:",
        "```json",
        JSON.stringify(
          {
            status: "blocked",
            required_changes: [],
            optional_suggestions: [],
            blockers: [],
            summary: "Cannot continue until the missing context file is supplied.",
          },
          null,
          2,
        ),
        "```",
      ].join("\n"),
    });

    const review = normalizeReview("claude", parseStructuredOutput(raw));

    expect(review).toMatchObject({
      decision: "block",
      blocker_status: "blocker",
      summary: "Cannot continue until the missing context file is supplied.",
    });
  });

  it("normalizes fix payloads", () => {
    const fix = normalizeFixResponse({
      summary: "Applied the missing guard and added coverage.",
      files_changed: [null, "", "scripts/agent-review-loop.mjs"],
      tests_run: [null, "", "pnpm test -- agent-review-loop"],
      verification_status: "skipped",
      remaining_risks: [null, "", "Needs live smoke test"],
    });

    expect(fix.files_changed).toEqual(["scripts/agent-review-loop.mjs"]);
    expect(fix.tests_run).toEqual(["pnpm test -- agent-review-loop"]);
    expect(fix.verification_status).toBe("skipped");
    expect(fix.remaining_risks).toEqual(["Needs live smoke test"]);
  });

  it("fails fast when the current review target diff is empty", () => {
    const repoDir = createTempGitRepo();

    try {
      expect(() =>
        collectReviewTargets({
          workingDirectory: repoDir,
        }),
      ).toThrow(/No review targets found/i);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("includes untracked text files and omits binary files from review targets", () => {
    const repoDir = createTempGitRepo();

    try {
      writeFileSync(join(repoDir, "notes.txt"), "hello review loop\n");
      writeFileSync(join(repoDir, "image.bin"), Buffer.from([0, 159, 146, 150]));

      const targets = collectReviewTargets({
        workingDirectory: repoDir,
      });

      expect(targets.diffText).toContain("+++ b/notes.txt");
      expect(targets.diffText).toContain("+hello review loop");
      expect(targets.diffText).toContain("review target omitted: image.bin (binary)");
      expect(targets.includedPaths).toContain("notes.txt");
      expect(targets.omittedTargets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filePath: "image.bin",
            reason: "binary",
          }),
        ]),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("collects commit range review targets without including unrelated working tree files", () => {
    const repoDir = createTempGitRepo();

    try {
      const featurePath = join(repoDir, "feature.txt");
      writeFileSync(featurePath, "feature change\n");
      execFileSync("git", ["add", "feature.txt"], { cwd: repoDir, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "add feature file"], {
        cwd: repoDir,
        stdio: "pipe",
      });

      writeFileSync(join(repoDir, "working-tree-only.txt"), "local only\n");

      const targets = collectReviewTargets({
        workingDirectory: repoDir,
        reviewTarget: {
          mode: "commit_range",
          baseRef: "HEAD~1",
          headRef: "HEAD",
          rangeNotation: "..",
          label: "commit range HEAD~1..HEAD",
        },
      });

      expect(targets.diffText).toContain("+++ b/feature.txt");
      expect(targets.diffText).toContain("+feature change");
      expect(targets.diffText).not.toContain("working-tree-only.txt");
      expect(targets.includedPaths).toContain("feature.txt");
      expect(targets.untrackedFiles).toEqual([]);
      expect(targets.reviewTarget).toMatchObject({
        mode: "commit_range",
        baseRef: "HEAD~1",
        headRef: "HEAD",
        rangeNotation: "..",
      });
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("omits deleted commit range targets using the base-side blob instead of HEAD", () => {
    const repoDir = createTempGitRepo();

    try {
      const largePath = join(repoDir, "range-deleted-large.txt");
      writeFileSync(largePath, "a".repeat(60_000));
      execFileSync("git", ["add", "range-deleted-large.txt"], {
        cwd: repoDir,
        stdio: "pipe",
      });
      execFileSync("git", ["commit", "-m", "add range deletion target"], {
        cwd: repoDir,
        stdio: "pipe",
      });
      execFileSync("git", ["rm", "range-deleted-large.txt"], {
        cwd: repoDir,
        stdio: "pipe",
      });
      execFileSync("git", ["commit", "-m", "delete range target"], {
        cwd: repoDir,
        stdio: "pipe",
      });

      const targets = collectReviewTargets({
        workingDirectory: repoDir,
        reviewTarget: {
          mode: "commit_range",
          baseRef: "HEAD~1",
          headRef: "HEAD",
          rangeNotation: "..",
          label: "commit range HEAD~1..HEAD",
        },
      });

      expect(targets.diffText).toContain(
        "review target omitted: range-deleted-large.txt (too large)",
      );
      expect(targets.includedPaths).not.toContain("range-deleted-large.txt");
      expect(targets.omittedTargets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filePath: "range-deleted-large.txt",
            reason: "too large",
          }),
        ]),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("omits deleted tracked files when the removed blob exceeds the inline threshold", () => {
    const repoDir = createTempGitRepo();

    try {
      const deletedLargePath = join(repoDir, "deleted-large.txt");
      writeFileSync(deletedLargePath, "a".repeat(60_000));
      execFileSync("git", ["add", "deleted-large.txt"], {
        cwd: repoDir,
        stdio: "pipe",
      });
      execFileSync("git", ["commit", "-m", "add large tracked file"], {
        cwd: repoDir,
        stdio: "pipe",
      });
      rmSync(deletedLargePath);

      const targets = collectReviewTargets({
        workingDirectory: repoDir,
      });

      expect(targets.diffText).toContain(
        "review target omitted: deleted-large.txt (too large)",
      );
      expect(targets.includedPaths).not.toContain("deleted-large.txt");
      expect(targets.omittedTargets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filePath: "deleted-large.txt",
            reason: "too large",
          }),
        ]),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("fails when every current review target is omitted", () => {
    const repoDir = createTempGitRepo();

    try {
      writeFileSync(join(repoDir, "large.txt"), "a".repeat(60_000));

      const targets = collectReviewTargets({
        workingDirectory: repoDir,
      });

      let thrown: Error | null = null;
      try {
        assertActionableReviewTargets(targets);
      } catch (error) {
        thrown = error instanceof Error ? error : new Error(String(error));
      }

      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).toMatchObject({
        code: "all_review_targets_omitted",
        stage: "collect_review_targets",
      });
      expect(thrown?.message).toMatch(/human review is required/i);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("includes deterministic self-review companion files in the default context bundle", () => {
    const contextFiles = resolveReviewLoopContextFiles({
      workingDirectory: process.cwd(),
      extraContextFiles: [],
    });
    const bundle = buildReviewLoopContextBundle(contextFiles, process.cwd());

    expect(contextFiles).toEqual(
      expect.arrayContaining(
        DEFAULT_REVIEW_LOOP_CONTEXT_FILES.map((filePath) =>
          join(process.cwd(), filePath),
        ),
      ),
    );
    expect(bundle).toContain("### docs/engineering/agent-review-loop.md");
    expect(bundle).toContain("### scripts/agent-review-loop.mjs");
    expect(bundle).toContain("### scripts/lib/agent-review-loop.mjs");
    expect(bundle).toContain("### scripts/lib/agent-loop-core.mjs");
    expect(bundle).toContain("### scripts/schemas/agent-plan-review.schema.json");
    expect(bundle).toContain("### scripts/schemas/agent-review-fix.schema.json");
    expect(bundle).toContain("### tests/agent-review-loop.test.ts");
  });

  it("includes both README.md and acceptance.md when --workpack is given and both exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-ctx-workpack-"));
    try {
      for (const relPath of DEFAULT_REVIEW_LOOP_CONTEXT_FILES) {
        const full = join(dir, relPath);
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, `# stub ${relPath}`);
      }
      const readmePath = join(dir, "docs/workpacks/02-foo/README.md");
      const acceptancePath = join(dir, "docs/workpacks/02-foo/acceptance.md");
      mkdirSync(join(dir, "docs/workpacks/02-foo"), { recursive: true });
      writeFileSync(readmePath, "# README stub");
      writeFileSync(acceptancePath, "# acceptance stub");

      const contextFiles = resolveReviewLoopContextFiles({
        workingDirectory: dir,
        workpack: "02-foo",
      });

      expect(contextFiles).toContain(readmePath);
      expect(contextFiles).toContain(acceptancePath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when --workpack acceptance.md is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-ctx-missing-"));
    try {
      for (const relPath of DEFAULT_REVIEW_LOOP_CONTEXT_FILES) {
        const full = join(dir, relPath);
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, `# stub ${relPath}`);
      }
      mkdirSync(join(dir, "docs/workpacks/02-foo"), { recursive: true });
      writeFileSync(join(dir, "docs/workpacks/02-foo/README.md"), "# README stub");
      // acceptance.md intentionally omitted

      expect(() =>
        resolveReviewLoopContextFiles({ workingDirectory: dir, workpack: "02-foo" }),
      ).toThrow(/Context file not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps verification commands to passed, failed, and skipped states", () => {
    const artifactDir = mkdtempSync(join(tmpdir(), "agent-review-verify-"));

    try {
      const skipped = runVerificationCommands({
        commands: [],
        workingDirectory: process.cwd(),
        outputDir: artifactDir,
        round: 1,
      });
      expect(skipped.status).toBe("skipped");

      const passed = runVerificationCommands({
        commands: ['node -e "process.exit(0)"'],
        workingDirectory: process.cwd(),
        outputDir: artifactDir,
        round: 2,
      });
      expect(passed.status).toBe("passed");

      const failed = runVerificationCommands({
        commands: ['node -e "process.exit(1)"'],
        workingDirectory: process.cwd(),
        outputDir: artifactDir,
        round: 3,
      });
      expect(failed.status).toBe("failed");
    } finally {
      rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it("gates approval on verification results before final approval", () => {
    const artifactDir = mkdtempSync(join(tmpdir(), "agent-review-gate-"));

    try {
      const passed = runApprovalVerificationGate({
        commands: ['node -e "process.exit(0)"'],
        workingDirectory: process.cwd(),
        outputDir: artifactDir,
        round: 1,
      });
      expect(passed.verification.status).toBe("passed");
      expect(passed.approvalReview).toBeNull();

      const failed = runApprovalVerificationGate({
        commands: ['node -e "process.exit(1)"'],
        workingDirectory: process.cwd(),
        outputDir: artifactDir,
        round: 2,
      });
      expect(failed.verification.status).toBe("failed");
      expect(failed.approvalReview).toMatchObject({
        decision: "revise",
        required_changes: [
          expect.objectContaining({
            id: "verification-1",
          }),
        ],
      });
    } finally {
      rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it("keeps approval-gate and post-fix verification artifacts distinct in the same round", () => {
    const artifactDir = mkdtempSync(join(tmpdir(), "agent-review-gate-artifacts-"));

    try {
      const approvalGate = runApprovalVerificationGate({
        commands: [
          'node -e "console.error(\'approval gate failure\'); process.exit(1)"',
        ],
        workingDirectory: process.cwd(),
        outputDir: artifactDir,
        round: 1,
      });
      const postFixVerification = runVerificationCommands({
        commands: ['node -e "console.log(\'post-fix verification\')"'],
        workingDirectory: process.cwd(),
        outputDir: artifactDir,
        round: 1,
      });

      const approvalArtifactPath =
        approvalGate.verification.results[0]?.artifactPath ?? null;
      const postFixArtifactPath =
        postFixVerification.results[0]?.artifactPath ?? null;

      expect(approvalArtifactPath).not.toBe(postFixArtifactPath);
      expect(approvalGate.approvalReview?.required_changes[0]?.source_refs).toEqual([
        approvalArtifactPath,
      ]);
      expect(
        readFileSync(join(artifactDir, approvalArtifactPath ?? ""), "utf8"),
      ).toContain("approval gate failure");
      expect(
        readFileSync(join(artifactDir, postFixArtifactPath ?? ""), "utf8"),
      ).toContain("post-fix verification");
    } finally {
      rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it("only translates explicit empty final-target collection into the placeholder snapshot", () => {
    expect(
      collectCurrentReviewTargetSnapshot({
        workingDirectory: process.cwd(),
        collectTargets: () => {
          throw new Error("No review targets found against HEAD.");
        },
      }),
    ).toMatchObject({
      diffText: "# No review targets remain against HEAD.\n",
      omittedTargets: [],
      isEmpty: true,
    });

    expect(() =>
      collectCurrentReviewTargetSnapshot({
        workingDirectory: process.cwd(),
        collectTargets: () => {
          throw new Error("fatal git index failure");
        },
      }),
    ).toThrow(/fatal git index failure/i);
  });

  it("normalizes working tree and commit range review target specs", () => {
    expect(normalizeReviewTargetSpec({})).toMatchObject({
      mode: "working_tree",
      label: "working tree diff against HEAD",
    });

    expect(
      normalizeReviewTargetSpec({
        baseRef: "origin/master",
        headRef: "HEAD",
      }),
    ).toMatchObject({
      mode: "commit_range",
      baseRef: "origin/master",
      headRef: "HEAD",
      rangeNotation: "...",
      label: "commit range origin/master...HEAD",
    });

    expect(() =>
      normalizeReviewTargetSpec({
        commitRange: "main..feature",
        baseRef: "main",
      }),
    ).toThrow(/use either --commit-range or --base-ref\/--head-ref/i);
  });

  it("writes run-local failure artifacts with machine-readable details", () => {
    const artifactDir = mkdtempSync(join(tmpdir(), "agent-review-failure-"));

    try {
      const summary = writeFailureArtifacts({
        outputDir: artifactDir,
        goal: "Review current diff",
        stage: "collect_review_targets",
        code: "all_review_targets_omitted",
        message: "All current review targets were omitted.",
        artifactPaths: {
          last_target: `${artifactDir}/targets/01-review-target.diff`,
        },
        details: {
          omittedTargets: [{ filePath: "large.txt", reason: "too large" }],
        },
      });

      expect(summary).toMatchObject({
        stage: "collect_review_targets",
        code: "all_review_targets_omitted",
      });

      const json = JSON.parse(
        readFileSync(join(artifactDir, "failure-summary.json"), "utf8"),
      );
      const markdown = readFileSync(
        join(artifactDir, "failure-summary.md"),
        "utf8",
      );

      expect(json).toMatchObject({
        stage: "collect_review_targets",
        code: "all_review_targets_omitted",
      });
      expect(markdown).toContain("Agent Review Loop Failure");
      expect(markdown).toContain("all_review_targets_omitted");
    } finally {
      rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it("builds final summary data with omitted review targets and nullable last fix", () => {
    const summary = buildReviewLoopSummary({
      goal: "Review current diff",
      finalStatus: "needs_revision",
      roundsCompleted: 2,
      currentTargetPath: "targets/current.diff",
      omittedReviewTargets: [
        {
          filePath: "large.txt",
          reason: "too large",
        },
      ],
      lastClaudeReview: normalizeReview("claude", {
        decision: "revise",
        summary: "One large file still needs manual review.",
        blocker_status: "non-blocker",
        required_changes: [
          {
            id: "manual-review",
            title: "Need manual review",
            details: "The large file was omitted from inline review.",
            file_path: "large.txt",
            line: null,
            source_refs: [],
          },
        ],
        recommended_changes: [],
        unresolved_questions: [],
      }),
      lastCodexReview: null,
      lastFix: null,
      lastVerification: {
        status: "skipped",
        results: [],
      },
      verifyCommands: [],
      agentConfig: {
        codex: {
          model: "gpt-5.4",
          modelSource: "resolved",
          effort: "xhigh",
          effortSource: "resolved",
        },
        claude: {
          model: "claude-sonnet-4-5-20250929",
          modelSource: "resolved",
          effort: "high",
          effortSource: "configured",
        },
      },
    });

    expect(summary).toMatchObject({
      last_fix: null,
      omitted_review_targets: [
        {
          filePath: "large.txt",
          reason: "too large",
        },
      ],
      verification_status: "skipped",
    });
  });

  it("downgrades approved status when omitted review targets remain", () => {
    expect(
      enforceOmittedTargetApprovalGate({
        finalStatus: "approved",
        omittedReviewTargets: [
          {
            filePath: "large.txt",
            reason: "too large",
          },
        ],
      }),
    ).toBe("needs_revision");

    expect(
      enforceOmittedTargetApprovalGate({
        finalStatus: "blocked",
        omittedReviewTargets: [
          {
            filePath: "large.txt",
            reason: "too large",
          },
        ],
      }),
    ).toBe("blocked");
  });

  it("keeps approved only when the final verification gate passes", () => {
    expect(
      evaluateFinalApprovalGate({
        finalStatus: "approved",
        omittedReviewTargets: [],
        verificationStatus: "skipped",
        verifyCommands: ["pnpm test -- agent-review-loop"],
      }),
    ).toMatchObject({
      status: "needs_revision",
      reasons: ["verification_status=skipped"],
    });

    expect(
      evaluateFinalApprovalGate({
        finalStatus: "approved",
        omittedReviewTargets: [],
        verificationStatus: "passed",
        verifyCommands: ["pnpm test -- agent-review-loop"],
      }),
    ).toMatchObject({
      status: "approved",
      reasons: [],
    });
  });

  it("preserves the last real agent review when a synthetic review is generated", () => {
    const realReview = normalizeReview("codex", {
      decision: "approve",
      summary: "Looks good.",
      blocker_status: "non-blocker",
      required_changes: [],
      recommended_changes: [],
      unresolved_questions: [],
    });
    const syntheticReview = normalizeReview("codex", {
      decision: "revise",
      summary: "Synthetic verification gate review.",
      blocker_status: "non-blocker",
      required_changes: [],
      recommended_changes: [],
      unresolved_questions: [],
    });

    expect(
      mergeStableAgentReview(realReview, syntheticReview, {
        synthetic: true,
      }),
    ).toBe(realReview);

    expect(
      mergeStableAgentReview(realReview, syntheticReview, {
        synthetic: false,
      }),
    ).toBe(syntheticReview);
  });
});
