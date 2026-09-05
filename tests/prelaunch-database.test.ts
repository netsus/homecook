import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => { throw new Error("Docker must not run"); }) }));
import { planPrelaunchMigrations, validatePrelaunchMigrationSql, createPrelaunchDatabaseEngine, createPrelaunchDatabase, readPrelaunchMigrationFiles } from "../scripts/lib/prelaunch-database.mjs";

const a = { filename: "20260905010000_first.sql", sha256: "a".repeat(64), sql: "create table public.first (id integer);" };
const b = { filename: "20260905020000_second.sql", sha256: "b".repeat(64), sql: "alter table public.first add column title text;" };
const baseline = { schema: "homecook.prelaunch-db-baseline.v1", verified: true, applied: [a] };

describe("prelaunch database planning", () => {
  it("requires explicit adoption rather than guessing from application versions", () => {
    expect(planPrelaunchMigrations([a, b], { exists: false, applied: [], supabaseVersions: [] })).toMatchObject({ baselineRequired: true });
  });
  it("adopts verified prefix and applies only unapplied files", () => {
    expect(planPrelaunchMigrations([a, b], { exists: false, applied: [], supabaseVersions: [] }, baseline)).toMatchObject({ baselineRequired: false, pending: [b.filename] });
  });
  it("rejects changed/deleted applied SQL and out of order history", () => {
    const state = { exists: true, applied: [a], supabaseVersions: [] };
    expect(() => planPrelaunchMigrations([{ ...a, sha256: "c".repeat(64) }], state)).toThrow(/changed|checksum/i);
    expect(() => planPrelaunchMigrations([], state)).toThrow(/missing|deleted/i);
    expect(() => planPrelaunchMigrations([a, b], { ...state, applied: [b] })).toThrow(/prefix|order/i);
  });
  it("requires baseline and existing Supabase history to agree exactly", () => {
    expect(() => planPrelaunchMigrations([a, b], { exists: false, applied: [], supabaseVersions: ["20260905020000"] }, baseline)).toThrow(/Supabase/i);
    expect(() => planPrelaunchMigrations([a], { exists: false, applied: [], supabaseVersions: [] }, { ...baseline, verified: false })).toThrow(/verified/i);
  });
});

describe("bounded additive SQL", () => {
  it("allows additive SQL with one outer transaction and harmless strings/comments", () => {
    const sql = "-- drop table x;\nbegin; create table public.example (label text default 'COMMIT; \\\\echo'); alter table public.example add column enabled boolean default false; commit;";
    expect(validatePrelaunchMigrationSql(sql)).toContain("create table");
    expect(validatePrelaunchMigrationSql(sql)).not.toMatch(/^begin;/i);
  });
  it.each(["CREATE UNIQUE INDEX ux ON existing (id);", "ALTER TABLE existing ADD COLUMN x text NOT NULL;", "ALTER TABLE existing ADD CONSTRAINT accepted CHECK (id>10);"])("allows additive restriction for separately verified old-app compatibility: %s", (sql) => {
    expect(validatePrelaunchMigrationSql(sql)).toContain(sql);
  });
  it.each(["COMMIT; CREATE TABLE x (id int);", "BEGIN; CREATE TABLE x (id int); COMMIT; COMMIT;", "\\i /tmp/secret", "COPY x FROM PROGRAM 'cmd';", "ALTER SYSTEM SET x = 'a';", "CREATE INDEX CONCURRENTLY x ON y (id);", "VACUUM;", "DROP TABLE x;", "DELETE FROM x;", "UPDATE x SET id=2;", "ALTER TABLE x ALTER COLUMN id TYPE text;", "DO $$ BEGIN EXECUTE 'DROP TABLE x'; END $$;", "SET session_replication_role=replica;", "CREATE TABLE homecook_deploy.migrations(id int);", "CREATE TABLE x(id int); \\echo secret", "CREATE TABLE x(id int) /* unclosed"])("rejects unsafe operation %s", (sql) => {
    expect(() => validatePrelaunchMigrationSql(sql)).toThrow();
  });
});

