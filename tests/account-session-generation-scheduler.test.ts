import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TICK_SCRIPT = "scripts/account-maintenance-tick.mjs";
const INSTALL_SCRIPT = "scripts/account-maintenance-scheduler-install.mjs";
const VERIFY_SCRIPT = "scripts/account-maintenance-scheduler-verify.mjs";
const UNINSTALL_SCRIPT = "scripts/account-maintenance-scheduler-uninstall.mjs";
const PLIST_PATH = "ops/launchd/com.homecook.account-maintenance.plist.template";

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
      "/Users/tester/Library/Logs/homecook/account-maintenance.log",
    );
    expect(verification.launchd.standardErrorPath).toContain(
      "/Users/tester/Library/Logs/homecook/account-maintenance.err.log",
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
});
