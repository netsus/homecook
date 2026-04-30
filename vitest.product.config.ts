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
      "tests/*.backend.test.ts",
      "tests/auth-*.test.ts",
      "tests/*cook*.test.tsx",
      "tests/home-screen.test.tsx",
      "tests/local-dev-*.test.ts",
      "tests/local-dev-*.test.tsx",
      "tests/local-google-oauth-env.test.ts",
      "tests/login-screen.test.tsx",
      "tests/mypage-*.test.tsx",
      "tests/pantry-*.test.tsx",
      "tests/pending-action.test.ts",
      "tests/planner-*.test.ts",
      "tests/planner-*.test.tsx",
      "tests/qa-fixture-*.test.ts",
      "tests/qa-fixture-*.test.tsx",
      "tests/recipe-*.test.ts",
      "tests/recipe-*.test.tsx",
      "tests/settings-*.test.tsx",
      "tests/shopping-*.test.tsx",
      "tests/slice-*-performance-fixture.test.ts",
      "tests/social-login-buttons.test.tsx",
      "tests/supabase-server.test.ts",
      "tests/user-bootstrap.test.ts",
    ],
  },
});
