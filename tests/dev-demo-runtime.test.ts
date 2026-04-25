import { describe, expect, it } from "vitest";

import { buildDevDemoPlan } from "../scripts/lib/dev-demo-runtime.mjs";

describe("dev demo runtime", () => {
  it("applies pending local migrations before checking or seeding demo data", () => {
    expect(
      buildDevDemoPlan({
        isReady: true,
        nextArgs: ["-p", "3100"],
        reset: false,
        seed: false,
        seedArgs: [],
      }),
    ).toEqual([
      {
        args: ["dlx", "supabase", "start"],
        command: "pnpm",
        kind: "command",
        label: "1/4 local Supabase 시작",
      },
      {
        args: ["dlx", "supabase", "migration", "up"],
        command: "pnpm",
        kind: "command",
        label: "2/4 local Supabase migrations apply",
      },
      {
        kind: "message",
        label: "3/4 local demo dataset already ready",
      },
      {
        args: ["-p", "3100"],
        kind: "start-app",
        label: "4/4 local app server start",
      },
    ]);
  });

  it("keeps reset as the full schema rebuild path", () => {
    expect(
      buildDevDemoPlan({
        isReady: false,
        nextArgs: [],
        reset: true,
        seed: false,
        seedArgs: ["--start-date", "2026-04-25"],
      }),
    ).toEqual([
      {
        args: [
          "scripts/local-reset-demo-data.mjs",
          "--start-date",
          "2026-04-25",
        ],
        command: "node",
        kind: "command",
        label: "1/2 local demo dataset reset",
      },
      {
        args: [],
        kind: "start-app",
        label: "2/2 local app server start",
      },
    ]);
  });
});
