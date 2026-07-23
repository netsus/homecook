import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

const SERVICE_PATH = "lib/account-maintenance/tick.ts";
const ROUTE_PATH = "app/internal/account-maintenance/tick/route.ts";

type PhaseName =
  | "scanner"
  | "terminal_tombstone_scan"
  | "quarantine_recheck"
  | "normal_drain"
  | "expected_owner_signal_union_zero"
  | "auth_delete"
  | "complete";

interface TickDependencies {
  scanner?: () => Promise<void>;
  terminalTombstoneScan?: () => Promise<void>;
  quarantineRecheck?: () => Promise<void>;
  normalDrain?: () => Promise<void>;
  expectedOwnerSignalUnionZero?: () => Promise<{
    available: boolean;
    unionZero: boolean;
  }>;
  authDelete?: () => Promise<void>;
  complete?: () => Promise<void>;
  jointActivationReady?: boolean;
}

interface TickResult {
  featureState: "feature_off" | "joint_activation_ready";
  status: "blocked" | "completed" | "failed";
  blockedAt: PhaseName | null;
  phases: Array<{
    phase: PhaseName;
    status: "blocked" | "completed" | "failed" | "feature_off";
  }>;
}

interface TickModule {
  ACCOUNT_MAINTENANCE_PHASES: readonly PhaseName[];
  isMaintenanceWorkerAuthorized(
    authorizationHeader: string | null,
    configuredSecret: string | undefined,
  ): boolean;
  runAccountMaintenanceTick(dependencies?: TickDependencies): Promise<TickResult>;
}

async function importTickModule() {
  return (await import("@/lib/account-maintenance/tick")) as unknown as TickModule;
}

async function importTickRoute() {
  return import("@/app/internal/account-maintenance/tick/route");
}

