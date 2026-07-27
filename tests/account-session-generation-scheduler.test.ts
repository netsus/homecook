import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  appendAccountMaintenanceJsonLog,
  evaluateAccountMaintenanceHealth,
  getAccountMaintenanceVerificationStatus,
  recordAccountMaintenanceTickOutcome,
} from "../scripts/lib/account-maintenance-scheduler.mjs";

const TICK_SCRIPT = "scripts/account-maintenance-tick.mjs";
const INSTALL_SCRIPT = "scripts/account-maintenance-scheduler-install.mjs";
const VERIFY_SCRIPT = "scripts/account-maintenance-scheduler-verify.mjs";
const UNINSTALL_SCRIPT = "scripts/account-maintenance-scheduler-uninstall.mjs";
const PLIST_PATH = "ops/launchd/com.homecook.account-maintenance.plist.template";
const PACKAGE_PATH = "package.json";

describe("account session generation scheduler skeleton", () => {
  it("ships a launchd skeleton plist with 300 second cadence and feature-off entrypoint", () => {
    expect(existsSync(PLIST_PATH)).toBe(true);

    const rendered = execFileSync(
      process.execPath,
      [VERIFY_SCRIPT, "--dry-run", "--home-dir", "/Users/tester", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const verification = JSON.parse(rendered);

    expect(verification.ok).toBe(true);
    expect(verification.launchd.label).toBe("com.homecook.account-maintenance");
    expect(verification.launchd.runAtLoad).toBe(true);
    expect(verification.launchd.startIntervalSeconds).toBe(300);
    expect(verification.launchd.programArguments).toContain("scripts/account-maintenance-tick.mjs");
    expect(verification.launchd.standardOutPath).toContain(
      "/Users/tester/Library/Logs/Homecook/account-maintenance.log",
    );
    expect(verification.launchd.standardErrorPath).toContain(
      "/Users/tester/Library/Logs/Homecook/account-maintenance.err.log",
    );
    expect(verification.launchd.secretInstall).toBe("manual-only");
  });

  it("keeps the tick runner secret-free in dry-run while declaring the ordered maintenance phases", () => {
    expect(existsSync(TICK_SCRIPT)).toBe(true);

    const rendered = execFileSync(
      process.execPath,
      [TICK_SCRIPT, "--dry-run", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const tick = JSON.parse(rendered);

    expect(tick.ok).toBe(true);
    expect(tick.dryRun).toBe(true);
    expect(tick.featureState).toBe("dark-ship-legacy");
    expect(tick.liveMode.enabled).toBe(false);
    expect(tick.liveMode.activationGate).toBe("#3-joint-activation");
    expect(tick.secret.loaded).toBe(false);
    expect(tick.secret.policy).toBe("manual-only");
    expect(tick.heartbeatSeconds).toBe(900);
    expect(tick.alertThresholds.consecutiveFailures).toBe(3);
    expect(tick.alertThresholds.oldestPendingAgeSeconds).toBe(900);
    expect(tick.logRotation.maxBytes).toBe(10 * 1024 * 1024);
    expect(tick.logRotation.maxFiles).toBe(5);
    expect(tick.phases).toEqual([
      "scanner",
      "terminal_tombstone_scan",
      "quarantine_recheck",
      "normal_drain",
      "expected_owner_signal_union_zero",
      "auth_delete",
      "complete",
    ]);
  });

  it("verifies the dry-run scheduler contract without invoking launchctl or a live secret", () => {
    const rendered = execFileSync(
      process.execPath,
      [VERIFY_SCRIPT, "--dry-run", "--home-dir", "/Users/tester", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const verification = JSON.parse(rendered);

    expect(verification.ok).toBe(true);
    expect(verification.dryRun).toBe(true);
    expect(verification.checkedLaunchctl).toBe(false);
    expect(verification.checkedLiveSecret).toBe(false);
    expect(verification.tickDryRun.featureState).toBe("dark-ship-legacy");
    expect(verification.tickDryRun.phases).toEqual([
      "scanner",
      "terminal_tombstone_scan",
      "quarantine_recheck",
      "normal_drain",
      "expected_owner_signal_union_zero",
      "auth_delete",
      "complete",
    ]);
    expect(verification.manualOnly).toEqual([
      "launchd_install",
      "production_secret",
      "live_tick_route",
    ]);
    expect(verification.releaseReadiness).toEqual({
      ready: false,
      verified: [
        "launchd_contract",
        "local_observability_primitives",
      ],
      blockers: [
        "actual_launchd_install",
        "production_secret",
        "power_login_sleep",
        "live_tick_log_wiring",
        "external_heartbeat",
        "external_alert_delivery",
        "cleanup_target",
        "next_tick_recovery",
      ],
    });
  });

  it("fails closed when release readiness is required before Manual Only evidence exists", () => {
    const result = spawnSync(
      process.execPath,
      [
        VERIFY_SCRIPT,
        "--dry-run",
        "--require-release-ready",
        "--home-dir",
        "/Users/tester",
        "--json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      releaseReadiness: {
        ready: false,
        blockers: expect.arrayContaining([
          "actual_launchd_install",
          "production_secret",
          "live_tick_log_wiring",
          "external_heartbeat",
        ]),
      },
    });

    const humanReadableResult = spawnSync(
      process.execPath,
      [
        VERIFY_SCRIPT,
        "--dry-run",
        "--require-release-ready",
        "--home-dir",
        "/Users/tester",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(humanReadableResult.status).toBe(1);
    expect(humanReadableResult.stdout.split("\n")[0]).toBe(
      "Account maintenance scheduler verify: blocked",
    );
    expect(humanReadableResult.stdout).not.toContain(
      "Account maintenance scheduler verify: pass",
    );
  });

  it("distinguishes a broken scheduler contract from a blocked release gate", () => {
    expect(
      getAccountMaintenanceVerificationStatus({
        contractOk: true,
        requireReleaseReady: false,
        releaseReady: false,
      }),
    ).toBe("pass");
    expect(
      getAccountMaintenanceVerificationStatus({
        contractOk: true,
        requireReleaseReady: true,
        releaseReady: false,
      }),
    ).toBe("blocked");
    expect(
      getAccountMaintenanceVerificationStatus({
        contractOk: false,
        requireReleaseReady: false,
        releaseReady: false,
      }),
    ).toBe("fail");
    expect(
      getAccountMaintenanceVerificationStatus({
        contractOk: false,
        requireReleaseReady: true,
        releaseReady: true,
      }),
    ).toBe("fail");
  });

  it("exposes an explicit package-level release gate that remains blocked before live evidence", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));

    expect(
      packageJson.scripts["account-maintenance:scheduler:verify-release"],
    ).toBe(
      "node scripts/account-maintenance-scheduler-verify.mjs --dry-run --require-release-ready",
    );

    const result = spawnSync(
      "pnpm",
      [
        "--silent",
        "account-maintenance:scheduler:verify-release",
        "--",
        "--home-dir",
        "/Users/tester",
        "--json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      releaseReadiness: {
        ready: false,
      },
    });
  });

  it("keeps install and uninstall as explicit dry-run-only Manual Only surfaces", () => {
    expect(existsSync(INSTALL_SCRIPT)).toBe(true);
    expect(existsSync(UNINSTALL_SCRIPT)).toBe(true);

    for (const script of [INSTALL_SCRIPT, UNINSTALL_SCRIPT]) {
      const rendered = execFileSync(
        process.execPath,
        [script, "--dry-run", "--home-dir", "/Users/tester", "--json"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
        },
      );
      const result = JSON.parse(rendered);

      expect(result.ok).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.checkedLaunchctl).toBe(false);
      expect(result.manualOnly).toBe(true);
      expect(result.target).toBe(
        "/Users/tester/Library/LaunchAgents/com.homecook.account-maintenance.plist",
      );
    }
  });

  it("fails local health on the exact consecutive-failure, oldest-due and dead-letter thresholds", () => {
    expect(
      evaluateAccountMaintenanceHealth({
        consecutiveFailures: 2,
        oldestPendingAgeSeconds: 900,
        deadLetterCount: 0,
      }),
    ).toEqual({
      ok: true,
      alerts: [],
    });

    expect(
      evaluateAccountMaintenanceHealth({
        consecutiveFailures: 3,
        oldestPendingAgeSeconds: 901,
        deadLetterCount: 1,
      }),
    ).toEqual({
      ok: false,
      alerts: [
        "consecutive_failures",
        "oldest_pending_overdue",
        "dead_letter_present",
      ],
    });
  });

  it("resets consecutive failures and records recovery on the next successful tick", () => {
    const failed = recordAccountMaintenanceTickOutcome({
      previousConsecutiveFailures: 2,
      succeeded: false,
      oldestPendingAgeSeconds: 0,
      deadLetterCount: 0,
    });
    const recovered = recordAccountMaintenanceTickOutcome({
      previousConsecutiveFailures: failed.consecutiveFailures,
      succeeded: true,
      oldestPendingAgeSeconds: 0,
      deadLetterCount: 0,
    });

    expect(failed).toMatchObject({
      consecutiveFailures: 3,
      recovered: false,
      health: {
        ok: false,
        alerts: ["consecutive_failures"],
      },
    });
    expect(recovered).toEqual({
      consecutiveFailures: 0,
      recovered: true,
      health: {
        ok: true,
        alerts: [],
      },
    });
  });

  it("writes JSON lines and rotates the local log within the configured retained-file bound", () => {
    const directory = mkdtempSync(join(tmpdir(), "homecook-maintenance-"));
    const logPath = join(directory, "account-maintenance.jsonl");

    try {
      for (let index = 0; index < 8; index += 1) {
        appendAccountMaintenanceJsonLog({
          logPath,
          entry: {
            event: "tick",
            index,
            detail: "x".repeat(40),
          },
          maxBytes: 120,
          maxFiles: 2,
        });
      }

      expect(existsSync(logPath)).toBe(true);
      expect(existsSync(`${logPath}.1`)).toBe(true);
      expect(existsSync(`${logPath}.2`)).toBe(true);
      expect(existsSync(`${logPath}.3`)).toBe(false);

      for (const path of [logPath, `${logPath}.1`, `${logPath}.2`]) {
        for (const line of readFileSync(path, "utf8").trim().split("\n")) {
          expect(() => JSON.parse(line)).not.toThrow();
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
