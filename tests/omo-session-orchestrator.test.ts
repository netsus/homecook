import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  continueWorkItemSession,
  readWorkItemSessionStatus,
  resumePendingWorkItems,
  startWorkItemSession,
} from "../scripts/lib/omo-session-orchestrator.mjs";

function createFakeOpencodeBin(
  rootDir: string,
  name: string,
  options?: {
    exitCode?: number;
    sessionId?: string;
    stdout?: string[];
    stderr?: string;
  },
) {
  const binPath = join(rootDir, `${name}.sh`);
  const argsPath = join(rootDir, `${name}.args.log`);
  const exitCode = options?.exitCode ?? 0;
  const sessionId = options?.sessionId ?? `ses_${name}`;
  const stdout =
    options?.stdout ??
    [
      `{"type":"step_start","sessionID":"${sessionId}","part":{"type":"step-start"}}`,
      `{"type":"text","sessionID":"${sessionId}","part":{"type":"text","text":"OK"}}`,
      `{"type":"step_finish","sessionID":"${sessionId}","part":{"type":"step-finish","reason":"stop"}}`,
    ];
  const stderr = options?.stderr ?? "";

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" > \"$FAKE_OPENCODE_ARGS_PATH\"",
      ...stdout.map((line) => `printf '%s\\n' '${line}'`),
      stderr.length > 0 ? `printf '${stderr}\\n' >&2` : "",
      `exit ${exitCode}`,
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);

  return {
    binPath,
    argsPath,
  };
}

function seedProductWorkItem(rootDir: string, workItemId: string) {
  mkdirSync(join(rootDir, ".artifacts"), { recursive: true });
  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "workpacks", workItemId), { recursive: true });

  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "README.md"),
    `# ${workItemId}\n`,
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "acceptance.md"),
    `# ${workItemId} acceptance\n`,
  );

  writeFileSync(
    join(rootDir, ".workflow-v2", "status.json"),
    JSON.stringify(
      {
        version: 1,
        project_profile: "homecook",
        updated_at: "2026-03-26T00:00:00+09:00",
        items: [],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`),
    JSON.stringify(
      {
        id: workItemId,
        title: "Recipe like slice",
        project_profile: "homecook",
        change_type: "product",
        surface: "fullstack",
        risk: "medium",
        preset: "vertical-slice-strict",
        goal: "Pilot the OMO session orchestrator on a product slice.",
        owners: {
          claude: "sparse-review-and-approval",
          codex: "implementation-and-integration",
          workers: ["testing"],
        },
        docs_refs: {
          source_of_truth: ["AGENTS.md"],
          governing_docs: ["docs/engineering/workflow-v2/omo-lite-supervisor-spec.md"],
        },
        workflow: {
          plan_loop: "recommended",
          review_loop: "required",
          external_smokes: [],
        },
        verification: {
          required_checks: ["pnpm validate:workflow-v2"],
          verify_commands: ["pnpm validate:workflow-v2"],
        },
        status: {
          lifecycle: "planned",
          approval_state: "not_started",
          verification_status: "pending",
        },
      },
      null,
      2,
    ),
  );
}

function createOrchestratorFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-session-orchestrator-"));

  seedProductWorkItem(rootDir, "03-recipe-like");

  return rootDir;
}

describe("OMO session orchestrator", () => {
  it("reuses Claude and Codex sessions across Stage 1-4 progression", () => {
    const rootDir = createOrchestratorFixture();
    const stage1 = createFakeOpencodeBin(rootDir, "stage1", {
      sessionId: "ses_claude_primary",
    });
    const stage2 = createFakeOpencodeBin(rootDir, "stage2", {
      sessionId: "ses_codex_primary",
    });
    const stage3 = createFakeOpencodeBin(rootDir, "stage3", {
      sessionId: "ses_claude_primary",
    });
    const stage4 = createFakeOpencodeBin(rootDir, "stage4", {
      sessionId: "ses_codex_primary",
    });

    const first = startWorkItemSession({
      rootDir,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: stage1.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage1.argsPath,
      },
      now: "2026-03-26T21:00:00+09:00",
    });
    const second = continueWorkItemSession({
      rootDir,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: stage2.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage2.argsPath,
      },
      now: "2026-03-26T21:10:00+09:00",
    });
    const third = continueWorkItemSession({
      rootDir,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: stage3.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage3.argsPath,
      },
      now: "2026-03-26T21:20:00+09:00",
    });
    const fourth = continueWorkItemSession({
      rootDir,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: stage4.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage4.argsPath,
      },
      now: "2026-03-26T21:30:00+09:00",
    });

    const stage3Args = readFileSync(stage3.argsPath, "utf8");
    const stage4Args = readFileSync(stage4.argsPath, "utf8");
    const status = readWorkItemSessionStatus({
      rootDir,
      workItemId: "03-recipe-like",
    });

    expect(first.stage).toBe(1);
    expect(second.stage).toBe(2);
    expect(third.stage).toBe(3);
    expect(fourth.stage).toBe(4);
    expect(stage3Args).toContain("--session");
    expect(stage3Args).toContain("ses_claude_primary");
    expect(stage4Args).toContain("--session");
    expect(stage4Args).toContain("ses_codex_primary");
    expect(status.runtime).toMatchObject({
      current_stage: 4,
      last_completed_stage: 4,
      blocked_stage: null,
      sessions: {
        claude_primary: {
          session_id: "ses_claude_primary",
        },
        codex_primary: {
          session_id: "ses_codex_primary",
        },
      },
    });
  });

  it("resumes due blocked stages from the stored Claude session", () => {
    const rootDir = createOrchestratorFixture();
    const resumeRun = createFakeOpencodeBin(rootDir, "resume", {
      sessionId: "ses_claude_primary",
    });

    mkdirSync(join(rootDir, ".opencode", "omo-runtime"), { recursive: true });
    writeFileSync(
      join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"),
      JSON.stringify(
        {
          version: 1,
          work_item_id: "03-recipe-like",
          slice: "03-recipe-like",
          repo_root: rootDir,
          current_stage: 3,
          last_completed_stage: 2,
          blocked_stage: 3,
          sessions: {
            claude_primary: {
              session_id: "ses_claude_primary",
              agent: "athena",
              updated_at: "2026-03-26T12:00:00.000Z",
            },
            codex_primary: {
              session_id: "ses_codex_primary",
              agent: "hephaestus",
              updated_at: "2026-03-26T11:00:00.000Z",
            },
          },
          retry: {
            at: "2026-03-26T17:00:00.000Z",
            reason: "claude_budget_unavailable",
            attempt_count: 1,
            max_attempts: 3,
          },
          last_artifact_dir: null,
          lock: null,
        },
        null,
        2,
      ),
    );

    const resumed = resumePendingWorkItems({
      rootDir,
      mode: "execute",
      opencodeBin: resumeRun.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: resumeRun.argsPath,
      },
      now: "2026-03-27T03:00:00+09:00",
    });
    const status = readWorkItemSessionStatus({
      rootDir,
      workItemId: "03-recipe-like",
    });
    const args = readFileSync(resumeRun.argsPath, "utf8");

    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toMatchObject({
      workItemId: "03-recipe-like",
      stage: 3,
    });
    expect(args).toContain("--session");
    expect(args).toContain("ses_claude_primary");
    expect(status.runtime).toMatchObject({
      current_stage: 3,
      last_completed_stage: 3,
      blocked_stage: null,
      retry: null,
    });
  });
});
