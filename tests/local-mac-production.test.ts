import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  activateLocalMacProduction,
  createProductionEnvContents,
  installLocalMacProductionLaunchAgent,
  LOCAL_SUPABASE_CLI_PACKAGE,
  parseLocalMacProductionArgs,
  renderLocalMacProductionPlist,
  startLocalMacProductionRuntime,
  verifyLocalMacProductionBootCli,
  waitForLocalMacProductionReady,
} from "../scripts/lib/local-mac-production.mjs";
import { relayChildLifecycle } from "../scripts/lib/process-signal-relay.mjs";

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
  it("starts Docker and local Supabase before the Next.js production process", async () => {
    const calls: string[] = [];
    const child = { on: () => child };
    const runtimeEnv = {
      HOME: "/Users/tester",
      PATH: "/Users/tester/.local/bin:/usr/bin:/bin",
      XDG_CONFIG_HOME: "/Users/tester/.config",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-reach-cli",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "must-not-reach-cli",
    };

    const result = await startLocalMacProductionRuntime({
      args: ["-H", "127.0.0.1", "-p", "3100"],
      rootDir: "/Users/tester/homecook",
      nodeBin: "/Users/tester/.nvm/node",
      env: runtimeEnv,
      ensureDocker: async () => {
        calls.push("docker-ready");
      },
      runCommand: (command: string, args: readonly string[], options) => {
        calls.push(`${command} ${args.join(" ")}`);
        expect(options.env).toEqual({
          HOME: runtimeEnv.HOME,
          PATH: runtimeEnv.PATH,
          XDG_CONFIG_HOME: runtimeEnv.XDG_CONFIG_HOME,
          npm_config_offline: "true",
        });
        return { status: 0, stdout: "", stderr: "" };
      },
      spawnProcess: (command: string, args: readonly string[]) => {
        calls.push(`${command} ${args.join(" ")}`);
        return child;
      },
    });

    expect(result).toBe(child);
    expect(calls).toEqual([
      "docker-ready",
      "pnpm dlx supabase@2.110.0 start",
      "pnpm dlx supabase@2.110.0 status",
      "/Users/tester/.nvm/node /Users/tester/homecook/scripts/start-production.mjs -H 127.0.0.1 -p 3100",
    ]);
  });

  it("rejects a public bind address before starting Docker or Supabase", async () => {
    let dockerStarted = false;
    let commandStarted = false;
    let nextStarted = false;

    await expect(
      startLocalMacProductionRuntime({
        args: ["-H", "0.0.0.0", "-p", "3100"],
        rootDir: "/Users/tester/homecook",
        ensureDocker: async () => {
          dockerStarted = true;
        },
        runCommand: () => {
          commandStarted = true;
          return { status: 0 };
        },
        spawnProcess: () => {
          nextStarted = true;
          return { on: () => undefined };
        },
      }),
    ).rejects.toThrow("Local Mac production must bind to 127.0.0.1");

    expect(dockerStarted).toBe(false);
    expect(commandStarted).toBe(false);
    expect(nextStarted).toBe(false);
  });

  it("does not start Next.js when local Supabase start fails", async () => {
    let nextStarted = false;

    await expect(
      startLocalMacProductionRuntime({
        rootDir: "/Users/tester/homecook",
        ensureDocker: async () => undefined,
        runCommand: () => ({ status: 1, stdout: "", stderr: "failed" }),
        spawnProcess: () => {
          nextStarted = true;
          return { on: () => undefined };
        },
      }),
    ).rejects.toThrow("Local Supabase start failed");

    expect(nextStarted).toBe(false);
  });

  it("does not start local Supabase or Next.js when Docker is unavailable", async () => {
    let commandStarted = false;
    let nextStarted = false;

    await expect(
      startLocalMacProductionRuntime({
        rootDir: "/Users/tester/homecook",
        ensureDocker: async () => {
          throw new Error("Docker unavailable");
        },
        runCommand: () => {
          commandStarted = true;
          return { status: 0, stdout: "", stderr: "" };
        },
        spawnProcess: () => {
          nextStarted = true;
          return { on: () => undefined };
        },
      }),
    ).rejects.toThrow("Docker unavailable");

    expect(commandStarted).toBe(false);
    expect(nextStarted).toBe(false);
  });

  it("does not start Next.js when local Supabase health check fails", async () => {
    let commandCount = 0;
    let nextStarted = false;

    await expect(
      startLocalMacProductionRuntime({
        rootDir: "/Users/tester/homecook",
        ensureDocker: async () => undefined,
        runCommand: () => {
          commandCount += 1;
          return {
            status: commandCount === 1 ? 0 : 1,
            stdout: "",
            stderr: "unhealthy",
          };
        },
        spawnProcess: () => {
          nextStarted = true;
          return { on: () => undefined };
        },
      }),
    ).rejects.toThrow("Local Supabase health check failed");

    expect(nextStarted).toBe(false);
  });

  it("blocks activation before launchd install when the production gate fails", async () => {
    let installCalled = false;
    let validatedRootDir = "";

    await expect(
      activateLocalMacProduction({
        rootDir: "/Users/tester/homecook",
        loadEnvFiles: () => [],
        validateDataQuality: async (options) => {
          validatedRootDir = options?.rootDir ?? "";
          return {
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
          };
        },
        installLaunchAgent: () => {
          installCalled = true;
          throw new Error("must not install");
        },
      }),
    ).rejects.toThrow("PRODUCTION_DATA_SCAN_FAILED");

    expect(installCalled).toBe(false);
    expect(validatedRootDir).toBe("/Users/tester/homecook");
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
    expect(plist).toContain("<string>/Users/tester/Home &amp; Cook/scripts/start-local-mac-production.mjs</string>");
    expect(plist).toContain("<string>127.0.0.1</string>");
    expect(plist).toContain("<string>3100</string>");
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<key>SuccessfulExit</key>");
    expect(plist).toContain("<false/>");
    expect(plist).toContain("<key>ThrottleInterval</key>");
    expect(plist).toContain("<integer>10</integer>");
    expect(plist).toContain("/Users/tester/.homecook/logs/homecook-production.err.log");
  });

  it("installs and starts the launch agent after required files exist", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "homecook-production-root-"));
    const homeDir = mkdtempSync(join(tmpdir(), "homecook-production-home-"));
    tempDirs.push(rootDir, homeDir);

    const spawnCalls: string[] = [];
    const bootCliChecks: string[] = [];
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
      verifyBootCli: ({ command, args, env }) => {
        bootCliChecks.push(`${command} ${args.join(" ")}`);
        expect(args).toEqual(["dlx", LOCAL_SUPABASE_CLI_PACKAGE, "--version"]);
        expect(env).toEqual({
          HOME: homeDir,
          PATH: [
            dirname(process.execPath),
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
          ].join(":"),
        });
      },
      verifyPrerequisites: () => undefined,
    });

    expect(result.changed).toBe(true);
    expect(readFileSync(result.plistPath, "utf8")).toContain("127.0.0.1");
    expect(bootCliChecks).toEqual([
      `pnpm dlx ${LOCAL_SUPABASE_CLI_PACKAGE} --version`,
    ]);
    expect(spawnCalls).toContain(`launchctl bootstrap gui/501 ${result.plistPath}`);
    expect(spawnCalls).toContain("launchctl kickstart -k gui/501/com.homecook.production");
  });

  it("fails installation preflight when the pinned boot CLI cannot be cached", () => {
    expect(() => verifyLocalMacProductionBootCli({
      command: "pnpm",
      args: ["dlx", LOCAL_SUPABASE_CLI_PACKAGE, "--version"],
      cwd: "/Users/tester/homecook",
      env: {
        HOME: "/Users/tester",
        PATH: "/usr/bin:/bin",
      },
      runCommand: () => ({ status: 1 }),
    })).toThrow(
      `Unable to cache ${LOCAL_SUPABASE_CLI_PACKAGE} for offline production boot`,
    );
  });
});

describe("process signal relay", () => {
  it("forwards parent SIGTERM to the child process", () => {
    class FakeChild extends EventEmitter {
      killCalls: string[] = [];

      kill(signal: string) {
        this.killCalls.push(signal);
      }
    }

    class FakeProcess extends EventEmitter {
      pid = 4242;
      killed: Array<{ pid: number; signal: string }> = [];
      exitCodes: number[] = [];
      stderr = { write: () => undefined };

      kill(pid: number, signal: string) {
        this.killed.push({ pid, signal });
      }

      exit(code: number) {
        this.exitCodes.push(code);
      }
    }

    const child = new FakeChild();
    const processRef = new FakeProcess();

    relayChildLifecycle(child, {
      processRef,
      errorMessage: "failed",
      nullExitCode: 1,
    });

    processRef.emit("SIGTERM");

    expect(child.killCalls).toEqual(["SIGTERM"]);
    expect(processRef.killed).toEqual([]);
    expect(processRef.exitCodes).toEqual([]);
  });
});