describe("account maintenance tick internal endpoint", () => {
  afterEach(() => {
    delete process.env.HOMECOOK_MAINTENANCE_WORKER_SECRET;
    vi.restoreAllMocks();
  });

  it("provides the internal route and feature-off service modules", () => {
    expect(existsSync(SERVICE_PATH)).toBe(true);
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  it("declares the official ordered maintenance phases", async () => {
    const tick = await importTickModule();

    expect(tick.ACCOUNT_MAINTENANCE_PHASES).toEqual([
      "scanner",
      "terminal_tombstone_scan",
      "quarantine_recheck",
      "normal_drain",
      "expected_owner_signal_union_zero",
      "auth_delete",
      "complete",
    ]);
  });

  it("uses constant-time comparison and accepts only the exact worker Bearer secret", async () => {
    const tick = await importTickModule();
    const source = await readFile(SERVICE_PATH, "utf8");
    const configuredSecret = "maintenance-secret-with-high-entropy-1234567890";

    expect(source).toContain("timingSafeEqual");
    expect(
      tick.isMaintenanceWorkerAuthorized(
        `Bearer ${configuredSecret}`,
        configuredSecret,
      ),
    ).toBe(true);
    expect(
      tick.isMaintenanceWorkerAuthorized(
        "Bearer maintenance-secret-with-high-entropy-xxxxxxxxxx",
        configuredSecret,
      ),
    ).toBe(false);
    expect(
      tick.isMaintenanceWorkerAuthorized("Bearer short", configuredSecret),
    ).toBe(false);
    expect(
      tick.isMaintenanceWorkerAuthorized(
        `Basic ${configuredSecret}`,
        configuredSecret,
      ),
    ).toBe(false);
    expect(
      tick.isMaintenanceWorkerAuthorized(null, configuredSecret),
    ).toBe(false);
    expect(
      tick.isMaintenanceWorkerAuthorized(
        `Bearer ${configuredSecret}`,
        undefined,
      ),
    ).toBe(false);
  });

  it("runs the seven phases in order only after explicit joint activation evidence", async () => {
    const tick = await importTickModule();
    const calls: PhaseName[] = [];

    const result = await tick.runAccountMaintenanceTick({
      scanner: async () => {
        calls.push("scanner");
      },
      terminalTombstoneScan: async () => {
        calls.push("terminal_tombstone_scan");
      },
      quarantineRecheck: async () => {
        calls.push("quarantine_recheck");
      },
      normalDrain: async () => {
        calls.push("normal_drain");
      },
      expectedOwnerSignalUnionZero: async () => {
        calls.push("expected_owner_signal_union_zero");
        return { available: true, unionZero: true };
      },
      authDelete: async () => {
        calls.push("auth_delete");
      },
      complete: async () => {
        calls.push("complete");
      },
      jointActivationReady: true,
    });

    expect(calls).toEqual(tick.ACCOUNT_MAINTENANCE_PHASES);
    expect(result.status).toBe("completed");
    expect(result.blockedAt).toBeNull();
  });

  it("does not call Auth delete or complete without Storage owner-signal evidence", async () => {
    const tick = await importTickModule();
    const authDelete = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);

    const result = await tick.runAccountMaintenanceTick({
      scanner: async () => undefined,
      terminalTombstoneScan: async () => undefined,
      quarantineRecheck: async () => undefined,
      normalDrain: async () => undefined,
      expectedOwnerSignalUnionZero: async () => ({
        available: false,
        unionZero: false,
      }),
      authDelete,
      complete,
      jointActivationReady: true,
    });

    expect(result).toMatchObject({
      featureState: "feature_off",
      status: "blocked",
      blockedAt: "expected_owner_signal_union_zero",
    });
    expect(authDelete).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("does not accept owner-signal evidence when an earlier Storage phase is unavailable", async () => {
    const tick = await importTickModule();
    const authDelete = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);

    const result = await tick.runAccountMaintenanceTick({
      expectedOwnerSignalUnionZero: async () => ({
        available: true,
        unionZero: true,
      }),
      authDelete,
      complete,
      jointActivationReady: true,
    });

    expect(result).toMatchObject({
      featureState: "feature_off",
      status: "blocked",
      blockedAt: "scanner",
    });
    expect(authDelete).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("keeps Auth delete and complete feature-off before the joint activation gate", async () => {
    const tick = await importTickModule();
    const authDelete = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);

    const result = await tick.runAccountMaintenanceTick({
      scanner: async () => undefined,
      terminalTombstoneScan: async () => undefined,
      quarantineRecheck: async () => undefined,
      normalDrain: async () => undefined,
      expectedOwnerSignalUnionZero: async () => ({
        available: true,
        unionZero: true,
      }),
      authDelete,
      complete,
    });

    expect(result).toMatchObject({
      featureState: "feature_off",
      status: "blocked",
      blockedAt: "auth_delete",
    });
    expect(authDelete).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("stops on the first failed phase without exposing the thrown detail", async () => {
    const tick = await importTickModule();
    const authDelete = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);

    const result = await tick.runAccountMaintenanceTick({
      scanner: async () => {
        throw new Error("sensitive-storage-detail");
      },
      authDelete,
      complete,
      jointActivationReady: true,
    });

    expect(result).toMatchObject({
      status: "failed",
      blockedAt: "scanner",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive-storage-detail");
    expect(authDelete).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("rejects missing or wrong worker secrets without accepting a browser session", async () => {
    process.env.HOMECOOK_MAINTENANCE_WORKER_SECRET =
      "maintenance-secret-with-high-entropy-1234567890";
    const route = await importTickRoute();

    for (const authorization of [
      null,
      "Bearer browser-session-token",
      "Basic maintenance-secret-with-high-entropy-1234567890",
    ]) {
      const headers = new Headers({
        cookie: "sb-access-token=browser-session-token",
      });
      if (authorization) {
        headers.set("authorization", authorization);
      }

      const response = await route.POST(
        new Request("http://localhost:3000/internal/account-maintenance/tick", {
          method: "POST",
          headers,
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toMatchObject({
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED" },
      });
      expect(JSON.stringify(body)).not.toContain(
        process.env.HOMECOOK_MAINTENANCE_WORKER_SECRET,
      );
    }

    expect("GET" in route).toBe(false);
  });

  it("returns a secret-free feature-off result for the authorized F0 worker", async () => {
    const workerSecret =
      "maintenance-secret-with-high-entropy-1234567890";
    process.env.HOMECOOK_MAINTENANCE_WORKER_SECRET = workerSecret;
    const route = await importTickRoute();

    const response = await route.POST(
      new Request("http://localhost:3000/internal/account-maintenance/tick", {
        method: "POST",
        headers: { authorization: `Bearer ${workerSecret}` },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        feature_state: "feature_off",
        status: "blocked",
      },
      error: null,
    });
    expect(body.data.phases).toHaveLength(7);
    expect(JSON.stringify(body)).not.toContain(workerSecret);
  });

  it("fails closed when the server worker secret is not configured", async () => {
    const route = await importTickRoute();

    const response = await route.POST(
      new Request("http://localhost:3000/internal/account-maintenance/tick", {
        method: "POST",
        headers: { authorization: "Bearer any-candidate" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
  });
});
