import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  appendAccountMaintenanceJsonLog,
  buildAccountMaintenanceLocalSchedulerVerification,
  evaluateAccountMaintenanceHealth,
  getAccountMaintenanceVerificationStatus,
  recordAccountMaintenanceTickOutcome,
} from "../scripts/lib/account-maintenance-scheduler.mjs";
import {
  ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT,
  ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
  loadAccountMaintenanceSecretFromKeychain,
  runAccountMaintenanceLiveTick,
} from "../scripts/lib/account-maintenance-live.mjs";
import { installAccountMaintenanceLaunchd } from "../scripts/lib/account-maintenance-scheduler-manual.mjs";
import { installAccountMaintenanceLocalLaunchd } from "../scripts/lib/account-maintenance-scheduler-local.mjs";
import { rotateAccountMaintenanceSecret } from "../scripts/lib/account-maintenance-secret-rotation.mjs";

const TICK_SCRIPT = "scripts/account-maintenance-tick.mjs";
const INSTALL_SCRIPT = "scripts/account-maintenance-scheduler-install.mjs";
const LOCAL_INSTALL_SCRIPT = "scripts/account-maintenance-local-scheduler-install.mjs";
const LOCAL_VERIFY_SCRIPT = "scripts/account-maintenance-local-scheduler-verify.mjs";
const VERIFY_SCRIPT = "scripts/account-maintenance-scheduler-verify.mjs";
const UNINSTALL_SCRIPT = "scripts/account-maintenance-scheduler-uninstall.mjs";
const PLIST_PATH = "ops/launchd/com.homecook.account-maintenance.plist.template";
const PACKAGE_PATH = "package.json";

