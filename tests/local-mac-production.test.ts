import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  activateLocalMacProduction,
  createProductionEnvContents,
  installLocalMacProductionLaunchAgent,
  parseLocalMacProductionArgs,
  renderLocalMacProductionPlist,
  waitForLocalMacProductionReady,
} from "../scripts/lib/local-mac-production.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("local Mac production environment", () => {
  it("starts the production CLI through an explicit Node binary", () => {
    const result = spawnSync(
      "/bin/sh",
      ["scripts/run-local-mac-production.sh", "help"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HOMECOOK_NODE_BIN: process.execPath,
          PATH: "/usr/bin:/bin",
        },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("127.0.0.1");
  });

  it("builds through the resolved Node binary without relying on PATH", () => {
    const result = spawnSync(
      "/bin/sh",
      ["scripts/run-local-mac-production.sh", "build"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HOMECOOK_ESLINT_BIN: "/usr/bin/true",
          HOMECOOK_NODE_BIN: "/bin/echo",
          PATH: "/usr/bin:/bin",
        },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("node_modules/next/dist/bin/next build --no-lint");
  });

  it("accepts the pnpm argument separator before command options", () => {
    const result = parseLocalMacProductionArgs([
      "prepare-env",
      "--",
      "--source-env",
      "/repo/.env.local",
      "--port",
      "3100",
    ]);

    expect(result.command).toBe("prepare-env");
    expect(result.sourcePath).toBe("/repo/.env.local");
    expect(result.port).toBe(3100);
  });

  it("keeps production keys while removing development and unrelated credentials", () => {
    const result = createProductionEnvContents({
      sourceText: [
        "NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-secret",
        "SUPABASE_SERVICE_ROLE_KEY=service-secret",
        "GEMINI_API_KEY=gemini-secret",
        "GH_TOKEN=must-not-copy",
        "HOMECOOK_MAINTENANCE_WORKER_SECRET=must-not-copy",
        "HOMECOOK_STORAGE_LIVE_SERVICE_ROLE_KEY=must-not-copy",
        "HOMECOOK_ENABLE_QA_FIXTURES=1",
        "NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH=true",
        "NEXT_PUBLIC_APP_URL=http://localhost:3000",
      ].join("\n"),
      exampleText: [
        "NEXT_PUBLIC_SUPABASE_URL=",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
        "SUPABASE_SERVICE_ROLE_KEY=",
        "GEMINI_API_KEY=",
        "NEXT_PUBLIC_APP_URL=",
      ].join("\n"),
      origin: "http://127.0.0.1:3100",
    });

    expect(result.contents).toContain("NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co");
    expect(result.contents).toContain("SUPABASE_SERVICE_ROLE_KEY=service-secret");
    expect(result.contents).toContain("NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100");
    expect(result.contents).toContain("NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100");
    expect(result.contents).toContain("HOMECOOK_PRODUCTION_EXPOSURE=local-only");
    expect(result.contents).not.toContain("GH_TOKEN");
    expect(result.contents).not.toContain("HOMECOOK_MAINTENANCE_WORKER_SECRET");
    expect(result.contents).not.toContain("HOMECOOK_STORAGE_LIVE_SERVICE_ROLE_KEY");
    expect(result.contents).not.toContain("HOMECOOK_ENABLE_QA_FIXTURES");
    expect(result.contents).not.toContain("NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH");
    expect(result.omittedKeys).toEqual(
      expect.arrayContaining([
        "GH_TOKEN",
        "HOMECOOK_MAINTENANCE_WORKER_SECRET",
        "HOMECOOK_STORAGE_LIVE_SERVICE_ROLE_KEY",
        "HOMECOOK_ENABLE_QA_FIXTURES",
        "NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH",
      ]),
    );
  });
});

