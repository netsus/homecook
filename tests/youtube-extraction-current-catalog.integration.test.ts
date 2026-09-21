import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL?.trim();
const projectId = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID?.trim();
const enabled = Boolean(databaseUrl || projectId);
const container = `supabase_db_${projectId}`;
const expectedSchema = JSON.parse(readFileSync(
  "scripts/manifests/youtube-extraction-expected-schema.json",
  "utf8",
)) as { catalog_fingerprint: string };

function psql(sql: string) {
  const result = spawnSync("docker", [
    "exec", "-i", container, "psql", "-X", "-U", "supabase_admin", "-d", "postgres",
    "-Atq", "-v", "ON_ERROR_STOP=1",
  ], { input: sql, encoding: "utf8", timeout: 30_000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

// The gate supplies a newly replayed, uniquely named container. Never connect
// using the supplied URL: a production loopback URL must not redirect this test.
describe.skipIf(!enabled)("YouTube catalog after all current migrations", () => {
  beforeAll(() => {
    expect(projectId).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    expect(databaseUrl).toMatch(/^postgresql:\/\/[^@\s]+@(?:127\.0\.0\.1|\[::1\]):\d+\/postgres$/u);
    const inspected = spawnSync("docker", ["inspect", container], {
      encoding: "utf8", timeout: 10_000,
    });
    expect(inspected.status, inspected.stderr).toBe(0);
    const [state] = JSON.parse(inspected.stdout) as Array<{
      Config: { Labels: Record<string, string> };
      NetworkSettings: { Ports: Record<string, Array<{ HostPort: string }> | null> };
    }>;
    expect(state.Config.Labels["com.docker.compose.project"]).toBe(projectId);
    expect(state.NetworkSettings.Ports["5432/tcp"]?.map((port) => port.HostPort))
      .toContain(new URL(databaseUrl!).port);
    expect(expectedSchema.catalog_fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("matches the release manifest and passes the DB catalog assertion", () => {
    const fingerprint = psql(`
      begin read only;
      set local request.jwt.claims = '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';
      select public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
      do $check$ begin
        perform private.assert_youtube_extraction_catalog_ready();
      end $check$;
      rollback;
    `);
    // A fresh replay has a disabled policy and bootstrap credential. Its
    // readiness may be false, but its catalog must already match the release.
    expect(fingerprint).toBe(expectedSchema.catalog_fingerprint);
  });

  it("preserves fractional quantities in the installed resolver amount block", () => {
    const definition = psql(`
      select pg_catalog.pg_get_functiondef(
        'public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure
      );
    `);
    const start = definition.indexOf("v_amount_text :=");
    const end = definition.indexOf("v_unit :=", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const amountBlock = definition.slice(start, end);
    // Execute the installed SQL itself, without maintaining a second parser.
    // This isolates amount parsing only; full worker/RPC authority and draft
    // persistence remain covered by the separate policy and worker suites.
    const cases: Array<[string, number | null]> = [
      ["1/2", 0.5], ["1/4", 0.25], ["1 / 2", 0.5], ["1 1/2", 1.5],
      ["0.5", 0.5], ["2", 2], ["1/0", null], ["1/2/3", null],
    ];
    const probes = cases.map(([amount, expected]) => {
      const ingredient = JSON.stringify({ amount }).replaceAll("'", "''");
      return `
        do $quantity$
        declare
          v_ingredient jsonb := '${ingredient}'::jsonb;
          v_amount_text text;
          v_amount_match text;
          v_amount_fraction text[];
          v_amount numeric;
        begin
          ${amountBlock}
          if v_amount is distinct from ${expected ?? "null"}::numeric then
            raise exception 'Unexpected amount for %: expected %, received %',
              v_ingredient->>'amount', ${expected ?? "null"}::numeric, v_amount;
          end if;
        end $quantity$;
      `;
    });
    psql(`begin read only;\n${probes.join("\n")}\nrollback;`);
  });

  it("rejects unreviewed RPC body drift and rolls it back", () => {
    psql(`
      begin;
      set local request.jwt.claims = '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';
      do $probe$
      declare
        v_signature regprocedure := 'public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure;
        v_original text;
        v_changed text;
        v_before text;
      begin
        v_before := public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
        v_original := pg_catalog.pg_get_functiondef(v_signature);
        v_changed := replace(v_original, E'\nbegin\n', E'\nbegin\n  perform 1; -- catalog drift probe\n');
        if v_changed = v_original then
          raise exception 'Catalog drift probe did not change the RPC';
        end if;
        execute v_changed;
        if public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint'
          is not distinct from v_before then
          raise exception 'Catalog fingerprint ignored RPC drift';
        end if;
        begin
          perform private.assert_youtube_extraction_catalog_ready();
          raise exception 'Catalog assertion accepted RPC drift';
        exception when sqlstate '55000' then
          if sqlerrm <> 'YOUTUBE_EXTRACTION_SCHEMA_NOT_READY' then
            raise;
          end if;
        end;
      end $probe$;
      rollback;
    `);
    const fingerprint = psql(`
      begin read only;
      set local request.jwt.claims = '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}';
      select public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
      rollback;
    `);
    expect(fingerprint).toBe(expectedSchema.catalog_fingerprint);
  });
});
