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

  it("preserves the cluster when status is null and postmaster.pid is malformed", () => {
    const removeRoot = vi.fn();
    const command = vi.fn((_commandName: string, args: string[]) => {
      if (args.includes("status")) return { status: null };
      return { status: 1 };
    });

    expect(() => cleanupPlannerNutritionPostgresCluster({
      root: "/tmp/planner-nutrition-null-status",
      dataDirectory: "/tmp/planner-nutrition-null-status/data",
      pgCtlPath: "/postgres/bin/pg_ctl",
      lifecycleState: { startAttempted: true, started: false },
      command,
      pathExists: (target: string) => target.endsWith("data") || target.endsWith("postmaster.pid"),
      readText: () => "not-a-pid\n",
      isProcessAlive: vi.fn(),
      removeRoot,
    })).toThrow(
      "Planner nutrition PostgreSQL cleanup state could not be confirmed; data preserved at /tmp/planner-nutrition-null-status/data",
    );

    expect(command.mock.calls.map((call) => call[1])).toContainEqual([
      "-D", "/tmp/planner-nutrition-null-status/data", "-m", "fast", "-w", "stop",
    ]);
    expect(command.mock.calls.map((call) => call[1])).toContainEqual([
      "-D", "/tmp/planner-nutrition-null-status/data", "-m", "immediate", "-w", "stop",
    ]);
    expect(removeRoot).not.toHaveBeenCalled();
  });

  it("preserves the cluster when the status command errors and postmaster.pid is missing", () => {
    const removeRoot = vi.fn();
    const command = vi.fn((_commandName: string, args: string[]) => {
      if (args.includes("status")) throw new Error("spawn failed");
      return { status: 1 };
    });

    expect(() => cleanupPlannerNutritionPostgresCluster({
      root: "/tmp/planner-nutrition-status-error",
      dataDirectory: "/tmp/planner-nutrition-status-error/data",
      pgCtlPath: "/postgres/bin/pg_ctl",
      lifecycleState: { startAttempted: true, started: false },
      command,
      pathExists: (target: string) => target.endsWith("data"),
      readText: vi.fn(),
      isProcessAlive: vi.fn(),
      removeRoot,
    })).toThrow(
      "Planner nutrition PostgreSQL cleanup state could not be confirmed; data preserved at /tmp/planner-nutrition-status-error/data",
    );

    expect(command.mock.calls.map((call) => call[1])).toContainEqual([
      "-D", "/tmp/planner-nutrition-status-error/data", "-m", "fast", "-w", "stop",
    ]);
    expect(command.mock.calls.map((call) => call[1])).toContainEqual([
      "-D", "/tmp/planner-nutrition-status-error/data", "-m", "immediate", "-w", "stop",
    ]);
    expect(removeRoot).not.toHaveBeenCalled();
  });

  it("preserves the cluster for an unexpected status even when postmaster.pid is missing", () => {
    const removeRoot = vi.fn();
    const command = vi.fn((_commandName: string, args: string[]) => {
      if (args.includes("status")) return { status: 1 };
      return { status: 0 };
    });

    expect(() => cleanupPlannerNutritionPostgresCluster({
      root: "/tmp/planner-nutrition-unexpected-status",
      dataDirectory: "/tmp/planner-nutrition-unexpected-status/data",
      pgCtlPath: "/postgres/bin/pg_ctl",
      lifecycleState: { startAttempted: true, started: false },
      command,
      pathExists: (target: string) => target.endsWith("data"),
      readText: vi.fn(),
      isProcessAlive: vi.fn(),
      removeRoot,
    })).toThrow(
      "Planner nutrition PostgreSQL cleanup state could not be confirmed; data preserved at /tmp/planner-nutrition-unexpected-status/data",
    );

    expect(removeRoot).not.toHaveBeenCalled();
  });

  it("does not accept a numeric-prefix malformed postmaster.pid as proof of a stopped cluster", () => {
    const removeRoot = vi.fn();

    expect(() => cleanupPlannerNutritionPostgresCluster({
      root: "/tmp/planner-nutrition-malformed-pid",
      dataDirectory: "/tmp/planner-nutrition-malformed-pid/data",
      pgCtlPath: "/postgres/bin/pg_ctl",
      lifecycleState: { startAttempted: true, started: false },
      command: vi.fn(() => ({ status: 3 })),
      pathExists: (target: string) => target.endsWith("data") || target.endsWith("postmaster.pid"),
      readText: () => "4321garbage\n",
      isProcessAlive: () => false,
      removeRoot,
    })).toThrow(
      "Planner nutrition PostgreSQL cleanup state could not be confirmed; data preserved at /tmp/planner-nutrition-malformed-pid/data",
    );

    expect(removeRoot).not.toHaveBeenCalled();
  });

  it("removes a cluster only when status 3 and PID absence prove it is stopped", () => {
    const removeRoot = vi.fn();
    const command = vi.fn(() => ({ status: 3 }));

    cleanupPlannerNutritionPostgresCluster({
      root: "/tmp/planner-nutrition-stopped",
      dataDirectory: "/tmp/planner-nutrition-stopped/data",
      pgCtlPath: "/postgres/bin/pg_ctl",
      lifecycleState: { startAttempted: true, started: false },
      command,
      pathExists: (target: string) => target.endsWith("data"),
      readText: vi.fn(),
      isProcessAlive: vi.fn(),
      removeRoot,
    });

    expect(command).toHaveBeenCalledOnce();
    expect(command).toHaveBeenCalledWith("/postgres/bin/pg_ctl", [
      "-D", "/tmp/planner-nutrition-stopped/data", "status",
    ]);
    expect(removeRoot).toHaveBeenCalledWith("/tmp/planner-nutrition-stopped");
  });

  it("removes the temporary root before any cluster creation was attempted", () => {
    const removeRoot = vi.fn();
    const command = vi.fn();

    cleanupPlannerNutritionPostgresCluster({
      root: "/tmp/planner-nutrition-before-initdb",
      dataDirectory: "/tmp/planner-nutrition-before-initdb/data",
      pgCtlPath: "/postgres/bin/pg_ctl",
      lifecycleState: { startAttempted: false, started: false },
      command,
      pathExists: () => false,
      readText: vi.fn(),
      isProcessAlive: vi.fn(),
      removeRoot,
    });

    expect(command).not.toHaveBeenCalled();
    expect(removeRoot).toHaveBeenCalledWith("/tmp/planner-nutrition-before-initdb");
  });
});