describe("local Mac production launch agent", () => {
  it("blocks activation before launchd install when the production gate fails", async () => {
    let installCalled = false;

    await expect(
      activateLocalMacProduction({
        loadEnvFiles: () => [],
        validateDataQuality: async () => ({
          ok: false,
          errors: [{
            code: "PRODUCTION_DATA_SCAN_FAILED",
            message: "recipes.visibility is missing",
          }],
          warnings: [],
          db: {
            skipped: false,
            skipReason: null,
            findingCount: 0,
          },
        }),
        installLaunchAgent: () => {
          installCalled = true;
          throw new Error("must not install");
        },
      }),
    ).rejects.toThrow("PRODUCTION_DATA_SCAN_FAILED");

    expect(installCalled).toBe(false);
  });

  it("removes a partial launchd install when HTTP readiness fails", async () => {
    let uninstallCalled = false;

    await expect(
      activateLocalMacProduction({
        loadEnvFiles: () => [],
        validateDataQuality: async () => ({
          ok: true,
          errors: [],
          warnings: [],
          db: {
            skipped: false,
            skipReason: null,
            findingCount: 0,
          },
        }),
        installLaunchAgent: () => ({
          changed: true,
          label: "com.homecook.production",
          plistPath: "/Users/tester/Library/LaunchAgents/com.homecook.production.plist",
          stdoutPath: "/Users/tester/.homecook/logs/homecook-production.out.log",
          stderrPath: "/Users/tester/.homecook/logs/homecook-production.err.log",
          host: "127.0.0.1",
          port: 3100,
        }),
        waitForReady: async () => {
          throw new Error("HTTP readiness timeout");
        },
        uninstallLaunchAgent: () => {
          uninstallCalled = true;
          return {
            removed: true,
            plistPath: "/Users/tester/Library/LaunchAgents/com.homecook.production.plist",
          };
        },
      }),
    ).rejects.toThrow("HTTP readiness timeout");

    expect(uninstallCalled).toBe(true);
  });

  it("waits until the restarted HTTP server is ready", async () => {
    let attempts = 0;
    const fetchImpl = async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("connection refused");
      }
      return new Response(null, { status: 200 });
    };

    const result = await waitForLocalMacProductionReady({
      origin: "http://127.0.0.1:3100",
      attempts: 3,
      fetchImpl,
      waitImpl: async () => undefined,
    });

    expect(result).toEqual({
      attempts: 3,
      status: 200,
    });
  });

  it("renders a local-only service with absolute paths and restart protection", () => {
    const plist = renderLocalMacProductionPlist({
      rootDir: "/Users/tester/Home & Cook",
      homeDir: "/Users/tester",
      nodeBin: "/Users/tester/.nvm/node",
      host: "127.0.0.1",
      port: 3100,
    });

    expect(plist).toContain("<string>com.homecook.production</string>");
    expect(plist).toContain("<string>/Users/tester/.nvm/node</string>");
    expect(plist).toContain("<string>/Users/tester/Home &amp; Cook/scripts/start-production.mjs</string>");
    expect(plist).toContain("<string>127.0.0.1</string>");
    expect(plist).toContain("<string>3100</string>");
    expect(plist).toContain("<key>SuccessfulExit</key>");
    expect(plist).toContain("<false/>");
    expect(plist).toContain("/Users/tester/.homecook/logs/homecook-production.err.log");
  });

  it("installs and starts the launch agent after required files exist", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "homecook-production-root-"));
    const homeDir = mkdtempSync(join(tmpdir(), "homecook-production-home-"));
    tempDirs.push(rootDir, homeDir);

    const spawnCalls: string[] = [];
    const spawn = ((command: string, args: readonly string[]) => {
      spawnCalls.push(`${command} ${args.join(" ")}`);
      return {
        status: args[0] === "print" ? 1 : 0,
        stdout: "",
        stderr: args[0] === "print" ? "not loaded" : "",
      };
    }) as typeof import("node:child_process").spawnSync;

    const result = installLocalMacProductionLaunchAgent({
      rootDir,
      homeDir,
      nodeBin: process.execPath,
      host: "127.0.0.1",
      port: 3100,
      platform: "darwin",
      getuid: () => 501,
      spawn,
      verifyPrerequisites: () => undefined,
    });

    expect(result.changed).toBe(true);
    expect(readFileSync(result.plistPath, "utf8")).toContain("127.0.0.1");
    expect(spawnCalls).toContain(`launchctl bootstrap gui/501 ${result.plistPath}`);
    expect(spawnCalls).toContain("launchctl kickstart -k gui/501/com.homecook.production");
  });
});