describe("account session generation scheduler skeleton", () => {
  it("loads the worker secret from the dedicated Keychain item without exposing it", () => {
    const secret = "test-only-secret-that-must-never-appear-in-results-1234567890";
    const execFile = vi.fn(() => secret);

    const loaded = loadAccountMaintenanceSecretFromKeychain({
      execFile: execFile as never,
    });

    expect(loaded).toBe(secret);
    expect(execFile).toHaveBeenCalledWith(
      "/usr/bin/swift",
      [
        "-e",
        expect.stringContaining("SecItemCopyMatching"),
      ],
      expect.objectContaining({
        encoding: "utf8",
        env: expect.objectContaining({
          HOMECOOK_KEYCHAIN_SERVICE:
            ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
          HOMECOOK_KEYCHAIN_ACCOUNT:
            ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT,
        }),
      }),
    );
    expect(JSON.stringify(execFile.mock.calls)).not.toContain(secret);
  });

  it("proves wrong-secret 401 and accepts only the feature-off live response", async () => {
    const secret = "test-only-secret-that-must-never-appear-in-results-1234567890";
    const authorizationHeaders: string[] = [];
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      authorizationHeaders.push(new Headers(init?.headers).get("authorization") ?? "");
      if (authorizationHeaders.length === 1) {
        return new Response(
          JSON.stringify({
            success: false,
            data: null,
            error: { code: "UNAUTHORIZED", message: "Unauthorized", fields: [] },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            feature_state: "feature_off",
            status: "blocked",
            blocked_at: "scanner",
            phases: [],
          },
          error: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await runAccountMaintenanceLiveTick({
      tickUrl: "https://homecook-flame.vercel.app/internal/account-maintenance/tick",
      loadSecret: () => secret,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-07-28T00:00:00.000Z"),
      verifyWrongSecret: true,
    });

    expect(result).toEqual({
      event: "account_maintenance_tick",
      timestamp: "2026-07-28T00:00:00.000Z",
      ok: true,
      wrongSecretStatus: 401,
      liveStatus: 200,
      featureState: "feature_off",
      status: "blocked",
      blockedAt: "scanner",
      activationAllowed: false,
      externalHeartbeatConfigured: false,
      externalAlertConfigured: false,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(authorizationHeaders[0]).not.toBe(`Bearer ${secret}`);
    expect(authorizationHeaders[1]).toBe(`Bearer ${secret}`);
  });

  it("does not emit a wrong-secret request during steady-state launchd ticks", async () => {
    const secret = "test-only-secret-that-must-never-appear-in-results-1234567890";
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            feature_state: "feature_off",
            status: "blocked",
            blocked_at: "scanner",
            phases: [],
          },
          error: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await runAccountMaintenanceLiveTick({
      tickUrl: "https://homecook-flame.vercel.app/internal/account-maintenance/tick",
      loadSecret: () => secret,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.wrongSecretStatus).toBeNull();
    expect(result.ok).toBe(true);
  });

  it("fails closed if a live response claims activation readiness", async () => {
    await expect(
      runAccountMaintenanceLiveTick({
        tickUrl: "https://homecook-flame.vercel.app/internal/account-maintenance/tick",
        loadSecret: () =>
          "test-only-secret-that-must-never-appear-in-results-1234567890",
        fetchImpl: vi.fn().mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                feature_state: "joint_activation_ready",
                status: "completed",
                blocked_at: null,
                phases: [],
              },
              error: null,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ) as typeof fetch,
      }),
    ).rejects.toThrow("Live tick refused: joint activation is not approved");
  });

  it("installs launchd only from the exact merged commit and checks Keychain presence without reading it", () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const writes: Array<{ path: string; content: string; mode: number }> = [];
    const exactCommit = "a".repeat(40);
    const execFile = vi.fn((file: string, args: string[]) => {
      calls.push({ file, args });
      if (file === "git") return `${exactCommit}\n`;
      return "";
    });

    const result = installAccountMaintenanceLaunchd({
      confirmed: true,
      expectedCommit: exactCommit,
      tickUrl: "https://homecook-flame.vercel.app/internal/account-maintenance/tick",
      rootDir: "/Users/tester/homecook",
      homeDir: "/Users/tester",
      userId: 501,
      execFile: execFile as never,
      fileSystem: {
        mkdir: vi.fn(),
        exists: vi.fn(() => false),
        readFile: vi.fn(),
        writeFile: vi.fn((path, content, options) => {
          writes.push({ path, content, mode: options.mode });
        }),
        chmod: vi.fn(),
        rename: vi.fn(),
        rm: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      action: "install",
      exactCommit,
      target:
        "/Users/tester/Library/LaunchAgents/com.homecook.account-maintenance.plist",
      secretSource: "macos-keychain",
    });
    expect(calls).toContainEqual({
      file: "/usr/bin/security",
      args: [
        "find-generic-password",
        "-s",
        ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
        "-a",
        ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT,
      ],
    });
    expect(calls.some(({ args }) => args.includes("-w"))).toBe(false);
    expect(writes).toHaveLength(1);
    expect(writes[0].mode).toBe(0o600);
    expect(writes[0].content).toContain(
      "<string>https://homecook-flame.vercel.app/internal/account-maintenance/tick</string>",
    );
    expect(JSON.stringify({ result, calls, writes })).not.toContain(
      "HOMECOOK_MAINTENANCE_WORKER_SECRET</string>",
    );
  });

  it("refuses a non-dry-run install without explicit Manual Only confirmation", () => {
    expect(() =>
      installAccountMaintenanceLaunchd({
        confirmed: false,
        expectedCommit: "a".repeat(40),
        tickUrl: "https://homecook-flame.vercel.app/internal/account-maintenance/tick",
        homeDir: "/Users/tester",
      }),
    ).toThrow("Manual Only confirmation is required");
  });

  it("restores the previous launchd plist and job if replacement bootstrap fails", () => {
    const exactCommit = "d".repeat(40);
    const previousPlist = "<plist>previous-safe-job</plist>";
    let bootstrapCalls = 0;
    const writes: string[] = [];
    const execFile = vi.fn((file: string, args: string[]) => {
      if (file === "git") return `${exactCommit}\n`;
      if (file === "/bin/launchctl" && args[0] === "bootstrap") {
        bootstrapCalls += 1;
        if (bootstrapCalls === 1) throw new Error("replacement failed");
      }
      return "";
    });

    expect(() =>
      installAccountMaintenanceLaunchd({
        confirmed: true,
        expectedCommit: exactCommit,
        tickUrl: "https://homecook-flame.vercel.app/internal/account-maintenance/tick",
        rootDir: "/Users/tester/homecook",
        homeDir: "/Users/tester",
        userId: 501,
        execFile: execFile as never,
        fileSystem: {
          mkdir: vi.fn(),
          exists: vi.fn(() => true),
          readFile: vi.fn(() => previousPlist) as never,
          writeFile: vi.fn((_path, content) => {
            writes.push(content);
          }),
          chmod: vi.fn(),
          rename: vi.fn(),
          rm: vi.fn(),
        },
      }),
    ).toThrow("previous state was restored");

    expect(writes.at(-1)).toBe(previousPlist);
    expect(bootstrapCalls).toBe(2);
  });

  it("rejects an arbitrary HTTPS host before loading or sending the worker secret", async () => {
    const loadSecret = vi.fn();
    const fetchImpl = vi.fn();

    await expect(
      runAccountMaintenanceLiveTick({
        tickUrl: "https://attacker.example/internal/account-maintenance/tick",
        loadSecret,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toThrow("tick URL host is not allowlisted");
    expect(loadSecret).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rotates one generated secret through stdin without placing it in argv", () => {
    const secret = "test-only-rotation-secret-that-must-never-be-printed-123456";
    const exactCommit = "b".repeat(40);
    const generateSecret = vi.fn(() => secret);
    const calls: Array<{
      file: string;
      args: string[];
      input?: string;
      env?: Record<string, string>;
    }> = [];
    const run = vi.fn((
      file: string,
      args: string[],
      options: { input?: string; env?: Record<string, string> } = {},
    ) => {
      calls.push({
        file,
        args,
        input: options.input,
        env: options.env,
      });
      if (file === "git") {
        return { status: 0, stdout: `${exactCommit}\n`, stderr: "" };
      }
      if (
        file === "/usr/bin/swift"
        && args[1]?.includes("SecItemCopyMatching")
      ) {
        return { status: 44, stdout: "", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    });

    const result = rotateAccountMaintenanceSecret({
      confirmed: true,
      expectedCommit: exactCommit,
      rootDir: "/Users/tester/homecook",
      vercelCwd: "/Users/tester/homecook",
      vercelCommand: "vercel",
      generateSecret,
      run,
    });

    expect(generateSecret).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      exactCommit,
      keychainUpdated: true,
      vercelProductionUpdated: true,
      secretGenerated: true,
      secretExposed: false,
    });
    expect(calls.some(({ args }) => args.includes(secret))).toBe(false);
    expect(
      calls.filter(({ input }) => input === secret),
    ).toHaveLength(3);
    expect(
      calls.some(({ file, args }) =>
        file === "/usr/bin/security" && args[0] === "add-generic-password"
      ),
    ).toBe(false);
    expect(
      calls.filter(({ file, args }) =>
        file === "/usr/bin/swift"
        && args[1]?.includes("SecItemUpdate")
      ),
    ).toHaveLength(2);
    expect(
      calls
        .filter(({ file, args }) =>
          file === "/usr/bin/swift"
          && args[1]?.includes("SecItemUpdate")
        )
        .every(({ args }) => args[1].includes("SecItemAdd")),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("resumes a partial rotation from the pending Keychain item without generating again", () => {
    const secret = "test-only-resumable-secret-that-must-never-be-printed-123456";
    const exactCommit = "c".repeat(40);
    const generateSecret = vi.fn(() => secret);
    let pendingSecret: string | null = null;
    let failActivePromotion = true;
    const run = vi.fn((
      file: string,
      args: string[],
      options: {
        input?: string;
        env?: Record<string, string>;
      } = {},
    ) => {
      if (file === "git") {
        return { status: 0, stdout: `${exactCommit}\n`, stderr: "" };
      }
      if (
        file === "/usr/bin/swift"
        && args[1]?.includes("SecItemCopyMatching")
      ) {
        return pendingSecret
          ? { status: 0, stdout: pendingSecret, stderr: "" }
          : { status: 44, stdout: "", stderr: "" };
      }
      if (
        file === "/usr/bin/swift"
        && args[1]?.includes("SecItemUpdate")
      ) {
        const account = options.env?.HOMECOOK_KEYCHAIN_ACCOUNT ?? "";
        if (account.endsWith("_PENDING_ROTATION")) {
          pendingSecret = options.input ?? null;
          return { status: 0, stdout: "", stderr: "" };
        }
        if (failActivePromotion) {
          failActivePromotion = false;
          return { status: 1, stdout: "", stderr: "" };
        }
      }
      if (
        file === "/usr/bin/swift"
        && args[1]?.includes("SecItemDelete")
      ) {
        const account = options.env?.HOMECOOK_KEYCHAIN_ACCOUNT ?? "";
        if (account.endsWith("_PENDING_ROTATION")) {
          pendingSecret = null;
        }
      }
      return { status: 0, stdout: "", stderr: "" };
    });
    const options = {
      confirmed: true,
      expectedCommit: exactCommit,
      rootDir: "/Users/tester/homecook",
      vercelCwd: "/Users/tester/homecook",
      vercelCommand: "vercel",
      generateSecret,
      run,
    };

    expect(() => rotateAccountMaintenanceSecret(options)).toThrow(
      "failed during Keychain update",
    );
    expect(pendingSecret).toBe(secret);

    const resumed = rotateAccountMaintenanceSecret(options);

    expect(generateSecret).toHaveBeenCalledTimes(1);
    expect(resumed.secretGenerated).toBe(false);
    expect(pendingSecret).toBeNull();
  });

  it("fails closed without generating if the pending Keychain lookup errors", () => {
    const generateSecret = vi.fn();
    const exactCommit = "e".repeat(40);
    const run = vi.fn((file: string, args: string[]) => {
      if (file === "git") {
        return { status: 0, stdout: `${exactCommit}\n`, stderr: "" };
      }
      if (
        file === "/usr/bin/swift"
        && args[1]?.includes("SecItemCopyMatching")
      ) {
        return { status: 1, stdout: "", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    });

    expect(() =>
      rotateAccountMaintenanceSecret({
        confirmed: true,
        expectedCommit: exactCommit,
        rootDir: "/Users/tester/homecook",
        vercelCwd: "/Users/tester/homecook",
        vercelCommand: "vercel",
        generateSecret,
        run,
      }),
    ).toThrow("failed during pending Keychain lookup");
    expect(generateSecret).not.toHaveBeenCalled();
  });

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
      const args = [
        script,
        "--dry-run",
        "--home-dir",
        "/Users/tester",
        "--json",
      ];
      if (script === INSTALL_SCRIPT) {
        args.push(
          "--tick-url",
          "https://homecook-flame.vercel.app/internal/account-maintenance/tick",
        );
      }
      const rendered = execFileSync(
        process.execPath,
        args,
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
      if (script === INSTALL_SCRIPT) {
        expect(result.renderedPlist).toContain(
          "<string>https://homecook-flame.vercel.app/internal/account-maintenance/tick</string>",
        );
      }
    }
  });

  it("installs a separate local launchd dry-run cleaner without production URL or Keychain", () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const writes: Array<{ path: string; content: string; mode: number }> = [];
    const execFile = vi.fn((file: string, args: string[]) => {
      calls.push({ file, args });
      return "";
    });

    const result = installAccountMaintenanceLocalLaunchd({
      rootDir: "/Users/tester/homecook",
      homeDir: "/Users/tester",
      userId: 501,
      execFile: execFile as never,
      fileSystem: {
        mkdir: vi.fn(),
        exists: vi.fn(() => false),
        readFile: vi.fn(),
        writeFile: vi.fn((path, content, options) => {
          writes.push({ path, content, mode: options.mode });
        }),
        chmod: vi.fn(),
        rename: vi.fn(),
        rm: vi.fn(),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      action: "install",
      label: "com.homecook.account-maintenance.local",
      target:
        "/Users/tester/Library/LaunchAgents/com.homecook.account-maintenance.local.plist",
      liveMode: "local-dry-run",
    });
    expect(calls).toContainEqual({
      file: "/bin/launchctl",
      args: [
        "bootstrap",
        "gui/501",
        "/Users/tester/Library/LaunchAgents/com.homecook.account-maintenance.local.plist",
      ],
    });
    expect(calls.some(({ file }) => file === "/usr/bin/security")).toBe(false);
    expect(writes).toHaveLength(1);
    expect(writes[0].mode).toBe(0o600);
    expect(writes[0].content).toContain(
      "<string>com.homecook.account-maintenance.local</string>",
    );
    expect(writes[0].content).toContain("<integer>300</integer>");
    expect(writes[0].content).toContain("<string>--dry-run</string>");
    expect(writes[0].content).toContain("<string>--json</string>");
    expect(writes[0].content).toContain("account-maintenance-local.log");
    expect(writes[0].content).not.toContain("HOMECOOK_MAINTENANCE_TICK_URL");
    expect(writes[0].content).not.toContain("homecook-flame.vercel.app");
  });

  it("verifies the local launchd dry-run cleaner contract and package scripts", () => {
    expect(existsSync(LOCAL_INSTALL_SCRIPT)).toBe(true);
    expect(existsSync(LOCAL_VERIFY_SCRIPT)).toBe(true);

    const verification = buildAccountMaintenanceLocalSchedulerVerification({
      rootDir: "/Users/tester/homecook",
      homeDir: "/Users/tester",
    });

    expect(verification).toMatchObject({
      ok: true,
      checkedLaunchctl: false,
      launchd: {
        label: "com.homecook.account-maintenance.local",
        runAtLoad: true,
        startIntervalSeconds: 300,
        programArguments: [
          process.execPath,
          "scripts/account-maintenance-tick.mjs",
          "--dry-run",
          "--json",
        ],
        standardOutPath:
          "/Users/tester/Library/Logs/Homecook/account-maintenance-local.log",
        standardErrorPath:
          "/Users/tester/Library/Logs/Homecook/account-maintenance-local.err.log",
      },
    });

    const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
    expect(
      packageJson.scripts["account-maintenance:local-scheduler:install"],
    ).toBe("node scripts/account-maintenance-local-scheduler-install.mjs");
    expect(
      packageJson.scripts["account-maintenance:local-scheduler:verify"],
    ).toBe("node scripts/account-maintenance-local-scheduler-verify.mjs");

    const verifySource = readFileSync(LOCAL_VERIFY_SCRIPT, "utf8");
    expect(verifySource).toContain("plistMatches");
    expect(verifySource).toContain(
      "installedState.plist === verification.launchd.plist",
    );
    expect(verifySource).toContain(
      "result.installed && result.loaded && result.plistMatches",
    );

    const rendered = execFileSync(
      process.execPath,
      [
        LOCAL_VERIFY_SCRIPT,
        "--dry-run",
        "--home-dir",
        "/Users/tester",
        "--json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(JSON.parse(rendered)).toMatchObject({
      ok: true,
      checkedLaunchctl: false,
      launchd: {
        label: "com.homecook.account-maintenance.local",
      },
    });
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
