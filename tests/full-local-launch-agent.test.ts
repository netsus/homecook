import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL,
  getFullLocalLaunchAgentPaths,
  installFullLocalLaunchAgent,
  parseFullLocalLaunchAgentArgs,
  parseLaunchctlPrintStatus,
  readFullLocalLaunchAgentStatus,
  renderFullLocalLaunchAgentPlist,
  uninstallFullLocalLaunchAgent,
  validateFullLocalLaunchAgentConfigPath,
} from "../scripts/lib/full-local-launch-agent.mjs";
import {
  createValidatedLocalMacMutationAuthority,
} from "./helpers/local-mac-production-release-fixtures";

const temporaryDirectories: string[] = [];
const AMBIENT_SECRET = "ambient-secret-should-not-leak";
const EXPECTED_SANITIZED_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
const EXPECTED_USRBIN_NODE_SANITIZED_PATH =
  "/usr/bin:/opt/homebrew/bin:/usr/local/bin:/bin:/usr/sbin:/sbin";
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
    lockToken: "55555555-5555-4555-8555-555555555555",
  }).mutationAuthority;
}

function expectProgramArgumentsOrder(plist: string, entries: string[]) {
  const expected = `<key>ProgramArguments</key>
  <array>
${entries.map((entry) => `    <string>${entry}</string>`).join("\n")}
  </array>`;

  expect(plist).toContain(expected);
}

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe("full-local launch agent helpers", () => {
  it("accepts the pnpm separator and resolves absolute install arguments", () => {
    const result = parseFullLocalLaunchAgentArgs(
      ["install", "--", "--config", "infra/full-local-supabase/.env.production.local"],
      { cwd: "/Users/tester/homecook" },
    );

    expect(result.command).toBe("install");
    expect(result.configPath).toBe(
      "/Users/tester/homecook/infra/full-local-supabase/.env.production.local",
    );
  });

  it("requires an absolute mode 0600 config file path", () => {
    const rootDir = createTempDirectory("full-local-launch-agent-config-");
    const configPath = join(rootDir, ".env.production.local");
    writeFileSync(configPath, "FULL_LOCAL_SITE_URL=https://app.mumeok.kr\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(configPath, 0o600);

    expect(
      validateFullLocalLaunchAgentConfigPath({
        configPath,
      }),
    ).toBe(configPath);

    chmodSync(configPath, 0o644);
    expect(() =>
      validateFullLocalLaunchAgentConfigPath({
        configPath,
      }),
    ).toThrow(/mode 0600/i);
  });

  it("renders a plist that starts the full-local runtime without embedding secrets", () => {
    const rootDir = "/Users/tester/homecook";
    const homeDir = "/Users/tester";
    const configPath = "/Users/tester/homecook/infra/full-local-supabase/.env.production.local";
    process.env.FULL_LOCAL_TEST_SECRET = AMBIENT_SECRET;

    try {
      const plist = renderFullLocalLaunchAgentPlist({
        configPath,
        homeDir,
        nodeBin: "/opt/homebrew/bin/node",
        rootDir,
      });

      expectProgramArgumentsOrder(plist, [
        "/usr/bin/env",
        "-i",
        `HOME=${homeDir}`,
        `PATH=${EXPECTED_SANITIZED_PATH}`,
        "/opt/homebrew/bin/node",
        `${rootDir}/scripts/full-local-production-runtime.mjs`,
        "start",
        "--config",
        configPath,
      ]);

      expect(plist).toContain(`<string>${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}</string>`);
      expect(plist).toContain("<key>RunAtLoad</key>");
      expect(plist).toContain("<key>SuccessfulExit</key>");
      expect(plist).toContain("<false/>");
      expect(plist).toContain("<string>/usr/bin/env</string>");
      expect(plist).toContain("<string>-i</string>");
      expect(plist).toContain(`<string>HOME=${homeDir}</string>`);
      expect(plist).toContain(`<string>PATH=${EXPECTED_SANITIZED_PATH}</string>`);
      expect(plist).toContain("<string>/opt/homebrew/bin/node</string>");
      expect(plist).toContain(`<string>${rootDir}/scripts/full-local-production-runtime.mjs</string>`);
      expect(plist).toContain("<string>start</string>");
      expect(plist).toContain("<string>--config</string>");
      expect(plist).toContain(`<string>${configPath}</string>`);
      expect(plist).toContain(`<string>${rootDir}</string>`);
      expect(plist).toContain(
        "/Users/tester/Library/Logs/Homecook/full-local-production.out.log",
      );
      expect(plist).toContain(
        "/Users/tester/Library/Logs/Homecook/full-local-production.err.log",
      );
      expect(plist).not.toContain("<key>EnvironmentVariables</key>");
      expect(plist).not.toContain("FULL_LOCAL_SITE_URL=https://app.mumeok.kr");
      expect(plist).not.toContain(AMBIENT_SECRET);
      expect(plist).not.toContain("<key>FULL_LOCAL_TEST_SECRET</key>");
    } finally {
      delete process.env.FULL_LOCAL_TEST_SECRET;
    }
  });

  it("deduplicates the sanitized launch agent PATH when node already lives in a default bin dir", () => {
    const plist = renderFullLocalLaunchAgentPlist({
      configPath: "/Users/tester/homecook/infra/full-local-supabase/.env.production.local",
      homeDir: "/Users/tester",
      nodeBin: "/usr/bin/node",
      rootDir: "/Users/tester/homecook",
    });

    expectProgramArgumentsOrder(plist, [
      "/usr/bin/env",
      "-i",
      "HOME=/Users/tester",
      `PATH=${EXPECTED_USRBIN_NODE_SANITIZED_PATH}`,
      "/usr/bin/node",
      "/Users/tester/homecook/scripts/full-local-production-runtime.mjs",
      "start",
      "--config",
      "/Users/tester/homecook/infra/full-local-supabase/.env.production.local",
    ]);
    expect(plist).toContain(`<string>PATH=${EXPECTED_USRBIN_NODE_SANITIZED_PATH}</string>`);
    expect(plist).not.toContain(
      "<string>PATH=/usr/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:",
    );
    expect(plist).not.toContain("<string>PATH=/usr/bin:/opt/homebrew/bin:/opt/homebrew/bin:");
  });

  it("parses loaded and unloaded launchctl print output", () => {
    expect(
      parseLaunchctlPrintStatus({
        label: DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL,
        serviceTarget: `gui/501/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}`,
        status: 0,
        stdout: `
system/com.apple.xpc.launchd.domain.user.501.100007.Aqua/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL} = {
  active count = 1
  path = /Users/tester/Library/LaunchAgents/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}.plist
  state = waiting
  pid = 1234
}`,
        stderr: "",
      }),
    ).toMatchObject({
      loaded: true,
      pid: 1234,
      state: "waiting",
    });

    expect(
      parseLaunchctlPrintStatus({
        label: DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL,
        serviceTarget: `gui/501/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}`,
        status: 113,
        stdout: "",
        stderr: "Could not find service",
      }),
    ).toMatchObject({
      loaded: false,
      pid: null,
      state: "unloaded",
    });
  });

  it("reads launch agent status via the absolute /bin/launchctl binary", () => {
    const homeDir = createTempDirectory("full-local-launch-agent-status-");
    const paths = getFullLocalLaunchAgentPaths(homeDir);
    mkdirSync(join(homeDir, "Library/LaunchAgents"), { recursive: true });
    writeFileSync(
      paths.plistPath,
      `<plist><dict><array><string>--config</string><string>/tmp/full-local.env</string></array></dict></plist>`,
      { encoding: "utf8", mode: 0o600 },
    );
    chmodSync(paths.plistPath, 0o600);

    const calls: string[] = [];
    const result = readFullLocalLaunchAgentStatus({
      getuid: () => 501,
      homeDir,
      platform: "darwin",
      spawn: (command, args) => {
        calls.push(`${command} ${args.join(" ")}`);
        return {
          status: 0,
          stdout: `state = waiting\npid = 4321\n`,
          stderr: "",
        };
      },
    });

    expect(result).toMatchObject({
      configPath: "/tmp/full-local.env",
      loaded: true,
      pid: 4321,
      serviceTarget: `gui/501/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}`,
      state: "waiting",
    });
    expect(calls).toEqual([
      `/bin/launchctl print gui/501/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}`,
    ]);
  });
});

describe("full-local launch agent install and uninstall", () => {
  it("blocks CLI mutation commands unless explicit release authority flags are provided", () => {
    for (const command of ["install", "uninstall"]) {
      const result = spawnSync(process.execPath, ["scripts/full-local-launch-agent.mjs", command], {
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

  it("installs a mode 0600 plist, creates Homecook logs, and bootstraps the service", () => {
    const rootDir = createTempDirectory("full-local-launch-agent-root-");
    const homeDir = createTempDirectory("full-local-launch-agent-home-");
    const mutationAuthority = createMutationAuthority({
      command: "install",
      homeDir,
      rootDir,
    });
    const configPath = join(rootDir, "infra/full-local-supabase/.env.production.local");
    mkdirSync(join(rootDir, "infra/full-local-supabase"), { recursive: true });
    mkdirSync(join(rootDir, "scripts"), { recursive: true });
    writeFileSync(join(rootDir, "scripts/full-local-production-runtime.mjs"), "", "utf8");
    writeFileSync(configPath, "FULL_LOCAL_SITE_URL=https://app.mumeok.kr\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(configPath, 0o600);

    const launchctlCalls: string[] = [];
    const result = installFullLocalLaunchAgent({
      mutationAuthority,
      configPath,
      getuid: () => 501,
      homeDir,
      nodeBin: "/opt/homebrew/bin/node",
      platform: "darwin",
      rootDir,
      spawn: (command, args) => {
        launchctlCalls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    const paths = getFullLocalLaunchAgentPaths(homeDir);
    expect(result).toMatchObject({
      changed: true,
      configPath,
      label: DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL,
      plistPath: paths.plistPath,
    });
    expect(statSync(paths.plistPath).mode & 0o777).toBe(0o600);
    const plist = readFileSync(paths.plistPath, "utf8");
    expectProgramArgumentsOrder(plist, [
      "/usr/bin/env",
      "-i",
      `HOME=${homeDir}`,
      `PATH=${EXPECTED_SANITIZED_PATH}`,
      "/opt/homebrew/bin/node",
      `${rootDir}/scripts/full-local-production-runtime.mjs`,
      "start",
      "--config",
      configPath,
    ]);
    expect(plist).toContain(configPath);
    expect(plist).toContain("<string>/usr/bin/env</string>");
    expect(plist).toContain("<string>-i</string>");
    expect(plist).toContain(`<string>HOME=${homeDir}</string>`);
    expect(plist).toContain(`<string>PATH=${EXPECTED_SANITIZED_PATH}</string>`);
    expect(plist).not.toContain("<key>EnvironmentVariables</key>");
    expect(plist).not.toContain("FULL_LOCAL_SITE_URL=");
    expect(plist).not.toContain(AMBIENT_SECRET);
    expect(launchctlCalls).toEqual([
      `/bin/launchctl bootout gui/501 ${paths.plistPath}`,
      `/bin/launchctl bootstrap gui/501 ${paths.plistPath}`,
      `/bin/launchctl kickstart -k gui/501/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}`,
    ]);
  });

  it("rejects an existing plist symlink before writing or launchctl mutation", () => {
    const rootDir = createTempDirectory("full-local-launch-agent-symlink-root-");
    const homeDir = createTempDirectory("full-local-launch-agent-symlink-home-");
    const mutationAuthority = createMutationAuthority({ command: "install", homeDir, rootDir });
    const configPath = join(rootDir, "infra/full-local-supabase/.env.production.local");
    mkdirSync(join(rootDir, "infra/full-local-supabase"), { recursive: true });
    mkdirSync(join(rootDir, "scripts"), { recursive: true });
    writeFileSync(join(rootDir, "scripts/full-local-production-runtime.mjs"), "", "utf8");
    writeFileSync(configPath, "FULL_LOCAL_SITE_URL=https://app.mumeok.kr\n", { mode: 0o600 });
    chmodSync(configPath, 0o600);
    const paths = getFullLocalLaunchAgentPaths(homeDir);
    mkdirSync(join(homeDir, "Library", "LaunchAgents"), { recursive: true });
    const externalPath = join(homeDir, "unrelated.txt");
    writeFileSync(externalPath, "do-not-overwrite\n");
    symlinkSync(externalPath, paths.plistPath);
    const launchctlCalls: string[] = [];

    expect(() => installFullLocalLaunchAgent({
      mutationAuthority,
      configPath,
      getuid: () => process.getuid?.() ?? 501,
      homeDir,
      nodeBin: process.execPath,
      platform: "darwin",
      rootDir,
      spawn: (command, args) => {
        launchctlCalls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      },
    })).toThrow(/plist|symlink|symbolic/iu);
    expect(readFileSync(externalPath, "utf8")).toBe("do-not-overwrite\n");
    expect(launchctlCalls).toEqual([]);
  });

  it("blocks direct helper mutations before launchctl when no validated authority is provided", () => {
    const installCalls: string[] = [];
    expect(() => installFullLocalLaunchAgent({
      configPath: "/Users/tester/homecook/infra/full-local-supabase/.env.production.local",
      getuid: () => 501,
      homeDir: "/Users/tester",
      nodeBin: "/opt/homebrew/bin/node",
      platform: "darwin",
      rootDir: "/Users/tester/homecook",
      spawn: (command, args) => {
        installCalls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      },
    })).toThrow(/validated release authority|release authority|--release-manifest/iu);
    expect(installCalls).toEqual([]);

    const uninstallCalls: string[] = [];
    expect(() => uninstallFullLocalLaunchAgent({
      getuid: () => 501,
      homeDir: "/Users/tester",
      platform: "darwin",
      spawn: (command, args) => {
        uninstallCalls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      },
    })).toThrow(/validated release authority|release authority|--release-manifest/iu);
    expect(uninstallCalls).toEqual([]);
  });

  it("uninstall only unloads and removes the plist", () => {
    const homeDir = createTempDirectory("full-local-launch-agent-remove-");
    const rootDir = createTempDirectory("full-local-launch-agent-remove-root-");
    const mutationAuthority = createMutationAuthority({
      command: "uninstall",
      homeDir,
      rootDir,
    });
    const paths = getFullLocalLaunchAgentPaths(homeDir);
    mkdirSync(join(homeDir, "Library/LaunchAgents"), { recursive: true });
    writeFileSync(paths.plistPath, "<plist/>", { encoding: "utf8", mode: 0o600 });
    chmodSync(paths.plistPath, 0o600);

    const calls: string[] = [];
    const result = uninstallFullLocalLaunchAgent({
      mutationAuthority,
      getuid: () => 501,
      homeDir,
      platform: "darwin",
      spawn: (command, args) => {
        calls.push(`${command} ${args.join(" ")}`);
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    expect(result).toMatchObject({
      label: DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL,
      removed: true,
      plistPath: paths.plistPath,
    });
    expect(calls).toEqual([
      `/bin/launchctl bootout gui/501 ${paths.plistPath}`,
    ]);
  });
});
