import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_TICK_INTERVAL_SECONDS,
  ensureLaunchAgentInstalled,
  formatLaunchAgentSnapshot,
  getDefaultTickLogPaths,
  parseLaunchAgentSnapshotOutput,
  renderLaunchAgentPlist,
  verifyLaunchAgentAlignment,
} from "../scripts/lib/omo-scheduler.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("OMO macOS scheduler", () => {
  it("renders a launchd plist with absolute binaries, logs, and cadence", () => {
    const homeDir = "/Users/tester";
    const rendered = renderLaunchAgentPlist({
      rootDir: "/repo/homecook",
      workItemId: "05-planner-week-core",
      homeDir,
      intervalSeconds: DEFAULT_TICK_INTERVAL_SECONDS,
      bins: {
        pnpm: "/opt/homebrew/bin/pnpm",
        gh: "/opt/homebrew/bin/gh",
        claude: "/opt/homebrew/bin/claude",
        opencode: "/Users/tester/.opencode/bin/opencode",
      },
    });

    expect(rendered).toContain("<string>ai.homecook.omo.tick.05-planner-week-core</string>");
    expect(rendered).toContain("<string>/opt/homebrew/bin/pnpm</string>");
    expect(rendered).toContain("<string>--work-item</string>");
    expect(rendered).toContain("<string>05-planner-week-core</string>");
    expect(rendered).toContain("<integer>600</integer>");
    expect(rendered).toContain("/Users/tester/Library/Logs/homecook/omo-tick-05-planner-week-core.log");
    expect(rendered).toContain("/opt/homebrew/bin:/Users/tester/.opencode/bin");
  });

  it("parses launchctl print output into a comparable snapshot", () => {
    const snapshot = parseLaunchAgentSnapshotOutput({
      workItemId: "05-planner-week-core",
      homeDir: "/Users/tester",
      output: [
        "gui/501/ai.homecook.omo.tick.05-planner-week-core = {",
        "  state = waiting",
        "  runs = 7",
        "  last exit code = 0",
        "  run interval = 600 seconds",
        "  stdout path = /Users/tester/Library/Logs/homecook/omo-tick-05-planner-week-core.log",
        "  stderr path = /Users/tester/Library/Logs/homecook/omo-tick-05-planner-week-core.err.log",
        "}",
      ].join("\n"),
      status: 0,
    });

    expect(snapshot.loaded).toBe(true);
    expect(snapshot.runningNow).toBe(false);
    expect(snapshot.state).toBe("waiting");
    expect(snapshot.runs).toBe(7);
    expect(snapshot.lastExitCode).toBe(0);
    expect(snapshot.intervalSeconds).toBe(600);
    expect(formatLaunchAgentSnapshot(snapshot)).toContain("loaded          : yes");
  });

  it("compares launchctl output with tick-watch JSON and expected cadence", () => {
    const logPaths = getDefaultTickLogPaths("05-planner-week-core", "/Users/tester");
    const launchSnapshot = {
      workItem: "05-planner-week-core",
      label: "ai.homecook.omo.tick.05-planner-week-core",
      loaded: true,
      runningNow: false,
      state: "waiting",
      runs: 7,
      lastExitCode: 0,
      intervalSeconds: 600,
      stdoutLog: logPaths.stdout,
      stderrLog: logPaths.stderr,
      stdoutUpdatedAt: null,
      stderrUpdatedAt: null,
      lastActivityAt: null,
      error: null,
    };

    const verification = verifyLaunchAgentAlignment({
      workItemId: "05-planner-week-core",
      expectedIntervalSeconds: 600,
      homeDir: "/Users/tester",
      launchSnapshot,
      tickWatchSnapshot: {
        ...launchSnapshot,
      },
    });

    expect(verification.ok).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  it("installs the launch agent when supervise needs automatic resume coverage", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "omo-scheduler-"));
    tempDirs.push(homeDir);
    const spawnCalls: string[] = [];
    let printLoaded = false;
    const spawn = ((command: string, argsOrOptions?: readonly string[] | object) => {
      const args = Array.isArray(argsOrOptions) ? argsOrOptions : [];
      spawnCalls.push(`${command} ${args.join(" ")}`);
      if (command !== "launchctl") {
        throw new Error(`unexpected command: ${command}`);
      }

      if (args[0] === "print") {
        if (!printLoaded) {
          return {
            status: 1,
            stdout: "",
            stderr: "service not loaded",
          };
        }

        return {
          status: 0,
          stdout: [
            "gui/501/ai.homecook.omo.tick.07-meal-manage = {",
            "  state = waiting",
            "  runs = 1",
            "  last exit code = 0",
            "  run interval = 600 seconds",
            `  stdout path = ${homeDir}/Library/Logs/homecook/omo-tick-07-meal-manage.log`,
            `  stderr path = ${homeDir}/Library/Logs/homecook/omo-tick-07-meal-manage.err.log`,
            "}",
          ].join("\n"),
          stderr: "",
        };
      }

      if (args[0] === "bootout") {
        return {
          status: 1,
          stdout: "",
          stderr: "service not loaded",
        };
      }

      if (args[0] === "bootstrap") {
        printLoaded = true;
      }

      return {
        status: 0,
        stdout: "",
        stderr: "",
      };
    }) as typeof import("node:child_process").spawnSync;

    const result = ensureLaunchAgentInstalled({
      rootDir: "/repo/homecook",
      workItemId: "07-meal-manage",
      homeDir,
      platform: "darwin",
      getuid: () => 501,
      spawn,
      pnpmBin: "/usr/bin/env",
      ghBin: "/usr/bin/env",
      claudeBin: "/usr/bin/env",
      opencodeBin: "/usr/bin/env",
    });

    expect(result.changed).toBe(true);
    expect(result.installed).toBe(true);
    expect(existsSync(result.plistPath)).toBe(true);
    expect(readFileSync(result.plistPath, "utf8")).toContain("07-meal-manage");
    expect(spawnCalls).toContain(`launchctl bootstrap gui/501 ${result.plistPath}`);
    expect(spawnCalls).toContain("launchctl kickstart -k gui/501/ai.homecook.omo.tick.07-meal-manage");
  });

  it("does not reinstall an already aligned launch agent", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "omo-scheduler-"));
    tempDirs.push(homeDir);
    const plistPath = join(homeDir, "Library", "LaunchAgents", "ai.homecook.omo.tick.07-meal-manage.plist");
    const spawnCalls: string[] = [];
    const uid = 501;
    const rendered = renderLaunchAgentPlist({
      rootDir: "/repo/homecook",
      workItemId: "07-meal-manage",
      homeDir,
      bins: {
        pnpm: "/usr/bin/env",
        gh: "/usr/bin/env",
        claude: "/usr/bin/env",
        opencode: "/usr/bin/env",
      },
    });
    mkdirSync(join(homeDir, "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(plistPath, rendered);

    const spawn = ((command: string, argsOrOptions?: readonly string[] | object) => {
      const args = Array.isArray(argsOrOptions) ? argsOrOptions : [];
      spawnCalls.push(`${command} ${args.join(" ")}`);
      if (command !== "launchctl" || args[0] !== "print") {
        throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
      }

      return {
        status: 0,
        stdout: [
          `gui/${uid}/ai.homecook.omo.tick.07-meal-manage = {`,
          "  state = waiting",
          "  runs = 4",
          "  last exit code = 0",
          "  run interval = 600 seconds",
          `  stdout path = ${homeDir}/Library/Logs/homecook/omo-tick-07-meal-manage.log`,
          `  stderr path = ${homeDir}/Library/Logs/homecook/omo-tick-07-meal-manage.err.log`,
          "}",
        ].join("\n"),
        stderr: "",
      };
    }) as typeof import("node:child_process").spawnSync;

    const result = ensureLaunchAgentInstalled({
      rootDir: "/repo/homecook",
      workItemId: "07-meal-manage",
      homeDir,
      platform: "darwin",
      getuid: () => uid,
      spawn,
      pnpmBin: "/usr/bin/env",
      ghBin: "/usr/bin/env",
      claudeBin: "/usr/bin/env",
      opencodeBin: "/usr/bin/env",
    });

    expect(result.changed).toBe(false);
    expect(spawnCalls).toEqual([`launchctl print gui/${uid}/ai.homecook.omo.tick.07-meal-manage`]);
  });
});
