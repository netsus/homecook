import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { assertQuantityInputV4SourceFunctionInventoryResult, buildQuantityInputV4SourceFunctionInventorySql,
  buildFullLocalSecurityInventoryExpression, assertRecipeProductSourceFunctionInventoryResult,
  assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult,
  buildRecipeProductSourceFunctionInventorySql, assertCookedWeightEvidenceSourceFunctionInventoryResult,
  buildCookedWeightEvidenceSourceFunctionInventorySql } from "@/scripts/lib/full-local-security-inventory.mjs";

const path = process.env.HOMECOOK_QUANTITY_CONTRACT_ISOLATED_CONTEXT;
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
let container = ""; let tag = "";
const env: NodeJS.ProcessEnv = { ...process.env, DOCKER_HOST: "unix:///var/run/docker.sock" };
delete env.DOCKER_CONTEXT; delete env.DOCKER_TLS_VERIFY; delete env.DOCKER_CERT_PATH;
function sql(statement: string) {
  const inspected = spawnSync("docker", ["inspect", container], { env, encoding: "utf8", timeout: 10000 });
  expect(inspected.status, inspected.stderr).toBe(0);
  const state = JSON.parse(inspected.stdout)[0];
  expect(state.Config.Labels["homecook.quantity-v4-test"]).toBe(tag);
  expect(state.Config.Image).toBe(image); expect(state.HostConfig.NetworkMode).toBe("none");
  expect(state.HostConfig.PortBindings ?? {}).toEqual({}); expect(state.HostConfig.Binds ?? []).toEqual([]);
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"],
    { env, input: statement, encoding: "utf8", timeout: 30000 });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout.trim().split("\n").findLast(line => line.startsWith("{")) ?? "null");
}
const options = { includeSnapshotTables: true, includePersonalRecipeFunctions: true, includeRecipeFuturePropagationFunctions: true,
  includeRecipeProductFunctions: true, includeCookedWeightEvidenceFunctions: true, includeQuantityInputV4Functions: true };

describe.skipIf(!path)("integrated C04 source contracts on owned PostgreSQL", () => {
  beforeAll(() => {
    const context = JSON.parse(readFileSync(path!, "utf8"));
    expect(context.container_id).toMatch(/^[a-f0-9]{64}$/u); expect(context.tag).toMatch(/^[a-f0-9]{32}$/u);
    container = context.container_id; tag = context.tag;
  });
  it("binds all changed and preserved signatures including full configuration", () => {
    expect(assertQuantityInputV4SourceFunctionInventoryResult(sql(buildQuantityInputV4SourceFunctionInventorySql())).required_functions).toBe(63);
  });
  it("keeps unmodified C03 and C01 functions alongside the explicit C04 overlay", () => {
    const integrated = { includeCookedWeightEvidenceFunctions: true, includeQuantityInputV4Functions: true };
    expect(assertRecipeProductSourceFunctionInventoryResult(sql(buildRecipeProductSourceFunctionInventorySql(integrated)), integrated).required_functions).toBe(94);
    expect(assertCookedWeightEvidenceSourceFunctionInventoryResult(sql(buildCookedWeightEvidenceSourceFunctionInventorySql())).required_functions).toBe(15);
  });
  it.each(["rename", "config", "body"])("rejects a changed preserved overload: %s", mode => {
    const signature = "public.create_product_planner_entry(uuid,uuid,date,uuid,numeric,text,uuid)";
    const change = mode === "rename" ? `alter function ${signature} rename to missing_quantity_fixture;` : mode === "config"
      ? `alter function ${signature} set row_security=off;` : `do $$ declare d text:=pg_get_functiondef('${signature}'::regprocedure); begin
        execute replace(d,'AS $function$',E'AS $function$\\n-- synthetic body drift'); end $$;`;
    const result = sql(`begin; ${change} ${buildQuantityInputV4SourceFunctionInventorySql()} rollback;`);
    expect(() => assertQuantityInputV4SourceFunctionInventoryResult(result)).toThrow("failed closed");
    expect(assertQuantityInputV4SourceFunctionInventoryResult(sql(buildQuantityInputV4SourceFunctionInventorySql())).body).toBe(0);
  });
  it("counts an unregistered overload and a missing expected signature without NULL suppressing the check", () => {
    const expression = buildFullLocalSecurityInventoryExpression(options);
    const result = sql(`begin; alter function public.create_product_planner_entry(uuid,uuid,date,uuid,numeric,text,uuid)
      rename to missing_quantity_fixture;
      create function public.create_product_planner_entry(text) returns void language sql as 'select';
      select (${expression})::text; rollback;`);
    expect(result.function_missing_count).toBe(1);
    expect(result.unexpected_function_overload_count).toBe(1);
  });
  it("rejects a changed mutation volatility and retains every unrelated baseline mismatch", () => {
    const source = sql(`begin; alter function private.youtube_worker_quantity_write_admission_v4() stable;
      ${buildQuantityInputV4SourceFunctionInventorySql()} rollback;`);
    expect(source.volatility).toBe(1);
    expect(() => assertQuantityInputV4SourceFunctionInventoryResult(source)).toThrow("failed closed");
    const full = sql(`select (${buildFullLocalSecurityInventoryExpression(options)})::text;`);
    expect(full).toMatchObject({ function_source_drift_count: 4, function_owner_drift_count: 18, function_acl_drift_count: 16,
      unexpected_role_membership_count: 8, unexpected_function_overload_count: 0 });
    expect(() => assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult(full, options))
      .toThrow("full-local security inventory failed closed");
  });
});
