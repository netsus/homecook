import { describe, expect, it, vi } from "vitest";

import {
  cleanupPlannerNutritionPostgresCluster,
  runPlannerNutritionPostgresLifecycle,
} from "../scripts/lib/planner-nutrition-postgres-lifecycle.mjs";

describe("planner nutrition PostgreSQL runner lifecycle", () => {
  it("cleans the temporary root when port reservation fails", async () => {
    const cleanup = vi.fn();

    await expect(runPlannerNutritionPostgresLifecycle({
      createRoot: () => "/tmp/planner-nutrition-reserve-failure",
      reservePort: async () => {
        throw new Error("reserve failed");
      },
      run: vi.fn(),
      cleanup,
    })).rejects.toThrow("reserve failed");

    expect(cleanup).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledWith({
      root: "/tmp/planner-nutrition-reserve-failure",
      state: { startAttempted: false, started: false },
    });
  });

  it("falls back to immediate stop when fast stop fails, then removes a stopped cluster", () => {
    let alive = true;
    const removed: string[] = [];
    const command = vi.fn((_commandName: string, args: string[]) => {
      if (args.includes("status")) return { status: alive ? 0 : 3 };
      if (args.includes("fast")) return { status: 1 };
      if (args.includes("immediate")) {
        alive = false;
        return { status: 0 };
      }
      throw new Error(`unexpected pg_ctl args: ${args.join(" ")}`);
    });

    cleanupPlannerNutritionPostgresCluster({
      root: "/tmp/planner-nutrition-fast-failure",
      dataDirectory: "/tmp/planner-nutrition-fast-failure/data",
      pgCtlPath: "/postgres/bin/pg_ctl",
      command,
      pathExists: (target: string) => target.endsWith("data") || target.endsWith("postmaster.pid"),
      readText: () => "4321\n",
      isProcessAlive: () => alive,
      removeRoot: (target: string) => {
        removed.push(target);
      },
    });

    expect(command.mock.calls.map((call) => call[1])).toContainEqual([
      "-D", "/tmp/planner-nutrition-fast-failure/data", "-m", "fast", "-w", "stop",
    ]);
    expect(command.mock.calls.map((call) => call[1])).toContainEqual([
      "-D", "/tmp/planner-nutrition-fast-failure/data", "-m", "immediate", "-w", "stop",
    ]);
    expect(removed).toEqual(["/tmp/planner-nutrition-fast-failure"]);
  });

  it("fails clearly and preserves the data directory when PostgreSQL survives both stop modes", () => {
    const removeRoot = vi.fn();
    const command = vi.fn((_commandName: string, args: string[]) => {
      if (args.includes("status")) return { status: 0 };
      return { status: 1 };
    });

    expect(() => cleanupPlannerNutritionPostgresCluster({
      root: "/tmp/planner-nutrition-stuck",
      dataDirectory: "/tmp/planner-nutrition-stuck/data",
      pgCtlPath: "/postgres/bin/pg_ctl",
      command,
      pathExists: (target: string) => target.endsWith("data") || target.endsWith("postmaster.pid"),
      readText: () => "9876\n",
      isProcessAlive: () => true,
      removeRoot,
    })).toThrow(
      "Planner nutrition PostgreSQL cleanup failed; live cluster data preserved at /tmp/planner-nutrition-stuck/data",
    );

    expect(command.mock.calls.map((call) => call[1])).toContainEqual([
      "-D", "/tmp/planner-nutrition-stuck/data", "-m", "immediate", "-w", "stop",
    ]);
    expect(removeRoot).not.toHaveBeenCalled();
  });
});
