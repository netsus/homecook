import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("includes every new r2 helper and RPC in the existing authorization gate", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-security-function-authorization.mjs", "--contract-only"], { encoding: "utf8", env: { ...process.env } });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout + result.stderr).toContain("marketing-demand-validation-round2:10");
}, 15_000);
it("keeps the r2 migration additive and revokes all direct table access", () => {
  const sql = readFileSync("supabase/migrations/20260911100000_marketing_round2.sql", "utf8");
  expect(sql).not.toMatch(/(?:alter table|update|delete from)\s+public\.marketing_validation_sessions/i);
  for (const table of ["participations", "events", "lead_requests"]) {
    expect(sql).toContain(`alter table public.marketing_round2_${table} force row level security`);
  }
  expect(sql).toMatch(/revoke all on public\.marketing_round2_participations[^;]+from public, anon, authenticated, service_role/i);
});

it("tracks the recording-only increment without widening the function authorization inventory", () => {
  const manifest = JSON.parse(readFileSync("docs/security/marketing-round2-security-function-authorization-manifest.json", "utf8"));
  expect(manifest.migrations).toContain("supabase/migrations/20260911120000_marketing_round2_linear_recording.sql");
  expect(manifest.functions.filter((entry: { signature: string }) => entry.signature === "private.marketing_round2_answers(text, text, jsonb)")).toEqual([
    expect.objectContaining({ owner: "postgres", security_mode: "invoker", allowed_principals: [], safe_search_path: ["pg_catalog", "pg_temp"] }),
  ]);
});

const round2ReplayFiles = [
  '20260911100000_marketing_round2.sql',
  '20260911110000_marketing_round2_linear_homeflow.sql',
  '20260911120000_marketing_round2_linear_recording.sql',
  '20260911130000_marketing_round2_scope_compat.sql',
];
it('declares the four reviewed replay migrations in dependency order', () => {
  const manifest = JSON.parse(readFileSync('docs/security/marketing-round2-security-function-authorization-manifest.json', 'utf8'));
  expect(manifest.migrations).toEqual(round2ReplayFiles.map(name => `supabase/migrations/${name}`));
  const backend = readFileSync('scripts/verify-marketing-round2-isolated.mjs', 'utf8');
  expect(backend).toContain('scopeCompatMigration: migrationSources[3]');
  expect(backend.indexOf('sql(scopeCompatMigration)')).toBeGreaterThan(backend.indexOf('recording increment preserves every existing legacy/R2 row and event digest'));
  expect(backend.indexOf('sql(scopeCompatMigration)')).toBeLessThan(backend.indexOf('const reportPath='));
});
it('stages all four UI migrations before startup and leaves files intact if the chain is incomplete', async () => {
  const { mkdtemp, mkdir, writeFile, readdir, rm, unlink } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const runner = await import('../scripts/verify-marketing-round2-ui-isolated.mjs');
  expect(runner).toHaveProperty('stageUiRound2Migrations');
  const stage = (runner as unknown as {stageUiRound2Migrations(root: string): Promise<string[]>}).stageUiRound2Migrations;
  const directory = await mkdtemp(join(tmpdir(), 'r2-replay-chain-'));
  const migrations = join(directory, 'supabase/migrations');
  try {
    await mkdir(migrations, {recursive: true});
    for (const name of round2ReplayFiles) await writeFile(join(migrations, name), name);
    await writeFile(join(migrations, 'earlier.sql'), 'unrelated baseline');
    await unlink(join(migrations, round2ReplayFiles[3]));
    await expect(stage(directory)).rejects.toThrow();
    expect((await readdir(migrations)).sort()).toEqual([...round2ReplayFiles.slice(0,3), 'earlier.sql'].sort());
    await writeFile(join(migrations, round2ReplayFiles[3]), round2ReplayFiles[3]);
    expect(await stage(directory)).toEqual(round2ReplayFiles);
    expect(await readdir(migrations)).toEqual(['earlier.sql']);
  } finally { await rm(directory, {recursive:true, force:true}); }
});
