import { spawnSync } from "node:child_process";

import { describe, expect, test } from "vitest";

const enabled = process.env.HOMECOOK_MEAL_LOG_PG === "1";

function psql(sql: string, expectSuccess = true) {
  const result = spawnSync("docker", [
    "exec", "-i", "supabase_db_homecook", "psql", "-U", "postgres", "-d", "postgres",
    "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { encoding: "utf8" });
  if (expectSuccess) expect(result.status, result.stderr).toBe(0);
  return result;
}

describe.runIf(enabled)("meal-log core PostgreSQL", () => {
  test("fresh schema exposes only service-role RPC execution", () => {
    const result = psql(`
      select jsonb_build_object(
        'table',to_regclass('public.meal_log_entries') is not null,
        'rls',(select relrowsecurity from pg_class where oid='public.meal_log_entries'::regclass),
        'authenticated_insert',has_table_privilege('authenticated','public.meal_log_entries','INSERT'),
        'authenticated_update',has_table_privilege('authenticated','public.meal_log_entries','UPDATE'),
        'authenticated_delete',has_table_privilege('authenticated','public.meal_log_entries','DELETE'),
        'authenticated_rpc',has_function_privilege('authenticated','public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)','EXECUTE'),
        'service_rpc',has_function_privilege('service_role','public.mutate_meal_log_entry(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)','EXECUTE')
      );
    `);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      table: true,
      rls: true,
      authenticated_insert: false,
      authenticated_update: false,
      authenticated_delete: false,
      authenticated_rpc: false,
      service_rpc: true,
    });
  });

  test("database exact-one source constraint rejects an empty source", () => {
    const before = psql("select count(*) from public.meal_log_entries;").stdout.trim();
    const result = psql(`
      begin;
      insert into public.users(id,nickname,social_provider,social_id)
      values('91000000-0000-4000-8000-000000000002','invalid','google','meal-log-invalid');
      insert into public.meal_log_entries(
        id,owner_user_id,account_generation,consumed_local_date,timezone_name_snapshot,
        slot_name_snapshot,source_type,actual_amount,actual_unit,display_name_snapshot,nutrition_evidence_json
      ) values(
        '91000000-0000-4000-8000-000000000001',
        '91000000-0000-4000-8000-000000000002',1,'2026-08-10','Asia/Seoul',
        '아침','cooked_batch',1,'g','invalid','{"calculation_status":"unavailable"}'::jsonb
      );
    `, false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("meal_log_entries_source_exact_one_check");
    expect(psql("select count(*) from public.meal_log_entries;").stdout.trim()).toBe(before);
  });

  test("pointer and event constraints are deferred and cleanup triggers are installed", () => {
    const result = psql(`
      select jsonb_build_object(
        'entry_pointer',(select condeferrable and condeferred from pg_constraint where conname='meal_log_entries_active_consumption_event_id_fkey'),
        'event_entry',(select condeferrable and condeferred from pg_constraint where conname='cooked_batch_quantity_events_meal_log_entry_fk'),
        'entry_trigger',exists(select 1 from pg_trigger where tgname='assert_meal_log_entry_pointer'),
        'event_trigger',exists(select 1 from pg_trigger where tgname='assert_meal_log_event_pointer'),
        'user_cleanup',exists(select 1 from pg_trigger where tgname='cleanup_meal_log_before_user_delete'),
        'batch_cleanup',exists(select 1 from pg_trigger where tgname='zz_cleanup_meal_log_before_cooked_batch_delete')
      );
    `);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      entry_pointer: false,
      event_entry: true,
      entry_trigger: true,
      event_trigger: true,
      user_cleanup: true,
      batch_cleanup: true,
    });
  });

  test("create idempotency canonical payload replays across different generated entry ids", () => {
    const result = psql(`
      begin;
      do $block$
      declare first_claim jsonb; receipt uuid; stored jsonb;
      begin
        first_claim:=private.claim_cooked_batch_operation(
          '92000000-0000-4000-8000-000000000001',1,'meal_log_create',
          '92000000-0000-4000-8000-000000000002',
          jsonb_build_object('entry_id',null,'expected_revision',null,'payload',jsonb_build_object('date','2026-08-10')),
          clock_timestamp()
        );
        receipt:=(first_claim->>'receipt_id')::uuid;
        stored:=jsonb_build_object('success',true,'data',jsonb_build_object('entry_id','92000000-0000-4000-8000-000000000003'),'error',null);
        perform private.finish_cooked_batch_operation(receipt,stored,'92000000-0000-4000-8000-000000000003',clock_timestamp());
      end $block$;
      select private.claim_cooked_batch_operation(
        '92000000-0000-4000-8000-000000000001',1,'meal_log_create',
        '92000000-0000-4000-8000-000000000002',
        jsonb_build_object('entry_id',null,'expected_revision',null,'payload',jsonb_build_object('date','2026-08-10')),
        clock_timestamp()
      )->'replay';
      rollback;
    `);
    expect(result.stdout).toContain("92000000-0000-4000-8000-000000000003");
  });
});
