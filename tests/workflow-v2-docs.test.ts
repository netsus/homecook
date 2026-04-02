import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateKnownShape,
  validateWorkflowV2DocContract,
  validateWorkflowV2Bundle,
  validateWorkflowV2Examples,
  validateWorkflowV2TrackedState,
} from "../scripts/lib/validate-workflow-v2.mjs";

const repoRoot = process.cwd();

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as Record<string, unknown>;
}

describe("workflow v2 docs", () => {
  it("includes the expected foundation documents", () => {
    const requiredDocs = [
      "docs/engineering/workflow-v2/README.md",
      "docs/engineering/workflow-v2/charter.md",
      "docs/engineering/workflow-v2/core.md",
      "docs/engineering/workflow-v2/presets.md",
      "docs/engineering/workflow-v2/approval-and-loops.md",
      "docs/engineering/workflow-v2/omo-lite-architecture.md",
      "docs/engineering/workflow-v2/omo-session-orchestrator.md",
      "docs/engineering/workflow-v2/omo-claude-cli-provider.md",
      "docs/engineering/workflow-v2/omo-autonomous-supervisor.md",
      "docs/engineering/workflow-v2/omo-lite-supervisor-spec.md",
      "docs/engineering/workflow-v2/omo-lite-dispatch-contract.md",
      "docs/engineering/workflow-v2/profiles/TEMPLATE.md",
      "docs/engineering/workflow-v2/profiles/homecook.md",
      "docs/engineering/workflow-v2/migration.md",
      "docs/engineering/workflow-v2/schemas/work-item.schema.json",
      "docs/engineering/workflow-v2/schemas/workflow-status.schema.json",
      "docs/engineering/workflow-v2/templates/work-item.example.json",
      "docs/engineering/workflow-v2/templates/workflow-status.example.json",
    ];

    for (const path of requiredDocs) {
      expect(existsSync(join(repoRoot, path))).toBe(true);
    }
  });

  it("keeps work item example aligned with the schema enums and required fields", () => {
    const schema = readJson("docs/engineering/workflow-v2/schemas/work-item.schema.json");
    const example = readJson("docs/engineering/workflow-v2/templates/work-item.example.json");

    expect(validateKnownShape(schema, example)).toEqual([]);
  });

  it("keeps workflow status example aligned with the schema enums and required fields", () => {
    const schema = readJson("docs/engineering/workflow-v2/schemas/workflow-status.schema.json");
    const example = readJson("docs/engineering/workflow-v2/templates/workflow-status.example.json");

    expect(validateKnownShape(schema, example)).toEqual([]);
  });

  it("exposes a reusable validator command contract for workflow v2 examples", () => {
    const results = validateWorkflowV2Examples({ rootDir: repoRoot });

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
  });

  it("validates tracked workflow v2 pilot state", () => {
    const results = validateWorkflowV2TrackedState({ rootDir: repoRoot });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
  });

  it("keeps the workflow-v2 entry docs aligned with the executable pilot baseline", () => {
    const results = validateWorkflowV2DocContract({ rootDir: repoRoot });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
  });

  it("returns a combined validation bundle with no errors", () => {
    const results = validateWorkflowV2Bundle({ rootDir: repoRoot });

    expect(results.length).toBeGreaterThanOrEqual(4);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
  });
});
