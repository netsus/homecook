import { describe, expect, it } from "vitest";

import {
  DEFAULT_TICK_INTERVAL_SECONDS,
  formatLaunchAgentSnapshot,
  getDefaultTickLogPaths,
  parseLaunchAgentSnapshotOutput,
  renderLaunchAgentPlist,
  verifyLaunchAgentAlignment,
} from "../scripts/lib/omo-scheduler.mjs";

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
});
