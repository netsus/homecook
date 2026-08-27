import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  activateLocalMacProduction,
  createProductionEnvContents,
  installLocalMacProductionLaunchAgent,
  parseLocalMacProductionArgs,
  renderLocalMacProductionPlist,
  restartLocalMacProductionLaunchAgent,
  startLocalMacProductionRuntime,
  uninstallLocalMacProductionLaunchAgent,
  verifyFullLocalProductionRuntimeStatus,
  verifyLocalMacProductionPrerequisites,
  verifyYoutubeExtractionAppReleaseAlignment,
  waitForLocalMacProductionReady,
} from "../scripts/lib/local-mac-production.mjs";
import {
  createValidatedLocalMacMutationAuthority,
} from "./helpers/local-mac-production-release-fixtures";
import { relayChildLifecycle } from "../scripts/lib/process-signal-relay.mjs";

const tempDirs: string[] = [];

function createMutationAuthority({
  command,
  homeDir,
  rootDir,
}: {
  command: string;
  homeDir: string;
  rootDir: string;
}) {
  return createValidatedLocalMacMutationAuthority({
    command,
    homeDir,
    rootDir,
    lockToken: "44444444-4444-4444-8444-444444444444",
  }).mutationAuthority;
}

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

  it("blocks direct mutation commands unless explicit release authority flags are provided", () => {
    const commands = ["prepare-env", "install", "restart", "uninstall"];

    for (const command of commands) {
      const result = spawnSync(process.execPath, ["scripts/local-mac-production.mjs", command], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HOMECOOK_RELEASE_MANIFEST_PATH: "/tmp/ambient-release.json",
          HOMECOOK_RELEASE_LOCK_TOKEN: "ambient-lock-token",
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--release-manifest");
      expect(result.stderr).toContain("--lock-token");
      expect(result.stderr).not.toContain("/tmp/ambient-release.json");
      expect(result.stderr).not.toContain("ambient-lock-token");
    }
  });

  it("keeps production keys while removing development and unrelated credentials", () => {
    const result = createProductionEnvContents({
      sourceText: [
        "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-secret",
        "SUPABASE_SERVICE_ROLE_KEY=service-secret",
        "HOMECOOK_AUTH_AUTHORITY=local",
        "NEXT_PUBLIC_AUTH_SUPABASE_URL=http://127.0.0.1:54321",
        "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY=auth-anon-secret",
        "AUTH_SUPABASE_EXPECTED_ISSUER=http://127.0.0.1:54321/auth/v1",
        "AUTH_SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
        "AUTH_SUPABASE_SECRET_KEY=auth-secret",
        "LOCAL_SUPABASE_INTERNAL_URL=http://127.0.0.1:54481",
        "LOCAL_SUPABASE_SECRET_KEY=local-secret",
        "HOMECOOK_DATA_AUTHORITY=local",
        "DATA_SUPABASE_URL=http://127.0.0.1:54321",
        "DATA_SUPABASE_PUBLISHABLE_KEY=data-anon-secret",
        "DATA_SUPABASE_SECRET_KEY=data-secret",
        "HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION=1",
        "HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH=/Users/tester/.homecook/youtube/app.json",
        "HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH=/Users/tester/.homecook/youtube/schema.json",
        "HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH=/Users/tester/.homecook/youtube/artifact.json",
        "HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V1=fingerprint-secret-that-is-at-least-32-bytes",
        "HOMECOOK_YOUTUBE_EXTRACTION_CURSOR_HMAC_KEY_V1=cursor-secret-that-is-at-least-32-bytes",
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
        "HOMECOOK_AUTH_AUTHORITY=",
        "NEXT_PUBLIC_AUTH_SUPABASE_URL=",
        "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY=",
        "AUTH_SUPABASE_EXPECTED_ISSUER=",
        "AUTH_SUPABASE_JWKS_URL=",
        "AUTH_SUPABASE_SECRET_KEY=",
        "LOCAL_SUPABASE_INTERNAL_URL=",
        "LOCAL_SUPABASE_SECRET_KEY=",
        "HOMECOOK_DATA_AUTHORITY=",
        "DATA_SUPABASE_URL=",
        "DATA_SUPABASE_PUBLISHABLE_KEY=",
        "DATA_SUPABASE_SECRET_KEY=",
        "GEMINI_API_KEY=",
        "NEXT_PUBLIC_APP_URL=",
      ].join("\n"),
      origin: "http://127.0.0.1:3100",
    });

    expect(result.contents).toContain("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321");
    expect(result.contents).toContain("SUPABASE_SERVICE_ROLE_KEY=service-secret");
    expect(result.contents).toContain("HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION=1");
    expect(result.contents).toContain(
      "HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH=/Users/tester/.homecook/youtube/app.json",
    );
    expect(result.contents).toContain(
      "HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH=/Users/tester/.homecook/youtube/schema.json",
    );
    expect(result.contents).toContain(
      "HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH=/Users/tester/.homecook/youtube/artifact.json",
    );
    expect(result.contents).toContain(
      "HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V1=fingerprint-secret-that-is-at-least-32-bytes",
    );
    expect(result.contents).toContain(
      "HOMECOOK_YOUTUBE_EXTRACTION_CURSOR_HMAC_KEY_V1=cursor-secret-that-is-at-least-32-bytes",
    );
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

  it("fails closed when the generated production env is not local-only", () => {
    const exampleText = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    const valid = exampleText
      .replaceAll("your-local-anon-key", "anon")
      .replaceAll("your-local-service-role-key", "secret")
      .replaceAll("your-local-auth-publishable-key", "auth-anon")
      .replaceAll("your-local-auth-service-role-key", "auth-secret")
      .replaceAll("your-local-supabase-secret-key", "local-secret")
      .replaceAll("your-local-data-publishable-key", "data-anon")
      .replaceAll("your-local-data-service-role-key", "data-secret");

    expect(() => createProductionEnvContents({
      sourceText: valid.replace(
        "DATA_SUPABASE_URL=http://127.0.0.1:54321",
        "DATA_SUPABASE_URL=https://project.supabase.co",
      ),
      exampleText,
      origin: "http://127.0.0.1:3100",
    })).toThrow(/local|loopback|hosted/iu);
    expect(() => createProductionEnvContents({
      sourceText: valid.replace("HOMECOOK_AUTH_AUTHORITY=local", "HOMECOOK_AUTH_AUTHORITY=remote"),
      exampleText,
      origin: "http://127.0.0.1:3100",
    })).toThrow(/local/iu);
  });
});

describe("local Mac production launch agent", () => {
  it("checks the existing full-local runtime exactly once before the Next.js production process", async () => {
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
      "/Users/tester/.nvm/node /Users/tester/homecook/scripts/full-local-production-runtime.mjs status",
      "/Users/tester/.nvm/node /Users/tester/homecook/scripts/start-production.mjs -H 127.0.0.1 -p 3100",
    ]);
    expect(calls.join("\n")).not.toContain("supabase@2.110.0");
    expect(calls.join("\n")).not.toContain("corepack");
    expect(calls.join("\n")).not.toContain(" pnpm ");
    expect(calls.join("\n")).not.toContain(" start");
  });

  it("rejects a public bind address before starting Docker or checking the runtime", async () => {
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

  it("does not start Next.js when the full-local runtime status fails", async () => {
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
    ).rejects.toThrow("Full-local production runtime health check failed");

    expect(nextStarted).toBe(false);
  });

  it("does not check the full-local runtime or start Next.js when Docker is unavailable", async () => {
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

  it("blocks activation before launchd install when YouTube release evidence is stale", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "homecook-youtube-release-preflight-"));
    tempDirs.push(rootDir);
    const descriptorPath = join(rootDir, "app-descriptor.json");
    const manifestPath = join(rootDir, "worker-artifact.json");
    const expectedSchemaPath = join(rootDir, "expected-schema.json");
    writeFileSync(descriptorPath, JSON.stringify({
      release_sha: "a".repeat(40),
      artifact_sha256: "c".repeat(64),
    }));
    writeFileSync(manifestPath, JSON.stringify({
      release_sha: "a".repeat(40),
      artifact_sha256: "c".repeat(64),
    }));
    writeFileSync(expectedSchemaPath, "{}");
    let installCalled = false;

    await expect(activateLocalMacProduction({
      rootDir,
      env: {
        ...process.env,
        HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION: "1",
        HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH: descriptorPath,
        HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH: expectedSchemaPath,
        HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH: manifestPath,
      },
      loadEnvFiles: () => [],
      readReleaseSha: () => "b".repeat(40),
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
      installLaunchAgent: () => {
        installCalled = true;
        return {
          changed: true,
          label: "com.homecook.production",
          plistPath: "/Users/tester/Library/LaunchAgents/com.homecook.production.plist",
          stdoutPath: "/Users/tester/.homecook/logs/homecook-production.out.log",
          stderrPath: "/Users/tester/.homecook/logs/homecook-production.err.log",
          host: "127.0.0.1",
          port: 3100,
        };
      },
      waitForReady: async () => ({ status: 200, attempts: 1 }),
    })).rejects.toThrow("YouTube extraction app release mismatch");

    expect(installCalled).toBe(false);
  });

  it("rejects self-reported matching YouTube evidence without a verified artifact", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "homecook-youtube-forged-evidence-"));
    tempDirs.push(rootDir);
    const releaseSha = "b".repeat(40);
    const artifactSha = "c".repeat(64);
    const schemaSha = "d".repeat(64);
    const descriptorPath = join(rootDir, "app-descriptor.json");
    const manifestPath = join(rootDir, "worker-artifact.json");
    const expectedSchemaPath = join(rootDir, "expected-schema.json");
    writeFileSync(descriptorPath, JSON.stringify({
      schema: "homecook.youtube-extraction-app-descriptor",
      release_sha: releaseSha,
      schema_identity: "youtube-extraction-worker-schema-v1",
      artifact_sha256: artifactSha,
      expected_schema_sha256: schemaSha,
    }));
    writeFileSync(manifestPath, JSON.stringify({
      release_sha: releaseSha,
      schema_identity: "youtube-extraction-worker-schema-v1",
      artifact_sha256: artifactSha,
      expected_schema_sha256: schemaSha,
    }));
    writeFileSync(expectedSchemaPath, "{}");

    expect(() => verifyYoutubeExtractionAppReleaseAlignment({
      env: {
        ...process.env,
        HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION: "1",
        HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH: descriptorPath,
        HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH: expectedSchemaPath,
        HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH: manifestPath,
      },
      releaseSha,
    })).toThrow("worker artifact");
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

  it("keeps the default readiness window beyond the catalog preflight delay", async () => {
    let attempts = 0;
    const result = await waitForLocalMacProductionReady({
      fetchImpl: async () => {
        attempts += 1;
        if (attempts <= 40) {
          throw new Error("connection refused");
        }
        return new Response(null, { status: 200 });
      },
      waitImpl: async () => undefined,
    });

    expect(result).toEqual({
      attempts: 41,
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
    const mutationAuthority = createMutationAuthority({
      command: "install",
      homeDir,
      rootDir,
    });

    const spawnCalls: string[] = [];
    const runtimeStatusChecks: string[] = [];
    const spawn = ((command: string, args: readonly string[]) => {
      spawnCalls.push(`${command} ${args.join(" ")}`);
      return {
        status: args[0] === "print" ? 1 : 0,
        stdout: "",
        stderr: args[0] === "print" ? "not loaded" : "",
      };
    }) as typeof import("node:child_process").spawnSync;

    const result = installLocalMacProductionLaunchAgent({
      mutationAuthority,
      rootDir,
      homeDir,
      nodeBin: process.execPath,
      host: "127.0.0.1",
      port: 3100,
      platform: "darwin",
      getuid: () => 501,
      spawn,
      verifyRuntimeStatus: ({ command, args, env }) => {
        runtimeStatusChecks.push(`${command} ${args.join(" ")}`);
        expect(command).toBe(process.execPath);
        expect(args).toEqual([join(rootDir, "scripts/full-local-production-runtime.mjs"), "status"]);
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
    expect(runtimeStatusChecks).toEqual([
      `${process.execPath} ${join(rootDir, "scripts/full-local-production-runtime.mjs")} status`,
    ]);
    expect(runtimeStatusChecks.join("\n")).not.toContain("supabase@2.110.0");
    expect(runtimeStatusChecks.join("\n")).not.toContain("corepack");
    expect(runtimeStatusChecks.join("\n")).not.toContain(" start");
    expect(spawnCalls).toContain(`launchctl bootstrap gui/501 ${result.plistPath}`);
    expect(spawnCalls).toContain("launchctl kickstart -k gui/501/com.homecook.production");
  });

  it("rejects an existing plist symlink before writing or launchctl mutation", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "homecook-production-symlink-root-"));
    const homeDir = mkdtempSync(join(tmpdir(), "homecook-production-symlink-home-"));
    tempDirs.push(rootDir, homeDir);
    const mutationAuthority = createMutationAuthority({ command: "install", homeDir, rootDir });
    const launchAgentsDir = join(homeDir, "Library", "LaunchAgents");
    const plistPath = join(launchAgentsDir, "com.homecook.production.plist");
    const externalPath = join(homeDir, "unrelated.txt");
    mkdirSync(launchAgentsDir, { recursive: true });
    writeFileSync(externalPath, "do-not-overwrite\n");
    symlinkSync(externalPath, plistPath);
    const spawnCalls: string[] = [];

    expect(() => installLocalMacProductionLaunchAgent({
      mutationAuthority,
      rootDir,
      homeDir,
      nodeBin: process.execPath,
      platform: "darwin",
      getuid: () => process.getuid?.() ?? 501,
      spawn: ((command: string, args: readonly string[]) => {
        spawnCalls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      }) as typeof import("node:child_process").spawnSync,
      verifyRuntimeStatus: () => undefined,
      verifyPrerequisites: () => undefined,
    })).toThrow(/plist|symlink|symbolic/iu);
    expect(readFileSync(externalPath, "utf8")).toBe("do-not-overwrite\n");
    expect(spawnCalls).toEqual([]);
  });

  it("fails installation preflight when the full-local runtime is unhealthy", () => {
    expect(() => verifyFullLocalProductionRuntimeStatus({
      command: "/Users/tester/.nvm/node",
      args: ["/Users/tester/homecook/scripts/full-local-production-runtime.mjs", "status"],
      cwd: "/Users/tester/homecook",
      env: {
        HOME: "/Users/tester",
        PATH: "/usr/bin:/bin",
      },
      runCommand: () => ({ status: 1 }),
    })).toThrow("Full-local production runtime health check failed");
  });

  it("does not mutate launchctl when the full-local runtime preflight fails", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "homecook-production-preflight-root-"));
    const homeDir = mkdtempSync(join(tmpdir(), "homecook-production-preflight-home-"));
    tempDirs.push(rootDir, homeDir);
    const mutationAuthority = createMutationAuthority({
      command: "install",
      homeDir,
      rootDir,
    });
    const spawnCalls: string[] = [];

    expect(() => installLocalMacProductionLaunchAgent({
      mutationAuthority,
      rootDir,
      homeDir,
      nodeBin: "/Users/tester/.nvm/node",
      platform: "darwin",
      getuid: () => 501,
      spawn: ((command: string, args: readonly string[]) => {
        spawnCalls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      }) as typeof import("node:child_process").spawnSync,
      verifyPrerequisites: () => undefined,
      verifyRuntimeStatus: ({ command, args }) => {
        expect(command).toBe("/Users/tester/.nvm/node");
        expect(args).toEqual([
          `${rootDir}/scripts/full-local-production-runtime.mjs`,
          "status",
        ]);
        throw new Error("Full-local production runtime health check failed");
      },
    })).toThrow("Full-local production runtime health check failed");

    expect(spawnCalls).toEqual([]);
  });

  it("blocks direct helper mutations before launchctl when no validated authority is provided", () => {
    const installCalls: string[] = [];
    expect(() => installLocalMacProductionLaunchAgent({
      rootDir: "/Users/tester/homecook",
      homeDir: "/Users/tester",
      nodeBin: "/Users/tester/.nvm/node",
      platform: "darwin",
      getuid: () => 501,
      spawn: ((command: string, args: readonly string[]) => {
        installCalls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      }) as typeof import("node:child_process").spawnSync,
      verifyPrerequisites: () => undefined,
      verifyRuntimeStatus: () => undefined,
    })).toThrow(/validated release authority|release authority|--release-manifest/iu);
    expect(installCalls).toEqual([]);

    const restartCalls: string[] = [];
    expect(() => restartLocalMacProductionLaunchAgent({
      getuid: () => 501,
      spawn: ((command: string, args: readonly string[]) => {
        restartCalls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      }) as typeof import("node:child_process").spawnSync,
    })).toThrow(/validated release authority|release authority|--release-manifest/iu);
    expect(restartCalls).toEqual([]);

    const uninstallCalls: string[] = [];
    expect(() => uninstallLocalMacProductionLaunchAgent({
      homeDir: "/Users/tester",
      getuid: () => 501,
      spawn: ((command: string, args: readonly string[]) => {
        uninstallCalls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      }) as typeof import("node:child_process").spawnSync,
    })).toThrow(/validated release authority|release authority|--release-manifest/iu);
    expect(uninstallCalls).toEqual([]);
  });

  it("requires the full-local runtime script and local production config", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "homecook-production-prerequisites-"));
    tempDirs.push(rootDir);
    const nodeBin = join(rootDir, "bin", "node");

    mkdirSync(dirname(nodeBin), { recursive: true });
    writeFileSync(nodeBin, "");
    writeFileSync(join(rootDir, ".env.production.local"), "");
    mkdirSync(join(rootDir, ".next"), { recursive: true });
    writeFileSync(join(rootDir, ".next", "BUILD_ID"), "build-id");
    mkdirSync(join(rootDir, "scripts"), { recursive: true });
    writeFileSync(join(rootDir, "scripts", "start-local-mac-production.mjs"), "");
    writeFileSync(join(rootDir, "scripts", "start-production.mjs"), "");

    expect(() => verifyLocalMacProductionPrerequisites({ rootDir, nodeBin }))
      .toThrow(join(rootDir, "scripts/full-local-production-runtime.mjs"));

    writeFileSync(join(rootDir, "scripts", "full-local-production-runtime.mjs"), "");

    expect(() => verifyLocalMacProductionPrerequisites({ rootDir, nodeBin }))
      .toThrow(join(rootDir, "infra/full-local-supabase/.env.production.local"));

    mkdirSync(join(rootDir, "infra/full-local-supabase"), { recursive: true });
    writeFileSync(join(rootDir, "infra/full-local-supabase/.env.production.local"), "");

    expect(() => verifyLocalMacProductionPrerequisites({ rootDir, nodeBin })).not.toThrow();
  });

  it("accepts a validated release authority for direct helper mutations", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "homecook-production-authority-root-"));
    const homeDir = mkdtempSync(join(tmpdir(), "homecook-production-authority-home-"));
    tempDirs.push(rootDir, homeDir);
    const mutationAuthority = createMutationAuthority({
      command: "install",
      homeDir,
      rootDir,
    });

    const spawnCalls: string[] = [];
    const result = installLocalMacProductionLaunchAgent({
      mutationAuthority,
      rootDir,
      homeDir,
      nodeBin: process.execPath,
      host: "127.0.0.1",
      port: 3100,
      platform: "darwin",
      getuid: () => 501,
      spawn: ((command: string, args: readonly string[]) => {
        spawnCalls.push(`${command} ${args.join(" ")}`);
        return {
          status: args[0] === "print" ? 1 : 0,
          stdout: "",
          stderr: args[0] === "print" ? "not loaded" : "",
        };
      }) as typeof import("node:child_process").spawnSync,
      verifyPrerequisites: () => undefined,
      verifyRuntimeStatus: () => undefined,
    });

    expect(result.changed).toBe(true);
    expect(spawnCalls).toContain(`launchctl bootstrap gui/501 ${result.plistPath}`);
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
