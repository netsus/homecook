import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveIngredientQuantity, type IngredientBasisUnit, type IngredientQuantityInput } from "@/lib/nutrition/ingredient-quantity";
import { density, piece, quantity, quantityCases, volumeDefinition } from "./fixtures/ingredient-quantity-v4";

let bin = "";
let directory = "";
let started = false;
let frozenBefore = "";
let legacyBefore = "";
function run(file: string, args: string[], input?: string) {
  return execFileSync(file, args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function sql(body: string) {
  return run(join(bin, "psql"), ["-XqAt", "-h", directory, "-p", "55473", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], body);
}
function resolve(input: IngredientQuantityInput, target: IngredientBasisUnit) {
  const body = JSON.stringify(input).replaceAll("'", "''");
  return JSON.parse(sql(`select private.resolve_ingredient_quantity_v4('${body}'::jsonb,'${target}');`));
}
function sameQuantity(input: IngredientQuantityInput, target: IngredientBasisUnit) {
  const expected = resolveIngredientQuantity(input, target);
  const actual = resolve(input, target);
  if (expected.status === "resolved") {
    expect(actual.amount).toBeCloseTo(expected.amount, 10);
    expect({ ...actual, amount: expected.amount }).toEqual(expected);
  } else expect(actual).toEqual(expected);
}

beforeAll(() => {
  bin = run("pg_config", ["--bindir"]);
  directory = mkdtempSync("/tmp/homecook-unit-v4-");
  run(join(bin, "initdb"), ["-D", join(directory, "data"), "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"]);
  run(join(bin, "pg_ctl"), ["-D", join(directory, "data"), "-o", `-h '' -k ${directory} -p 55473`, "-l", join(directory, "log"), "-w", "start"]);
  started = true;
  const legacy = readFileSync("supabase/migrations/20261009130000_ingredient_piece_unit_evidence.sql", "utf8");
  const start = legacy.indexOf("create function private.ingredient_piece_unit_family(");
  sql(`create schema private;create role anon;create role authenticated;create role service_role;
    create table public.meal_log_entries_fixture(id integer,quantity jsonb,nutrition jsonb);
    insert into public.meal_log_entries_fixture values(1,'{"amount":1,"unit":"통"}','{"calculation_version":"recipe-nutrition-v3","calories_kcal":3}');
    ${legacy.slice(start, legacy.indexOf("$function$;", start) + 11)}`);
  frozenBefore = sql("select md5(row_to_json(row)::text) from public.meal_log_entries_fixture row;");
  legacyBefore = sql("select md5(pg_get_functiondef('private.ingredient_piece_unit_family(text,boolean)'::regprocedure));");
  sql(readFileSync("supabase/migrations/20261014010000_ingredient_quantity_policy_v4.sql", "utf8"));
}, 30000);
afterAll(() => {
  if (started) run(join(bin, "pg_ctl"), ["-D", join(directory, "data"), "-m", "fast", "-w", "stop"]);
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("isolated v4 SQL and JS contract parity", () => {
  it.each(quantityCases)("$name", (test) => sameQuantity(test.input, test.target));
  it.each([["T", 15], ["t", 5], ["cup", 240], ["cup", 200]] as const)("source %s=%smL", (unit, volume) => {
    const input = quantity(unit, 2); input.unit_context!.volume_definitions = [volumeDefinition(unit, volume)];
    sameQuantity(input, "g");
  });
  it("matches conflicts, ambiguities, preparation, size and edible basis failures", () => {
    const conflict = quantity("큰술", 2);
    conflict.unit_context!.volume_definitions = [{ ...volumeDefinition("큰술", 15), reference_volume_ml: 17.5 }];
    sameQuantity(conflict, "ml");
    const ambiguous = quantity("ml"); ambiguous.unit_context!.densities = [density, { ...density, id: "other" }];
    sameQuantity(ambiguous, "g");
    const changes: Partial<IngredientQuantityInput>[] = [{ preparation_state: "cooked" }, { size_code: "large" },
      { unit_context: { edible_portion_basis: "as_purchased", pieces: [piece] } }];
    for (const change of changes) {
      sameQuantity({ ...quantity("알"), ...change }, "g");
    }
    const stale = quantity("ml"); stale.unit_context!.densities = [{ ...density, source: { ...density.source, freshness_status: "stale" } }];
    sameQuantity(stale, "g");
  });
  it("matches Unicode trimming, exact one-piece observations, origin binding and duplicate definitions", () => {
    const input = quantity("\u00a0알\t");
    input.unit_context!.pieces = [{ ...piece, observed_unit: "1\u00a0알" }];
    sameQuantity(input, "g");
    input.unit_context!.pieces[0].observed_amount = 2;
    sameQuantity(input, "g");
    const cup = quantity("cup"); cup.unit_context!.volume_definitions = [volumeDefinition("cup", 240)];
    cup.unit_context!.source_id = "another"; sameQuantity(cup, "ml");
    cup.unit_context!.source_id = "source"; cup.unit_context!.volume_definitions.push(volumeDefinition("cup", 200));
    sameQuantity(cup, "ml");
  });
  it("preserves actual v3 family semantics, frozen fixture content and denies runtime-role helper access", () => {
    expect(sql("select private.ingredient_piece_unit_family('알'),private.ingredient_piece_unit_family('통');")).toBe("count|count");
    expect(sql("select md5(row_to_json(row)::text) from public.meal_log_entries_fixture row;")).toBe(frozenBefore);
    expect(sql("select md5(pg_get_functiondef('private.ingredient_piece_unit_family(text,boolean)'::regprocedure));")).toBe(legacyBefore);
    expect(sql(`select count(*) from pg_proc where proname in ('ingredient_unit_v4_normalize_text','ingredient_unit_v4_evidence_approved',
      'ingredient_unit_v4_measurement_matches','resolve_ingredient_quantity_v4') and not prosecdef
      and provolatile='i' and pg_get_userbyid(proowner)='postgres' and proconfig is not null;`)).toBe("4");
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const signature of ["ingredient_unit_v4_normalize_text(text,boolean)", "ingredient_unit_v4_evidence_approved(jsonb)",
        "ingredient_unit_v4_measurement_matches(jsonb,jsonb)", "resolve_ingredient_quantity_v4(jsonb,text)"]) {
        expect(sql(`select has_function_privilege('${role}','private.${signature}','EXECUTE');`)).toBe("f");
      }
    }
  });
});
