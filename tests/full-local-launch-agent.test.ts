import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
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
  renderFullLocalLaunchAgentPlist,
  uninstallFullLocalLaunchAgent,
  validateFullLocalLaunchAgentConfigPath,
} from "../scripts/lib/full-local-launch-agent.mjs";

const temporaryDirectories: string[] = [];

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
    writeFileSync(configPath, "FULL_LOCAL_SITE_URL=https://app.mumeok.com\n", {
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
    const plist = renderFullLocalLaunchAgentPlist({
      configPath,
      homeDir,
      nodeBin: "/opt/homebrew/bin/node",
      rootDir,
    });

    expect(plist).toContain(`<string>${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}</string>`);
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<key>SuccessfulExit</key>");
    expect(plist).toContain("<false/>");
    expect(plist).toContain("<string>/opt/homebrew/bin/node</string>");
    expect(plist).toContain(
      `<string>${rootDir}/scripts/full-local-production-runtime.mjs</string>`,
    );
    expect(plist).toContain("<string>start</string>");
    expect(plist).toContain("<string>--config</string>");
    expect(plist).toContain(`<string>${configPath}</string>`);
    expect(plist).toContain(`<string>${rootDir}</string>`);
    expect(plist).toContain("/Users/tester/Library/Logs/Homecook/full-local-production.out.log");
    expect(plist).toContain("/Users/tester/Library/Logs/Homecook/full-local-production.err.log");
    expect(plist).not.toContain("FULL_LOCAL_SITE_URL=https://app.mumeok.com");
    expect(plist).not.toContain("<key>EnvironmentVariables</key>");
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
});

describe("full-local launch agent install and uninstall", () => {
  it("installs a mode 0600 plist, creates Homecook logs, and bootstraps the service", () => {
    const rootDir = createTempDirectory("full-local-launch-agent-root-");
    const homeDir = createTempDirectory("full-local-launch-agent-home-");
    const configPath = join(rootDir, "infra/full-local-supabase/.env.production.local");
    mkdirSync(join(rootDir, "infra/full-local-supabase"), { recursive: true });
    mkdirSync(join(rootDir, "scripts"), { recursive: true });
    writeFileSync(join(rootDir, "scripts/full-local-production-runtime.mjs"), "", "utf8");
    writeFileSync(configPath, "FULL_LOCAL_SITE_URL=https://app.mumeok.com\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(configPath, 0o600);

    const launchctlCalls: string[] = [];
    const result = installFullLocalLaunchAgent({
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
    expect(readFileSync(paths.plistPath, "utf8")).toContain(configPath);
    expect(readFileSync(paths.plistPath, "utf8")).not.toContain("FULL_LOCAL_SITE_URL=");
    expect(launchctlCalls).toEqual([
      `launchctl bootout gui/501 ${paths.plistPath}`,
      `launchctl bootstrap gui/501 ${paths.plistPath}`,
      `launchctl kickstart -k gui/501/${DEFAULT_FULL_LOCAL_LAUNCH_AGENT_LABEL}`,
    ]);
  });

  it("uninstall only unloads and removes the plist", () => {
    const homeDir = createTempDirectory("full-local-launch-agent-remove-");
    const paths = getFullLocalLaunchAgentPaths(homeDir);
    mkdirSync(join(homeDir, "Library/LaunchAgents"), { recursive: true });
    writeFileSync(paths.plistPath, "<plist/>", { encoding: "utf8", mode: 0o600 });
    chmodSync(paths.plistPath, 0o600);

    const calls: string[] = [];
    const result = uninstallFullLocalLaunchAgent({
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
      `launchctl bootout gui/501 ${paths.plistPath}`,
    ]);
  });
});