describe("backup-before-apply orchestration", () => {
  function fixture() {
    const calls: string[] = [];
    let applied: typeof a[] = [];
    const adapter = {
      inspect: async () => { calls.push("inspect"); return { id: "exact-container", volume: "owned-volume" }; },
      readState: async () => ({ exists: true, applied, supabaseVersions: [] }),
      backup: async () => { calls.push("backup"); return "/private/backups/db.dump"; },
      transact: async (_identity: unknown, _state: unknown, _baseline: unknown, pending: typeof a[]) => { calls.push("apply"); applied = pending; },
    };
    return { calls, adapter, engine: createPrelaunchDatabaseEngine({ readMigrations: async () => [a], adapter }) };
  }
  it("plans read-only, backs up first, verifies, and makes retry a no-op", async () => {
    const { engine, calls } = fixture();
    await engine.plan();
    expect(calls).not.toContain("backup");
    expect(await engine.apply()).toMatchObject({ changed: true, applied: [a.filename] });
    expect(calls.indexOf("backup")).toBeLessThan(calls.indexOf("apply"));
    expect(await engine.verify()).toMatchObject({ pending: [] });
    expect(await engine.apply()).toMatchObject({ changed: false });
  });
  it("preserves recovery metadata when commit succeeds but verification cannot complete", async () => {
    const { adapter, engine } = fixture();
    adapter.transact = async () => { adapter.readState = async () => { throw new Error("database unavailable"); }; };
    await expect(engine.apply()).rejects.toMatchObject({ databaseState: { changed: true, outcome: "committed", applied: [a.filename], backupPath: "/private/backups/db.dump" } });
  });
  it("records a confirmed transaction rollback without claiming changed data", async () => {
    const { adapter, engine } = fixture();
    adapter.transact = async () => { throw Object.assign(new Error("SQL rejected"), { transactionRolledBack: true }); };
    await expect(engine.apply()).rejects.toMatchObject({ databaseState: { changed: false, outcome: "rolled_back", applied: [], attempted: [a.filename], backupPath: "/private/backups/db.dump" } });
  });
  it("marks an interrupted transaction outcome uncertain with its backup", async () => {
    const { adapter, engine } = fixture();
    adapter.transact = async () => { throw new Error("connection interrupted"); };
    await expect(engine.apply()).rejects.toMatchObject({ databaseState: { changed: true, outcome: "uncertain", applied: [], attempted: [a.filename], backupPath: "/private/backups/db.dump" } });
  });
  it("does not mutate when cancellation arrives while backup is pending", async () => {
    const { adapter, calls } = fixture();
    let finishBackup!: () => void;
    let startedBackup!: () => void;
    const started = new Promise<void>((resolve) => { startedBackup = resolve; });
    const backupPending = new Promise<void>((resolve) => { finishBackup = resolve; });
    let cancelled = false;
    adapter.backup = async () => { startedBackup(); await backupPending; return "/private/backups/db.dump"; };
    const engine = createPrelaunchDatabaseEngine({ readMigrations: async () => [a], adapter, checkCancelled: () => { if (cancelled) throw new Error("deployment cancelled"); } });
    const applying = engine.apply();
    await started;
    cancelled = true;
    finishBackup();
    await expect(applying).rejects.toThrow("deployment cancelled");
    expect(calls).not.toContain("apply");
  });
  it("does not apply after backup failure or target change", async () => {
    const first = fixture();
    first.adapter.backup = async () => { throw new Error("backup failed"); };
    await expect(first.engine.apply()).rejects.toThrow("backup failed");
    expect(first.calls).not.toContain("apply");
    const second = fixture();
    second.adapter.backup = async () => { second.adapter.inspect = async () => ({ id: "different", volume: "owned-volume" }); return "dump"; };
    await expect(second.engine.apply()).rejects.toThrow(/identity|target/i);
    expect(second.calls).not.toContain("apply");
  });
});


describe("private config and exact migration bytes", () => {
  async function files() {
    const root = await mkdtemp(path.join(os.tmpdir(), "prelaunch-db-files-"));
    const repositoryRoot = path.join(root, "repo");
    const migrations = path.join(repositoryRoot, "supabase/migrations");
    await mkdir(migrations, { recursive: true });
    const configPath = path.join(root, "database.env");
    await writeFile(configPath, "FULL_LOCAL_COMPOSE_PROJECT_NAME=private-project\n", { mode: 0o600 });
    return { root, repositoryRoot, migrations, configPath };
  }
  it.each(["readable", "symlink", "in-repository"])("rejects %s config before any Docker call", async (kind) => {
    const fixture = await files();
    try {
      let configPath = fixture.configPath;
      if (kind === "readable") await chmod(configPath, 0o644);
      if (kind === "symlink") { configPath = path.join(fixture.root, "linked.env"); await symlink(fixture.configPath, configPath); }
      if (kind === "in-repository") { configPath = path.join(fixture.repositoryRoot, "database.env"); await writeFile(configPath, "# private but in git tree", { mode: 0o600 }); }
      vi.mocked(spawnSync).mockClear();
      const database = createPrelaunchDatabase({ repositoryRoot: fixture.repositoryRoot, configPath, backupRoot: path.join(fixture.root, "backups") });
      await expect(database.plan()).rejects.toThrow(/owner-only|outside repository/);
      expect(spawnSync).not.toHaveBeenCalled();
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });
  it("hashes exact source bytes including a UTF-8 BOM and rejects invalid UTF-8", async () => {
    const fixture = await files();
    try {
      const file = path.join(fixture.migrations, a.filename);
      const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(a.sql)]);
      await writeFile(file, bytes);
      expect(await readPrelaunchMigrationFiles(fixture.repositoryRoot)).toMatchObject([{ sha256: createHash("sha256").update(bytes).digest("hex") }]);
      await writeFile(file, Buffer.from([0xc3, 0x28]));
      await expect(readPrelaunchMigrationFiles(fixture.repositoryRoot)).rejects.toThrow(/UTF-8/);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  });
});
