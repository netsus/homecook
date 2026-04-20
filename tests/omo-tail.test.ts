import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildOperatorTailSnapshot,
  formatOperatorTailSnapshot,
  readLogTail,
  toSerializableOperatorTailSnapshot,
} from "../scripts/lib/omo-tail.mjs";

describe("OMO operator tail", () => {
  it("reads only the last requested log lines", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-tail-"));
    const logPath = join(rootDir, "omo.log");
    writeFileSync(logPath, ["line-1", "line-2", "line-3", "line-4"].join("\n"));

    const tail = readLogTail(logPath, { lines: 2 });

    expect(tail).toMatchObject({
      exists: true,
      lineCount: 4,
      truncated: true,
      lines: ["line-3", "line-4"],
    });
  });

  it("combines status, scheduler, and log tails into one snapshot", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "omo-tail-home-"));
    const logDir = join(homeDir, "Library", "Logs", "homecook");
    mkdirSync(logDir, { recursive: true });
    const stdoutLog = join(logDir, "omo-tick-07-meal-manage.log");
    const stderrLog = join(logDir, "omo-tick-07-meal-manage.err.log");
    writeFileSync(stdoutLog, ["tick-1", "tick-2", "tick-3"].join("\n"));
    writeFileSync(stderrLog, "warn-1\nwarn-2\n");

    const snapshot = buildOperatorTailSnapshot({
      rootDir: "/repo/homecook",
      workItemId: "07-meal-manage",
      homeDir,
      lines: 2,
      readStatus: () => ({
        workItemId: "07-meal-manage",
        slice: "07-meal-manage",
        trackedWorkItem: null,
        trackedStatus: null,
        runtime: {
          current_stage: 4,
          last_completed_stage: 3,
          phase: "stage_running",
          next_action: "run_stage",
          workspace: {
            branch_role: "frontend",
          },
          prs: {
            backend: null,
            frontend: null,
            closeout: null,
          },
          lock: {
            owner: "omo-supervisor-77",
          },
        },
        operatorGuidance: {
          reasonCode: null,
          remediationState: null,
          validatorName: null,
          failurePath: null,
          artifactPath: null,
          nextRecommendation: "artifact/log를 먼저 확인하세요.",
        },
        runtimeObservability: {
          status: "running_live",
          detail: "lock held by omo-supervisor-77 for 5m",
          subphase: "implementation",
          lastActivityAge: "1m",
          lastActivitySource: "sessions.claude_primary.updated_at",
          sessionFreshness: "fresh",
          sessionAge: "1m",
          executionFreshness: "running",
          executionAge: "5m",
          retryAt: null,
          lockAge: "5m",
          waitAge: null,
        },
      }),
      readSchedulerSnapshot: () => ({
        workItem: "07-meal-manage",
        label: "ai.homecook.omo.tick.07-meal-manage",
        loaded: true,
        runningNow: false,
        state: "waiting",
        runs: 3,
        lastExitCode: 0,
        intervalSeconds: 600,
        stdoutLog,
        stderrLog,
        stdoutUpdatedAt: new Date("2026-04-20T12:00:00.000Z"),
        stderrUpdatedAt: new Date("2026-04-20T11:59:00.000Z"),
        lastActivityAt: new Date("2026-04-20T12:00:00.000Z"),
        error: null,
      }),
    });

    expect(snapshot.logs.stdout.lines).toEqual(["tick-2", "tick-3"]);
    expect(snapshot.logs.stderr.lines).toEqual(["warn-1", "warn-2"]);
    expect(toSerializableOperatorTailSnapshot(snapshot)).toMatchObject({
      workItemId: "07-meal-manage",
      scheduler: {
        loaded: true,
        intervalSeconds: 600,
      },
      logs: {
        stdout: {
          lineCount: 3,
          truncated: true,
        },
      },
    });
    expect(formatOperatorTailSnapshot(snapshot)).toContain("== Status ==");
    expect(formatOperatorTailSnapshot(snapshot)).toContain("runtimeSignal   : running_live");
    expect(formatOperatorTailSnapshot(snapshot)).toContain("== Scheduler ==");
    expect(formatOperatorTailSnapshot(snapshot)).toContain("== stdout tail ==");
    expect(formatOperatorTailSnapshot(snapshot)).toContain("tick-3");
  });

  it("falls back to default log paths when scheduler inspection is unavailable", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "omo-tail-home-"));
    const snapshot = buildOperatorTailSnapshot({
      rootDir: "/repo/homecook",
      workItemId: "07-meal-manage",
      homeDir,
      readStatus: () => ({
        workItemId: "07-meal-manage",
        slice: "07-meal-manage",
        trackedWorkItem: null,
        trackedStatus: null,
        runtime: {
          current_stage: 1,
          last_completed_stage: 0,
          phase: "wait",
          next_action: "noop",
          workspace: {
            branch_role: "docs",
          },
          prs: {
            backend: null,
            frontend: null,
            closeout: null,
          },
        },
        operatorGuidance: {
          reasonCode: "human_intervention_required",
          remediationState: "blocked",
          validatorName: null,
          failurePath: null,
          artifactPath: null,
          nextRecommendation: "human-only blocker를 해소하세요.",
        },
        runtimeObservability: {
          status: "blocked_human",
          detail: "human wait for 15m",
          subphase: null,
          lastActivityAge: "15m",
          lastActivitySource: "wait.updated_at",
          sessionFreshness: "missing",
          sessionAge: null,
          executionFreshness: "idle",
          executionAge: null,
          retryAt: null,
          lockAge: null,
          waitAge: "15m",
        },
      }),
      readSchedulerSnapshot: () => {
        throw new Error("Current platform does not support launchctl gui user inspection.");
      },
    });

    expect(snapshot.scheduler).toBeNull();
    expect(snapshot.schedulerError).toContain("launchctl");
    expect(snapshot.logs.stdout.exists).toBe(false);
    expect(formatOperatorTailSnapshot(snapshot)).toContain(
      "error           : Current platform does not support launchctl gui user inspection.",
    );
  });
});
