import { readFileSync } from "node:fs";

const request = JSON.parse(readFileSync(0, "utf8"));
if (
  request.schema_version !== "ingredient-nutrition-database-adapter-v1" ||
  request.operation !== "query-json" ||
  typeof request.sql !== "string"
) {
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({
    schema_version: "ingredient-nutrition-database-adapter-result-v1",
    status: "ok",
    result: { adapter_contract: "accepted" },
  }));
}
