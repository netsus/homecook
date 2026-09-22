import { describe, expect, it, vi } from "vitest";
import { buildFeatureStateMutation, parseFeatureStateArguments, parsePostgrestDatabaseTarget, resolvePostgrestDatabaseTarget, runFeatureStateOperation } from "../scripts/lib/recipe-snapshot-feature-state.mjs";
const state = () => ({ database: "postgres", mode: "legacy_v1", effective_pair: [null, null], database_pair: [null, null], role_overrides: 0, generation_active: true, missing_meal_pins: 0, mismatched_meal_pins: 0, unmanaged_recipe_images: 0, invalid_private_image_refs: 0 });
const args = (command = "enable", execute = false) => ({ command, execute });
const adapter = (initial = state()) => ({ read: vi.fn().mockResolvedValue(initial), verifyBackup: vi.fn().mockResolvedValue(undefined), verifyTarget: vi.fn().mockResolvedValue(undefined), apply: vi.fn().mockResolvedValue(undefined) });
describe("recipe snapshot operator state", () => {
  it("defaults to read-only and rejects execute on status/plan", () => {
    expect(parseFeatureStateArguments(["--config", "/private/config"])).toMatchObject({ command: "status", execute: false });
    expect(() => parseFeatureStateArguments(["plan", "--execute", "--config", "/private/config"])).toThrow();
    expect(() => parseFeatureStateArguments(["enable", "--config", "/private/config", "--unknown"])).toThrow();
  });
  it("enable without execute is a plan with no backup or mutation", async () => {
    const db = adapter();
    expect(await runFeatureStateOperation(args(), db)).toMatchObject({ writes: 0, status: "PLAN_READY", activation_verified: false });
    expect(db.apply).not.toHaveBeenCalled(); expect(db.verifyBackup).not.toHaveBeenCalled();
  });
  it.each(["role_overrides", "missing_meal_pins", "mismatched_meal_pins", "invalid_private_image_refs"])("blocks %s before any setting write", async (key) => {
    const db = adapter({ ...state(), [key]: 1 });
    await expect(runFeatureStateOperation(args("enable", true), db)).rejects.toThrow();
    expect(db.apply).not.toHaveBeenCalled();
  });
  it("backup or exact target failure leaves all defaults unchanged", async () => {
    for (const failure of ["verifyBackup", "verifyTarget"] as const) {
      const db = adapter(); db[failure].mockRejectedValue(new Error("failed"));
      await expect(runFeatureStateOperation(args("enable", true), db)).rejects.toThrow("failed");
      expect(db.apply).not.toHaveBeenCalled();
    }
  });
  it("verifies a fresh connection and does not claim the app is active", async () => {
    const db = adapter(); db.read.mockResolvedValueOnce(state()).mockResolvedValueOnce({ ...state(), mode: "snapshot_v2", database_pair: ["on", "on"], effective_pair: ["on", "on"] });
    expect(await runFeatureStateOperation(args("enable", true), db)).toMatchObject({ writes: 2, status: "NEW_CONNECTION_DEFAULTS_APPLIED", activation_verified: false });
    expect(db.read).toHaveBeenCalledTimes(2);
    expect(db.verifyBackup.mock.invocationCallOrder[0]).toBeLessThan(db.apply.mock.invocationCallOrder[0]);
  });
  it("disable can recover despite missing pins, does not delete or alter v2 sessions", async () => {
    const db = adapter(); db.read.mockResolvedValueOnce({ ...state(), missing_meal_pins: 2, database_pair: ["on", "on"] }).mockResolvedValueOnce({ ...state(), database_pair: ["off", "off"], effective_pair: ["off", "off"] });
    await runFeatureStateOperation(args("disable", true), db);
    const sql = db.apply.mock.calls[0][0];
    expect(sql).not.toMatch(/(?:update|delete from|truncate)\s+(?:public\.)?(?:cooking|meals|leftover)/i);
    expect(sql).not.toContain("backfill_meal_recipe_content_snapshots()");
    expect(sql).toContain("homecook.personal_recipe_v2 = 'off'");
    expect(sql).toContain("homecook.snapshot_v2_creation = 'off'");
  });
  it("rejects unsafe defaults and refuses silent split fresh-connection state", async () => {
    expect(() => buildFeatureStateMutation(true, ["';select 1;", null])).toThrow();
    const db = adapter(); db.read.mockResolvedValueOnce(state()).mockResolvedValueOnce({ ...state(), database_pair: ["on", "on"], effective_pair: ["on", "off"] });
    await expect(runFeatureStateOperation(args("enable", true), db)).rejects.toThrow("defaults were changed");
  });
});

describe("PostgREST target discovery", () => {
  it("reads URI or libpq conninfo without returning passwords", () => {
    for (const value of ["postgres://authenticator:secret@postgres:5432/postgres", "host=postgres port=5432 dbname=postgres user=authenticator password='secret with spaces'", "host = 'postgres' dbname = 'postgres' user=authenticator password='escaped\\'quote'"]) {
      expect(parsePostgrestDatabaseTarget(value, "prod-postgres-1")).toEqual({ loginRole: "authenticator", database: "postgres" });
    }
  });
  it.each(["host=remote dbname=postgres user=authenticator password=secret", "host=postgres host=remote dbname=postgres user=authenticator", "host=postgres dbname=postgres user=authenticator options='-c homecook.personal_recipe_v2=on'", "host=postgres dbname=postgres user='bad'junk", "postgres://authenticator:secret@postgres/postgres?options=bad"])("rejects ambiguous or overridden targets without leaking input", (value) => {
    expect(() => parsePostgrestDatabaseTarget(value, "prod-postgres-1")).toThrow("exact local database");
  });
  it("derives the actual canonical startup target without reading secrets", () => {
    const input = { environment: ["HOMECOOK_SECRET_EXPORTS=POSTGRES_PASSWORD=postgres_password;PGRST_JWT_SECRET=jwt_jwks"], command: ["/homecook/start-postgrest.sh"], entrypoint: ["/homecook/secret-entrypoint.sh"], canonicalScriptsMatch: true };
    expect(resolvePostgrestDatabaseTarget(input, "prod-postgres-1")).toEqual({ loginRole: "authenticator", database: "postgres" });
    expect(() => resolvePostgrestDatabaseTarget({ ...input, canonicalScriptsMatch: false }, "prod-postgres-1")).toThrow();
    expect(() => resolvePostgrestDatabaseTarget({ ...input, environment: [...input.environment, "HOMECOOK_REHEARSAL_DB_NAME=other"] }, "prod-postgres-1")).toThrow();
  });
  it("keeps unmanaged orphan images as report-only inventory", async () => {
    const db = adapter({ ...state(), unmanaged_recipe_images: 10 });
    expect(await runFeatureStateOperation(args(), db)).toMatchObject({ status: "PLAN_READY", blockers: [], warnings: ["unmanaged_recipe_images_report_only"], writes: 0 });
  });
});
