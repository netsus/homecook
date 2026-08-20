#!/usr/bin/env node

process.env.HOMECOOK_ISOLATED_RUNTIME_INTEGRATION_TEST =
  "tests/legacy-product-compat-postgres.integration.test.ts";
process.env.HOMECOOK_ISOLATED_RUNTIME_SKIP_RESET = "1";

await import("./run-isolated-local-supabase-runtime-gate.mjs");
