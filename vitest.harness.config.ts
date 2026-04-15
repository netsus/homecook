import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/agent-*.test.ts",
      "tests/authority-evidence-presence.test.ts",
      "tests/bookkeeping-authority.test.ts",
      "tests/check-workpack-docs.test.ts",
      "tests/closeout-sync-validator.test.ts",
      "tests/dev-local-supabase-runtime.test.ts",
      "tests/edit-branch-guard.test.ts",
      "tests/exploratory-qa-evidence.test.ts",
      "tests/frontend-design-skill.test.ts",
      "tests/git-policy.test.ts",
      "tests/meta-harness-auditor.test.ts",
      "tests/next-routes-manifest.test.ts",
      "tests/omo-*.test.ts",
      "tests/playwright-workflow.test.ts",
      "tests/policy-workflow.test.ts",
      "tests/project-hooks-config.test.ts",
      "tests/qa-system.test.ts",
      "tests/real-smoke-presence.test.ts",
      "tests/source-of-truth-sync.test.ts",
      "tests/start-work-branch.test.ts",
      "tests/workflow-v2-docs.test.ts",
    ],
  },
});
