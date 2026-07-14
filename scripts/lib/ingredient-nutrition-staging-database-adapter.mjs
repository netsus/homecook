#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function fail() {
  process.stderr.write("STAGING_DATABASE_QUERY_FAILED\n");
  process.exitCode = 1;
}

let request;
try {
  request = JSON.parse(readFileSync(0, "utf8"));
} catch {
  fail();
}

if (
  process.exitCode !== 1 &&
  (
    request?.schema_version !== "ingredient-nutrition-database-adapter-v1" ||
    request?.operation !== "query-json" ||
    typeof request?.sql !== "string" ||
    request.sql.trim() === "" ||
    request.sql.includes("\0")
  )
) {
  fail();
}

if (process.exitCode !== 1) {
  const result = spawnSync(
    "psql",
    ["-At", "-v", "ON_ERROR_STOP=1", "-c", request.sql],
    {
      encoding: "utf8",
      env: process.env,
      timeout: 30_000,
    },
  );
  const output = result.stdout?.trim().split("\n").filter(Boolean).at(-1);
  try {
    if (result.status !== 0 || result.error || output === undefined) throw new Error();
    const databaseResult = JSON.parse(output);
    process.stdout.write(`${JSON.stringify({
      schema_version: "ingredient-nutrition-database-adapter-result-v1",
      status: "ok",
      result: databaseResult,
    })}\n`);
  } catch {
    fail();
  }
}
