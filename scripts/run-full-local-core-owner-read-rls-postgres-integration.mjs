#!/usr/bin/env node

process.env.HOMECOOK_ISOLATED_RUNTIME_INTEGRATION_TEST =
  "tests/full-local-core-owner-read-rls-postgres.integration.test.ts";
process.env.HOMECOOK_FULL_LOCAL_CORE_OWNER_READ_RLS_PG = "1";

await import("./run-isolated-local-supabase-runtime-gate.mjs");
