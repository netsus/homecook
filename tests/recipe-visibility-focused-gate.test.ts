import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FOCUSED_SCRIPT =
  "vitest run tests/recipe-visibility-*.test.ts tests/recipe-image-*.test.ts --exclude '**/*.integration.test.ts' --exclude '**/*.live.test.ts'";
const FOCUSED_COMMAND = "pnpm test:recipe-visibility-read-hardening:focused";
const STALE_DIRECT_COMMAND =
  "pnpm exec vitest run tests/recipe-visibility-read-hardening.test.ts tests/recipe-visibility-routes.test.ts tests/recipe-visibility-security.test.ts tests/recipe-image-registry.test.ts tests/recipe-image-lifecycle.test.ts tests/recipe-visibility-account-delete.test.ts";

describe("recipe visibility focused verification gate", () => {
  it("uses the maintained focused package command instead of silently ignored files", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const automationSpec = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          "docs/workpacks/recipe-visibility-read-hardening/automation-spec.json",
        ),
        "utf8",
      ),
    ) as {
      backend?: {
        verify_commands?: string[];
        required_test_targets?: string[];
      };
    };
    const workItem = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          ".workflow-v2/work-items/recipe-visibility-read-hardening.json",
        ),
        "utf8",
      ),
    ) as { verification?: { required_checks?: string[] } };
    const status = JSON.parse(
      readFileSync(
        path.join(process.cwd(), ".workflow-v2/status.json"),
        "utf8",
      ),
    ) as {
      items?: Array<{ id?: string; required_checks?: string[] }>;
    };
    const statusItem = status.items?.find(
      (item) => item.id === "recipe-visibility-read-hardening",
    );

    expect(
      packageJson.scripts?.["test:recipe-visibility-read-hardening:focused"],
    ).toBe(FOCUSED_SCRIPT);
    expect(automationSpec.backend?.verify_commands).toContain(
      FOCUSED_COMMAND,
    );
    expect(automationSpec.backend?.required_test_targets).toContain(
      "tests/recipe-visibility-focused-gate.test.ts",
    );
    expect(automationSpec.backend?.required_test_targets).not.toEqual(
      expect.arrayContaining([
        "tests/recipe-image-registry.test.ts",
        "tests/recipe-image-lifecycle.test.ts",
        "tests/recipe-visibility-account-delete.test.ts",
      ]),
    );
    expect(workItem.verification?.required_checks).toContain(FOCUSED_COMMAND);
    expect(workItem.verification?.required_checks).not.toContain(
      STALE_DIRECT_COMMAND,
    );
    expect(statusItem?.required_checks).toContain(FOCUSED_COMMAND);
    expect(statusItem?.required_checks).not.toContain(STALE_DIRECT_COMMAND);
  });
});
