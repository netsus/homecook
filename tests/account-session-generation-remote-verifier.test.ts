import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const PERSONAL_OWNER_DIGEST =
  "1111111111111111111111111111111111111111111111111111111111111111";

const PERSONAL_OWNER_SOURCE_NAMES = [
  "public.auth_identity_deletion_outbox",
  "public.image_upload_quota_counters",
  "public.mutation_idempotency_keys",
  "public.recipe_image_legacy_positive_references",
  "public.recipe_image_legacy_visibility_targets",
  "public.recipe_image_objects",
  "public.storage_object_deletion_outbox",
  "public.user_account_generation_watermarks",
  "public.user_account_lifecycles",
  "public.user_session_generation_bindings",
  "public.users",
];

const PERSONAL_OWNER_UUID_COLUMNS_FIXTURE = [
  {
    schema_name: "public",
    table_name: "auth_identity_deletion_outbox",
    column_name: "owner_uuid",
    classification: "included_personal_owner",
  },
  {
    schema_name: "public",
    table_name: "user_session_generation_bindings",
    column_name: "owner_uuid",
    classification: "included_personal_owner",
  },
  {
    schema_name: "public",
    table_name: "legacy_account_delete_receipts",
    column_name: "owner_uuid",
    classification: "excluded_evidence",
  },
  {
    schema_name: "public",
    table_name: "operational_events",
    column_name: "actor_user_id",
    classification: "excluded_audit_actor",
  },
  {
    schema_name: "public",
    table_name: "operational_events",
    column_name: "target_user_id",
    classification: "excluded_audit_target",
  },
];

const SAMPLE_ATTEMPT_DIGEST =
  "7777777777777777777777777777777777777777777777777777777777777777";
const SAMPLE_TIMESTAMP = "2026-07-29T05:24:12.000000Z";
const SAMPLE_LATER_TIMESTAMP = "2026-07-29T05:39:12.000000Z";
const SAMPLE_EARLIER_TIMESTAMP = "2026-07-29T05:09:12.000000Z";
const SAMPLE_ALMOST_LATER_TIMESTAMP = "2026-07-29T05:39:11.999999Z";
const OWNER_SIGNAL_DIGEST =
  "2222222222222222222222222222222222222222222222222222222222222222";
const OWNED_UNVERIFIED_DIGEST =
  "3333333333333333333333333333333333333333333333333333333333333333";
const OWNER_PATH_UNVERIFIED_DIGEST =
  "4444444444444444444444444444444444444444444444444444444444444444";
const PUBLIC_SHARED_REHOME_DIGEST =
  "5555555555555555555555555555555555555555555555555555555555555555";
const PRIVATE_CLEANUP_DIGEST =
  "6666666666666666666666666666666666666666666666666666666666666666";

function buildJointStorageInventorySample(overrides = {}) {
  return {
    sampled_at: SAMPLE_TIMESTAMP,
    capability_state: "cutover_maintenance",
    capability_revision: 7,
    capability_cutover_attempt_digest: SAMPLE_ATTEMPT_DIGEST,
    external_write_nonterminal_count: 0,
    owner_id_signal_count: 0,
    strict_legacy_path_signal_count: 0,
    registry_signal_count: 0,
    owner_signal_3_way_union_count: 0,
    owned_unverified_count: 0,
    owner_path_unverified_count: 0,
    known_public_shared_rehome_terminal_count: 0,
    known_public_shared_rehome_pending_count: 0,
    known_private_cleanup_terminal_count: 0,
    known_private_cleanup_pending_count: 0,
    known_private_cleanup_outbox_nonterminal_count: 0,
    known_private_cleanup_outbox_dead_letter_count: 0,
    known_private_cleanup_outbox_generation_mismatch_count: 0,
    known_private_cleanup_outbox_registry_mismatch_count: 0,
    owner_signal_digest: OWNER_SIGNAL_DIGEST,
    owned_unverified_digest: OWNED_UNVERIFIED_DIGEST,
    owner_path_unverified_digest: OWNER_PATH_UNVERIFIED_DIGEST,
    known_public_shared_rehome_digest: PUBLIC_SHARED_REHOME_DIGEST,
    known_private_cleanup_digest: PRIVATE_CLEANUP_DIGEST,
    remote_writes: 0,
    ...overrides,
  };
}

function buildPersonalOwnerInventoryFields(overrides = {}) {
  return {
    public_user_inbound_fks: [],
    personal_owner_count: 2,
    personal_owner_digest: PERSONAL_OWNER_DIGEST,
    personal_owner_without_identity_count: 0,
    personal_owner_sources: PERSONAL_OWNER_SOURCE_NAMES.map((source_name) => ({
      source_name,
      owner_count: source_name === "public.users" ? 2 : 0,
    })),
    personal_owner_uuid_columns: PERSONAL_OWNER_UUID_COLUMNS_FIXTURE,
    personal_owner_inventory_unknown_count: 0,
    personal_owner_inventory_missing_count: 0,
    ...overrides,
  };
}

describe("account session generation remote verifier", () => {
  it("defines read-only inventory, preflight, and protected post-merge plans", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    const inventory = verifier.buildAccountGenerationRemoteVerificationPlan({
      mode: "inventory",
    });
    const preflight = verifier.buildAccountGenerationRemoteVerificationPlan({
      mode: "joint-activation-preflight",
    });
    const postMerge = verifier.buildAccountGenerationRemoteVerificationPlan({
      mode: "post-merge-dark-ship",
    });
    const storageSample = verifier.buildAccountGenerationRemoteVerificationPlan({
      mode: "joint-storage-inventory-sample",
    });

    expect(inventory.readOnly).toBe(true);
    expect(inventory.requiresMergedOriginMaster).toBe(false);
    expect(preflight.readOnly).toBe(true);
    expect(preflight.requiresMergedOriginMaster).toBe(true);
    expect(postMerge.readOnly).toBe(true);
    expect(postMerge.requiresMergedOriginMaster).toBe(true);
    expect(storageSample.readOnly).toBe(true);
    expect(storageSample.requiresMergedOriginMaster).toBe(true);
    expect(inventory.requiresCutoverSharedLock).toBe(false);
    expect(preflight.requiresCutoverSharedLock).toBe(false);
    expect(postMerge.requiresCutoverSharedLock).toBe(false);
    expect(storageSample.requiresCutoverSharedLock).toBe(true);

    expect(inventory.sql.toLowerCase()).toContain(
      "to_regclass('public.account_generation_capability_state')",
    );
    expect(preflight.sql.toLowerCase()).toContain(
      "from public.account_generation_capability_state",
    );
    expect(preflight.sql.toLowerCase()).toContain(
      "from auth.users",
    );
    expect(preflight.sql.toLowerCase()).toContain(
      "from public.users",
    );
    expect(preflight.sql).toMatch(
      /string_agg\(\s*app_user\.id::text,\s*E'\\n'[\s\S]*order by app_user\.id/iu,
    );
    expect(preflight.sql).toContain(
      "auth_users.user_id || ':' || auth_users.created_at_snapshot",
    );
    expect(preflight.sql).not.toContain(
      "public_users.user_id || ':' || public_users.created_at_snapshot",
    );
    expect(preflight.sql).toContain("registry.state");
    expect(preflight.sql).toContain("public_user_inbound_fks");
    expect(preflight.sql).toContain("owner_uuid_candidates");
    expect(preflight.sql).toContain("personal_owner_sources");
    expect(preflight.sql).toContain("personal_owner_uuid_columns");
    expect(preflight.sql).toContain("personal_owner_without_identity_count");
    expect(preflight.sql).toContain("personal_owner_inventory_unknown_count");
    expect(preflight.sql).toContain("personal_owner_inventory_missing_count");
    expect(preflight.sql).toContain("public.user_session_generation_bindings");
    expect(preflight.sql).not.toContain("registry.status");
    expect(preflight.sql).toContain("'cutover_nonterminal_attempt_count'");
    expect(preflight.sql).not.toContain("'cutover_attempt_count'");
    expect(preflight.sql).toMatch(
      /where state in \('staging', 'staged'\)/iu,
    );
    expect(preflight.sql).toMatch(
      /registry\.state in \([\s\S]*'pending_upload'[\s\S]*'uploaded_unlinked'[\s\S]*'cleanup_pending'[\s\S]*'not_found_observed'[\s\S]*\)/iu,
    );
    expect(preflight.sql).toMatch(
      /where auth_users\.user_id is null[\s\S]*and public_users\.user_id is null/iu,
    );
    expect(postMerge.sql.toLowerCase()).toContain(
      "from public.account_generation_capability_state",
    );
    expect(postMerge.sql.toLowerCase()).toContain(
      "from public.user_account_generation_watermarks",
    );
    expect(postMerge.sql.toLowerCase()).toContain(
      "from public.user_account_lifecycles",
    );
    expect(storageSample.sql.toLowerCase()).toContain(
      "public.account_generation_capability_state",
    );
    expect(storageSample.sql.toLowerCase()).toContain(
      "from public.legacy_external_write_attempts",
    );
    expect(storageSample.sql.toLowerCase()).toContain(
      "from storage.objects as object",
    );
    expect(storageSample.sql).not.toContain("pg_advisory_xact_lock_shared");
    expect(storageSample.sql).not.toContain("lock_cutover");
    expect(storageSample.sql).toContain("owner_id_signals");
    expect(storageSample.sql).toContain("strict_legacy_path_signals");
    expect(storageSample.sql).toContain("registry_signals");
    expect(storageSample.sql).toContain("account_generation_cutover_staging");
    expect(storageSample.sql).toContain("proposed_account_generation");
    expect(storageSample.sql).toContain("validation_state");
    expect(storageSample.sql).toContain("current_existing_legacy_sources");
    expect(storageSample.sql).toContain("recipe_image_legacy_visibility_target_references");
    expect(storageSample.sql).toContain("positive_reference.owner_uuid");
    expect(storageSample.sql).toContain("recipe_image_legacy_visibility_targets");
    expect(storageSample.sql).toContain("recipe_image_legacy_visibility_migration_runs");
    expect(storageSample.sql).toContain("recipe_image_objects");
    expect(storageSample.sql).toContain("'cutover_maintenance'");
    expect(storageSample.sql).toContain("'capability_cutover_attempt_digest'");
    expect(storageSample.sql).toContain("'owner_signal_3_way_union_count'");
    expect(storageSample.sql).toContain("'owner_signal_digest'");
    expect(storageSample.sql).toContain("'remote_writes', 0");
    expect(storageSample.sql).toContain("object.owner_id = expected_owner.owner_uuid::text");
    expect(storageSample.sql).toContain("object.owner_id is null");
    expect(storageSample.sql).toContain("registry.account_generation = expected_owner.proposed_account_generation");
    expect(storageSample.sql).toContain("registry.bucket_id = 'recipe-images-private'");
    expect(storageSample.sql).toContain("target.target_bucket_id");
    expect(storageSample.sql).toContain("target.target_object_path");
    expect(storageSample.sql).toContain("registry.owner_uuid = candidate.owner_uuid");
    expect(storageSample.sql).toContain("registry.object_path = candidate.target_object_path");
    expect(storageSample.sql).toContain("cleanup.registry_state in ('deleted', 'verified_not_found')");
    expect(storageSample.sql).toContain("storage_object_deletion_outbox");
    expect(storageSample.sql).toContain("outbox.cleanup_generation = registry.cleanup_generation");
    expect(storageSample.sql).toContain("cleanup.outbox_terminal_result in ('deleted', 'verified_not_found')");
    expect(storageSample.sql).toContain("public.user_account_lifecycles as lifecycle");
    expect(storageSample.sql).toContain("outbox.cleanup_generation not between 1 and lifecycle.required_cleanup_generation");
    expect(storageSample.sql).toContain("registry.cleanup_generation >= outbox.cleanup_generation");
    expect(storageSample.sql).toContain("registry.cleanup_generation <= lifecycle.required_cleanup_generation");
    expect(storageSample.sql).toContain("on outbox.owner_uuid = expected_owner.owner_uuid");
    expect(storageSample.sql).toContain("and outbox.account_generation = expected_owner.proposed_account_generation");
    expect(storageSample.sql).toContain("count(distinct outbox.cleanup_generation) filter");
    expect(storageSample.sql).toContain("where outbox.state = 'succeeded'");
    expect(storageSample.sql).toContain("and outbox.terminal_result in ('deleted', 'verified_not_found')");
    expect(storageSample.sql).toContain(") <> lifecycle.required_cleanup_generation");
    expect(storageSample.sql).toContain("'known_private_cleanup_outbox_nonterminal_count'");
    expect(storageSample.sql).toContain("'known_private_cleanup_outbox_dead_letter_count'");
    expect(storageSample.sql).toContain("'known_private_cleanup_outbox_generation_mismatch_count'");
    expect(storageSample.sql).toContain("'known_private_cleanup_outbox_registry_mismatch_count'");
    expect(storageSample.sql).not.toMatch(/staging\.validation_state\s*=\s*'validated'/iu);
    expect(storageSample.sql).toMatch(
      /current_attempt_targets as \([\s\S]*where target\.source_bucket_id = 'recipe-images'\s*\), current_attempt_target_references as \([\s\S]*positive_reference\.owner_uuid[\s\S]*\), current_existing_legacy_sources as \([\s\S]*join storage\.objects as source_object/iu,
    );
    expect(storageSample.sql).not.toContain("thumbnail_url like");
    expect(storageSample.sql).not.toContain("cover_image_url like");
    expect(storageSample.sql).not.toContain("auth_inbound_fks");

    expect(inventory.sql.toLowerCase()).toContain("from pg_catalog.pg_constraint");
    expect(preflight.sql.toLowerCase()).toContain("from pg_catalog.pg_constraint");
    expect(postMerge.sql.toLowerCase()).toContain("from pg_catalog.pg_constraint");
    for (const plan of [inventory, preflight, postMerge, storageSample]) {
      expect(plan.sql).not.toMatch(
        /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|merge|copy|vacuum|reindex|refresh|execute|perform)\b/iu,
      );
    }

    expect(preflight.sql.trimStart().toLowerCase()).toMatch(/^with\b/u);
    expect(preflight.sql).toMatch(/\);\s*$/u);
    expect(preflight.sql).not.toMatch(/;\s*\S/iu);
  });

  it("requires exact origin/master and a clean worktree for merged remote modes", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(
      verifier.assertAccountGenerationMergedExactSource({
        head: "abc",
        originMaster: "abc",
        trackedStatus: "",
      }),
    ).toBe("abc");

    expect(() =>
      verifier.assertAccountGenerationMergedExactSource({
        head: "abc",
        originMaster: "def",
        trackedStatus: "",
      }),
    ).toThrow("requires HEAD to equal origin/master");

    expect(() =>
      verifier.assertAccountGenerationMergedExactSource({
        head: "abc",
        originMaster: "abc",
        trackedStatus: " M scripts/lib/account-session-generation-remote-verifier.mjs",
      }),
    ).toThrow("requires a clean worktree");
  });

  it("rejects mutating, multi-statement, and psql meta-command SQL even inside WITH clauses", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.assertAccountGenerationReadOnlyVerificationSql({
        sql: "with doomed as (delete from public.users returning id) select count(*) from doomed;",
        fieldName: "test SQL",
      }),
    ).toThrow("test SQL must remain SELECT/CTE-only");

    expect(() =>
      verifier.assertAccountGenerationReadOnlyVerificationSql({
        sql: "with safe as (select 1 as id) select id from safe; delete from public.users;",
        fieldName: "test SQL",
      }),
    ).toThrow("test SQL must not contain multiple SQL statements");

    for (const sql of [
      "with safe as (select 1 as id) select id from safe;\n\\gexec",
      "with safe as (select 1 as id) select id from safe;\n  \\copy public.users to '/tmp/users.csv'",
      "with safe as (select 1 as id) select id from safe;\n\\i ./script.sql",
      "with safe as (select 1 as id) select id from safe;\n  \\! echo hacked",
      "with staged as (select '\\\\gexec' as cmd) select cmd from staged \\gexec ;",
      "with safe as (select 1 as id) select * from safe \\! echo injected ;",
    ]) {
      expect(() =>
        verifier.assertAccountGenerationReadOnlyVerificationSql({
          sql,
          fieldName: "test SQL",
        }),
      ).toThrow("test SQL must not contain psql meta-commands");
    }
  });

  it("keeps only the linked libpq keys, removes poisoned PG env, and forces ssl require", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    const linkedEnvironment = verifier.parseAccountGenerationLinkedDatabaseEnvironment({
      output: [
        'export PGHOST="db.example.internal"',
        "export PGPORT='6543'",
        "export PGUSER=linked_user",
        "export PGPASSWORD=linked_password",
        "export PGDATABASE=postgres",
        "export NOT_ALLOWED=ignored",
      ].join("\n"),
    });

    expect(linkedEnvironment).toEqual({
      PGHOST: "db.example.internal",
      PGPORT: "6543",
      PGUSER: "linked_user",
      PGPASSWORD: "linked_password",
      PGDATABASE: "postgres",
    });

    const request = verifier.buildAccountGenerationRemotePsqlRequest({
      baseEnvironment: {
        PATH: "/usr/bin:/bin",
        LANG: "en_US.UTF-8",
        HOME: "/tmp/homecook",
        PGHOST: "poison-host",
        PGSERVICE: "poison-service",
        PGSERVICEFILE: "/tmp/pg_service.conf",
        PGOPTIONS: "-c statement_timeout=1",
        PGSSLMODE: "disable",
      },
      databaseEnvironment: linkedEnvironment,
      planSql: "with safe as (select 1) select * from safe;",
    });
    const lockRequest = verifier.buildAccountGenerationRemotePsqlRequest({
      baseEnvironment: {
        PATH: "/usr/bin:/bin",
      },
      databaseEnvironment: linkedEnvironment,
      planSql: "with locked as (select 1) select * from locked;",
      requiresCutoverSharedLock: true,
    });

    expect(request.environment).toEqual({
      PATH: "/usr/bin:/bin",
      LANG: "en_US.UTF-8",
      HOME: "/tmp/homecook",
      PGHOST: "db.example.internal",
      PGPORT: "6543",
      PGUSER: "linked_user",
      PGPASSWORD: "linked_password",
      PGDATABASE: "postgres",
      PGSSLMODE: "require",
    });
    expect(request.input).toContain(
      "begin transaction isolation level read committed read only;",
    );
    expect(request.input).not.toContain("begin transaction read only;");
    expect(request.input).not.toContain("pg_advisory_xact_lock_shared");
    expect(lockRequest.input).toMatch(
      /^begin transaction isolation level read committed read only;\nselect pg_catalog\.pg_advisory_xact_lock_shared\(\n  pg_catalog\.hashtextextended\(\n    'homecook-account-generation-cutover',\n    0\n  \)\n\);\nwith locked as \(select 1\) select \* from locked;\ncommit;$/u,
    );
  });

  it("treats only transient cleanup registry states as nonterminal blockers", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );
    const assessment = verifier.assessAccountGenerationJointActivationPreflightResult({
      capability: {
        state: "legacy",
        revision: 1,
        current_cutover_attempt_id: null,
      },
      capability_count: 1,
      watermark_count: 0,
      lifecycle_count: 0,
      cutover_nonterminal_attempt_count: 0,
      cutover_staging_count: 0,
      legacy_external_write_nonterminal_count: 0,
      auth_deletion_outbox_nonterminal_count: 0,
      auth_deletion_outbox_dead_letter_count: 0,
      recipe_image_registry_nonterminal_count: 0,
      storage_deletion_outbox_nonterminal_count: 0,
      storage_deletion_outbox_dead_letter_count: 0,
      auth_user_count: 2,
      auth_user_digest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      public_user_count: 2,
      public_user_digest:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      auth_public_intersection_count: 2,
      auth_only_count: 0,
      public_only_count: 0,
      legacy_receipt_count: 0,
      current_auth_identity_exact_match_count: 0,
      ...buildPersonalOwnerInventoryFields(),
      auth_inbound_fks: [],
      remote_writes: 0,
    });

    expect(assessment.blockers).not.toContain("database_recipe_image_registry_nonterminal");
  });

  it("fails closed when any linked libpq key is missing", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.parseAccountGenerationLinkedDatabaseEnvironment({
        output: [
          "export PGHOST=db.example.internal",
          "export PGPORT=6543",
          "export PGUSER=linked_user",
          "export PGPASSWORD=linked_password",
        ].join("\n"),
      }),
    ).toThrow("linked Supabase database environment is incomplete");
  });

  it("fails closed on unknown verification modes", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.buildAccountGenerationRemoteVerificationPlan({
        mode: "unknown",
      }),
    ).toThrow("unsupported account generation remote verification mode");
  });

  it("accepts only a legacy singleton with canonical authority at zero after merge", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );
    const validResult = {
      capability: {
        state: "legacy",
        revision: 1,
        current_cutover_attempt_id: null,
      },
      capability_count: 1,
      watermark_count: 0,
      lifecycle_count: 0,
      auth_inbound_fks: [],
    };

    expect(() =>
      verifier.assertAccountGenerationRemoteVerificationResult({
        mode: "post-merge-dark-ship",
        result: validResult,
      }),
    ).not.toThrow();

    for (const invalidResult of [
      { ...validResult, capability_count: 0 },
      {
        ...validResult,
        capability: { ...validResult.capability, state: "generation_active" },
      },
      { ...validResult, watermark_count: 1 },
      { ...validResult, lifecycle_count: 1 },
    ]) {
      expect(() =>
        verifier.assertAccountGenerationRemoteVerificationResult({
          mode: "post-merge-dark-ship",
          result: invalidResult,
        }),
      ).toThrow(
        "remote F0 is not a legacy dark ship with canonical authority at zero",
      );
    }
  });

  it("validates storage inventory sample structure but keeps safe nonzero blockers in the result", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    const validSample = buildJointStorageInventorySample({
      known_public_shared_rehome_terminal_count: 2,
      known_private_cleanup_terminal_count: 3,
    });

    expect(() =>
      verifier.assertAccountGenerationRemoteVerificationResult({
        mode: "joint-storage-inventory-sample",
        result: validSample,
      }),
    ).not.toThrow();

    expect(
      verifier.assertAccountGenerationJointStorageInventorySampleResult(validSample),
    ).toEqual(validSample);

    for (const invalidSample of [
      buildJointStorageInventorySample({ capability_state: "legacy" }),
      buildJointStorageInventorySample({ capability_cutover_attempt_digest: null }),
      buildJointStorageInventorySample({ remote_writes: 1 }),
      buildJointStorageInventorySample({ sampled_at: "2026-07-29T05:24:12Z" }),
      buildJointStorageInventorySample({ sampled_at: "not-a-date" }),
      buildJointStorageInventorySample({ sampled_at: "2026-13-29T05:24:12.000000Z" }),
      {
        ...buildJointStorageInventorySample(),
        capability_current_cutover_attempt_id:
          "00000000-0000-4000-8000-000000000099",
      },
    ]) {
      expect(() =>
        verifier.assertAccountGenerationJointStorageInventorySampleResult(
          invalidSample,
        ),
      ).toThrow();
    }
  });

  it("assesses storage inventory readiness without discarding safe nonzero summaries", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(
      verifier.assessAccountGenerationJointStorageInventorySampleResult(
        buildJointStorageInventorySample({
          remote_writes: 0,
          external_write_nonterminal_count: 1,
          owner_id_signal_count: 2,
          strict_legacy_path_signal_count: 1,
          owner_signal_3_way_union_count: 2,
          known_public_shared_rehome_terminal_count: 1,
          known_private_cleanup_terminal_count: 1,
          known_private_cleanup_outbox_nonterminal_count: 1,
          known_private_cleanup_outbox_dead_letter_count: 1,
          known_private_cleanup_outbox_generation_mismatch_count: 1,
          known_private_cleanup_outbox_registry_mismatch_count: 1,
        }),
      ),
    ).toEqual({
      ready: false,
      blockers: [
        "external_write_nonterminal_not_zero",
        "owner_signal_union_not_zero",
        "known_private_cleanup_outbox_nonterminal_not_zero",
        "known_private_cleanup_outbox_dead_letter_not_zero",
        "known_private_cleanup_outbox_generation_mismatch_not_zero",
        "known_private_cleanup_outbox_registry_mismatch_not_zero",
        "storage_inventory_second_sample",
        "auth_quiet_window",
        "provider_auth_barrier",
        "maintenance_runtime_release",
      ],
      safeSummary: {
        remote_writes: 0,
        external_write_nonterminal_count: 1,
        owner_id_signal_count: 2,
        strict_legacy_path_signal_count: 1,
        registry_signal_count: 0,
        owner_signal_3_way_union_count: 2,
        owned_unverified_count: 0,
        owner_path_unverified_count: 0,
        known_public_shared_rehome_terminal_count: 1,
        known_public_shared_rehome_pending_count: 0,
        known_private_cleanup_terminal_count: 1,
        known_private_cleanup_pending_count: 0,
        known_private_cleanup_outbox_nonterminal_count: 1,
        known_private_cleanup_outbox_dead_letter_count: 1,
        known_private_cleanup_outbox_generation_mismatch_count: 1,
        known_private_cleanup_outbox_registry_mismatch_count: 1,
      },
    });
  });

  it("compares two safe storage inventory samples only when second is later, UTC-exact, and 15 minutes apart", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    const first = buildJointStorageInventorySample();
    const second = buildJointStorageInventorySample({
      sampled_at: SAMPLE_LATER_TIMESTAMP,
    });

    expect(
      verifier.compareAccountGenerationJointStorageInventorySamples({
        firstSample: first,
        secondSample: second,
      }),
    ).toEqual({
      ok: true,
      intervalSeconds: 900,
      capability_revision: 7,
      capability_cutover_attempt_digest: SAMPLE_ATTEMPT_DIGEST,
      stable_digests: {
        owner_signal_digest: OWNER_SIGNAL_DIGEST,
        owned_unverified_digest: OWNED_UNVERIFIED_DIGEST,
        owner_path_unverified_digest: OWNER_PATH_UNVERIFIED_DIGEST,
        known_public_shared_rehome_digest: PUBLIC_SHARED_REHOME_DIGEST,
        known_private_cleanup_digest: PRIVATE_CLEANUP_DIGEST,
      },
      stable_counts: {
        external_write_nonterminal_count: 0,
        owner_id_signal_count: 0,
        strict_legacy_path_signal_count: 0,
        registry_signal_count: 0,
        owner_signal_3_way_union_count: 0,
        owned_unverified_count: 0,
        owner_path_unverified_count: 0,
        known_public_shared_rehome_terminal_count: 0,
        known_public_shared_rehome_pending_count: 0,
        known_private_cleanup_terminal_count: 0,
        known_private_cleanup_pending_count: 0,
        known_private_cleanup_outbox_nonterminal_count: 0,
        known_private_cleanup_outbox_dead_letter_count: 0,
        known_private_cleanup_outbox_generation_mismatch_count: 0,
        known_private_cleanup_outbox_registry_mismatch_count: 0,
      },
    });

    for (const [firstSample, secondSample, message, minimumIntervalSeconds] of [
      [
        first,
        buildJointStorageInventorySample({
          sampled_at: SAMPLE_ALMOST_LATER_TIMESTAMP,
        }),
        "at least 900 seconds apart",
        undefined,
      ],
      [
        first,
        buildJointStorageInventorySample({
          sampled_at: SAMPLE_EARLIER_TIMESTAMP,
        }),
        "must be later than the first sample",
        undefined,
      ],
      [
        first,
        buildJointStorageInventorySample({
          sampled_at: SAMPLE_LATER_TIMESTAMP,
          capability_revision: 8,
        }),
        "same capability revision",
        undefined,
      ],
      [
        first,
        buildJointStorageInventorySample({
          sampled_at: SAMPLE_LATER_TIMESTAMP,
        }),
        "minimum interval is fixed at 900 seconds",
        1,
      ],
      [
        first,
        buildJointStorageInventorySample({
          sampled_at: SAMPLE_LATER_TIMESTAMP,
          capability_cutover_attempt_digest:
            "8888888888888888888888888888888888888888888888888888888888888888",
        }),
        "same cutover attempt digest",
        undefined,
      ],
      [
        first,
        buildJointStorageInventorySample({
          sampled_at: SAMPLE_LATER_TIMESTAMP,
          owner_signal_digest:
            "7777777777777777777777777777777777777777777777777777777777777777",
        }),
        "stable digest",
        undefined,
      ],
    ] as const) {
      expect(() =>
        verifier.compareAccountGenerationJointStorageInventorySamples({
          firstSample,
          secondSample,
          ...(minimumIntervalSeconds === undefined
            ? {}
            : { minimumIntervalSeconds }),
        }),
      ).toThrow(message);
    }

    expect(() =>
      verifier.compareAccountGenerationJointStorageInventorySamples({
        firstSample: buildJointStorageInventorySample({
          external_write_nonterminal_count: 1,
        }),
        secondSample: buildJointStorageInventorySample({
          sampled_at: SAMPLE_LATER_TIMESTAMP,
          external_write_nonterminal_count: 1,
        }),
      }),
    ).toThrow("stable nonzero gate blockers");

    expect(() =>
      verifier.compareAccountGenerationJointStorageInventorySamples({
        firstSample: buildJointStorageInventorySample({
          known_private_cleanup_outbox_dead_letter_count: 1,
        }),
        secondSample: buildJointStorageInventorySample({
          sampled_at: SAMPLE_LATER_TIMESTAMP,
          known_private_cleanup_outbox_dead_letter_count: 1,
        }),
      }),
    ).toThrow("stable nonzero gate blockers");

    expect(() =>
      verifier.compareAccountGenerationJointStorageInventorySamples({
        firstSample: buildJointStorageInventorySample({
          known_private_cleanup_outbox_registry_mismatch_count: 1,
        }),
        secondSample: buildJointStorageInventorySample({
          sampled_at: SAMPLE_LATER_TIMESTAMP,
          known_private_cleanup_outbox_registry_mismatch_count: 1,
        }),
      }),
    ).toThrow("stable nonzero gate blockers");
  });

  it("keeps the storage inventory sample CLI and compare CLI wired to official package commands", async () => {
    const packageJson = JSON.parse(
      readFileSync("package.json", "utf8"),
    ) as {
      scripts: Record<string, string>;
    };
    const cli = readFileSync(
      "scripts/verify-account-session-generation-remote.mjs",
      "utf8",
    );
    const compareCli = readFileSync(
      "scripts/compare-account-session-generation-storage-samples.mjs",
      "utf8",
    );

    expect(
      packageJson.scripts["verify:account-generation:storage-inventory-sample"],
    ).toBe(
      "node scripts/verify-account-session-generation-remote.mjs --mode joint-storage-inventory-sample --json",
    );
    expect(cli).toContain('const mode = readOption("--mode");');
    expect(cli).toContain("buildAccountGenerationRemoteVerificationPlan({ mode })");
    expect(cli).toContain("buildAccountGenerationRemotePsqlRequest");
    expect(cli).toContain("assessAccountGenerationJointStorageInventorySampleResult");
    expect(cli).toContain('assertAccountGenerationRemoteVerificationResult({ mode, result })');
    expect(cli).toContain('mode === "joint-storage-inventory-sample"');
    expect(
      packageJson.scripts["verify:account-generation:storage-inventory-compare"],
    ).toBe(
      "node scripts/compare-account-session-generation-storage-samples.mjs --json",
    );
    expect(compareCli).toContain('const firstPath = readOption("--first");');
    expect(compareCli).toContain('const forbiddenSecondPath = readOption("--second");');
    expect(compareCli).toContain("process.execPath");
    expect(compareCli).toContain("verify-account-session-generation-remote.mjs");
    expect(compareCli).toContain('"--mode",');
    expect(compareCli).toContain('"joint-storage-inventory-sample"');
    expect(compareCli).toContain('"--json"');
    expect(compareCli).toContain("compareAccountGenerationJointStorageInventoryEnvelopes");
  });

  it("rejects --second and fail-closes compare CLI before trusting a saved live-second envelope", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "homecook-storage-sample-compare-cli-"),
    );
    const firstPath = join(directory, "first.json");

    writeFileSync(
      firstPath,
      JSON.stringify({
        ok: false,
        mode: "joint-storage-inventory-sample",
        mergeSha: "a".repeat(40),
        result: buildJointStorageInventorySample(),
        assessment: {
          ready: false,
          blockers: ["storage_inventory_second_sample"],
          safeSummary: {
            remote_writes: 0,
            external_write_nonterminal_count: 0,
            owner_id_signal_count: 0,
            strict_legacy_path_signal_count: 0,
            registry_signal_count: 0,
            owner_signal_3_way_union_count: 0,
            owned_unverified_count: 0,
            owner_path_unverified_count: 0,
            known_public_shared_rehome_terminal_count: 0,
            known_public_shared_rehome_pending_count: 0,
            known_private_cleanup_terminal_count: 0,
            known_private_cleanup_pending_count: 0,
            known_private_cleanup_outbox_nonterminal_count: 0,
            known_private_cleanup_outbox_dead_letter_count: 0,
            known_private_cleanup_outbox_generation_mismatch_count: 0,
            known_private_cleanup_outbox_registry_mismatch_count: 0,
          },
        },
      }),
    );

    const rejectSecond = spawnSync(
      process.execPath,
      [
        "scripts/compare-account-session-generation-storage-samples.mjs",
        "--first",
        firstPath,
        "--second",
        firstPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(rejectSecond.status).toBe(1);
    expect(rejectSecond.stderr).toContain("--second is no longer allowed");

    const dirtyFailClosed = spawnSync(
      process.execPath,
      [
        "scripts/compare-account-session-generation-storage-samples.mjs",
        "--first",
        firstPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    expect(dirtyFailClosed.status).toBe(1);
    expect(dirtyFailClosed.stderr).toContain("requires a clean worktree");
  });

  it("parses saved sample envelopes and compares them only when mergeSha and stable-zero gate match", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );
    const directory = mkdtempSync(
      join(tmpdir(), "homecook-storage-sample-envelope-"),
    );
    const firstPath = join(directory, "first.json");
    const secondPath = join(directory, "second.json");

    writeFileSync(
      firstPath,
      JSON.stringify({
        ok: false,
        mode: "joint-storage-inventory-sample",
        mergeSha: "a".repeat(40),
        result: buildJointStorageInventorySample(),
        assessment: {
          ready: false,
          blockers: ["storage_inventory_second_sample"],
          safeSummary: {
            remote_writes: 0,
            external_write_nonterminal_count: 0,
            owner_id_signal_count: 0,
            strict_legacy_path_signal_count: 0,
            registry_signal_count: 0,
            owner_signal_3_way_union_count: 0,
            owned_unverified_count: 0,
            owner_path_unverified_count: 0,
            known_public_shared_rehome_terminal_count: 0,
            known_public_shared_rehome_pending_count: 0,
            known_private_cleanup_terminal_count: 0,
            known_private_cleanup_pending_count: 0,
            known_private_cleanup_outbox_nonterminal_count: 0,
            known_private_cleanup_outbox_dead_letter_count: 0,
            known_private_cleanup_outbox_generation_mismatch_count: 0,
            known_private_cleanup_outbox_registry_mismatch_count: 0,
          },
        },
      }),
    );
    writeFileSync(
      secondPath,
      JSON.stringify({
        ok: false,
        mode: "joint-storage-inventory-sample",
        mergeSha: "a".repeat(40),
        result: buildJointStorageInventorySample({
          sampled_at: SAMPLE_LATER_TIMESTAMP,
        }),
        assessment: {
          ready: false,
          blockers: ["storage_inventory_second_sample"],
          safeSummary: {
            remote_writes: 0,
            external_write_nonterminal_count: 0,
            owner_id_signal_count: 0,
            strict_legacy_path_signal_count: 0,
            registry_signal_count: 0,
            owner_signal_3_way_union_count: 0,
            owned_unverified_count: 0,
            owner_path_unverified_count: 0,
            known_public_shared_rehome_terminal_count: 0,
            known_public_shared_rehome_pending_count: 0,
            known_private_cleanup_terminal_count: 0,
            known_private_cleanup_pending_count: 0,
            known_private_cleanup_outbox_nonterminal_count: 0,
            known_private_cleanup_outbox_dead_letter_count: 0,
            known_private_cleanup_outbox_generation_mismatch_count: 0,
            known_private_cleanup_outbox_registry_mismatch_count: 0,
          },
        },
      }),
    );

    const firstEnvelope =
      verifier.readAccountGenerationJointStorageInventoryEnvelope({
        filePath: firstPath,
      });
    const secondEnvelope =
      verifier.readAccountGenerationJointStorageInventoryEnvelope({
        filePath: secondPath,
      });

    expect(
      verifier.compareAccountGenerationJointStorageInventoryEnvelopes({
        firstEnvelope,
        secondEnvelope,
      }),
    ).toEqual({
      ok: true,
      mode: "joint-storage-inventory-sample-compare",
      mergeSha: "a".repeat(40),
      comparison: {
        ok: true,
        intervalSeconds: 900,
        capability_revision: 7,
        capability_cutover_attempt_digest: SAMPLE_ATTEMPT_DIGEST,
        stable_digests: {
          owner_signal_digest: OWNER_SIGNAL_DIGEST,
          owned_unverified_digest: OWNED_UNVERIFIED_DIGEST,
          owner_path_unverified_digest: OWNER_PATH_UNVERIFIED_DIGEST,
          known_public_shared_rehome_digest: PUBLIC_SHARED_REHOME_DIGEST,
          known_private_cleanup_digest: PRIVATE_CLEANUP_DIGEST,
        },
        stable_counts: {
          external_write_nonterminal_count: 0,
          owner_id_signal_count: 0,
          strict_legacy_path_signal_count: 0,
          registry_signal_count: 0,
          owner_signal_3_way_union_count: 0,
          owned_unverified_count: 0,
          owner_path_unverified_count: 0,
          known_public_shared_rehome_terminal_count: 0,
          known_public_shared_rehome_pending_count: 0,
          known_private_cleanup_terminal_count: 0,
          known_private_cleanup_pending_count: 0,
          known_private_cleanup_outbox_nonterminal_count: 0,
          known_private_cleanup_outbox_dead_letter_count: 0,
          known_private_cleanup_outbox_generation_mismatch_count: 0,
          known_private_cleanup_outbox_registry_mismatch_count: 0,
        },
      },
    });

    expect(() =>
      verifier.compareAccountGenerationJointStorageInventoryEnvelopes({
        firstEnvelope,
        secondEnvelope: {
          ...secondEnvelope,
          mergeSha: "b".repeat(40),
        },
      }),
    ).toThrow("same mergeSha");

    expect(() =>
      verifier.compareAccountGenerationJointStorageInventoryEnvelopes({
        firstEnvelope: {
          ...firstEnvelope,
          result: {
            ...firstEnvelope.result,
            known_private_cleanup_outbox_generation_mismatch_count: 1,
            known_private_cleanup_outbox_registry_mismatch_count: 1,
          },
        },
        secondEnvelope: {
          ...secondEnvelope,
          result: {
            ...secondEnvelope.result,
            known_private_cleanup_outbox_generation_mismatch_count: 1,
            known_private_cleanup_outbox_registry_mismatch_count: 1,
          },
        },
      }),
    ).toThrow("stable nonzero gate blockers");
  });

  it("removes the legacy personal-owner blocker when schema inventory is exact and keeps identity-less owners diagnostic only", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );
    const assessment = verifier.assessAccountGenerationJointActivationPreflightResult({
      capability: {
        state: "legacy",
        revision: 1,
        current_cutover_attempt_id: null,
      },
      capability_count: 1,
      watermark_count: 0,
      lifecycle_count: 0,
      cutover_nonterminal_attempt_count: 0,
      cutover_staging_count: 0,
      legacy_external_write_nonterminal_count: 0,
      auth_deletion_outbox_nonterminal_count: 0,
      auth_deletion_outbox_dead_letter_count: 0,
      recipe_image_registry_nonterminal_count: 0,
      storage_deletion_outbox_nonterminal_count: 0,
      storage_deletion_outbox_dead_letter_count: 0,
      auth_user_count: 3,
      auth_user_digest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      public_user_count: 3,
      public_user_digest:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      auth_public_intersection_count: 2,
      auth_only_count: 1,
      public_only_count: 1,
      legacy_receipt_count: 1,
      current_auth_identity_exact_match_count: 1,
      ...buildPersonalOwnerInventoryFields({
        personal_owner_count: 4,
        personal_owner_without_identity_count: 2,
        personal_owner_sources: PERSONAL_OWNER_SOURCE_NAMES.map((source_name) => ({
          source_name,
          owner_count:
            source_name === "public.users"
              ? 3
              : source_name === "public.user_account_lifecycles"
                ? 1
                : 0,
        })),
      }),
      auth_inbound_fks: [],
      remote_writes: 0,
    });

    expect(assessment).toEqual({
      ready: false,
      databaseReady: true,
      remoteWrites: 0,
      blockers: [
        "identity_population_requires_staging",
        "auth_hook_remote_configuration",
        "auth_admin_write_freeze",
        "auth_quiet_window",
        "storage_inventory_second_sample",
        "provider_auth_barrier",
        "maintenance_runtime_release",
      ],
    });
  });

  it("adds a drift blocker when personal owner schema inventory has unknown or missing classified columns", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );
    const assessment = verifier.assessAccountGenerationJointActivationPreflightResult({
      capability: {
        state: "legacy",
        revision: 1,
        current_cutover_attempt_id: null,
      },
      capability_count: 1,
      watermark_count: 0,
      lifecycle_count: 0,
      cutover_nonterminal_attempt_count: 0,
      cutover_staging_count: 0,
      legacy_external_write_nonterminal_count: 0,
      auth_deletion_outbox_nonterminal_count: 0,
      auth_deletion_outbox_dead_letter_count: 0,
      recipe_image_registry_nonterminal_count: 0,
      storage_deletion_outbox_nonterminal_count: 0,
      storage_deletion_outbox_dead_letter_count: 0,
      auth_user_count: 2,
      auth_user_digest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      public_user_count: 2,
      public_user_digest:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      auth_public_intersection_count: 2,
      auth_only_count: 0,
      public_only_count: 0,
      legacy_receipt_count: 0,
      current_auth_identity_exact_match_count: 0,
      ...buildPersonalOwnerInventoryFields({
        personal_owner_uuid_columns: [
          {
            schema_name: "public",
            table_name: "mystery_table",
            column_name: "user_id",
            classification: "unknown_owner_like",
          },
        ],
        personal_owner_inventory_unknown_count: 1,
      }),
      auth_inbound_fks: [],
      remote_writes: 0,
    });

    expect(assessment.blockers).toContain("personal_owner_universe_inventory_drift");
    expect(assessment.blockers).not.toContain("personal_owner_universe_inventory");
  });

  it("keeps preflight not-ready while allowing diagnosable identity mismatch, receipt drift, and aborted historical attempts", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );
    const assessment = verifier.assessAccountGenerationJointActivationPreflightResult({
      capability: {
        state: "legacy",
        revision: 1,
        current_cutover_attempt_id: null,
      },
      capability_count: 1,
      watermark_count: 0,
      lifecycle_count: 0,
      cutover_nonterminal_attempt_count: 0,
      cutover_staging_count: 0,
      legacy_external_write_nonterminal_count: 0,
      auth_deletion_outbox_nonterminal_count: 0,
      auth_deletion_outbox_dead_letter_count: 0,
      recipe_image_registry_nonterminal_count: 0,
      storage_deletion_outbox_nonterminal_count: 0,
      storage_deletion_outbox_dead_letter_count: 0,
      auth_user_count: 3,
      auth_user_digest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      public_user_count: 3,
      public_user_digest:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      auth_public_intersection_count: 2,
      auth_only_count: 1,
      public_only_count: 1,
      legacy_receipt_count: 1,
      current_auth_identity_exact_match_count: 1,
      ...buildPersonalOwnerInventoryFields({
        personal_owner_count: 4,
        personal_owner_without_identity_count: 2,
        personal_owner_sources: PERSONAL_OWNER_SOURCE_NAMES.map((source_name) => ({
          source_name,
          owner_count: source_name === "public.users" ? 3 : 0,
        })),
      }),
      auth_inbound_fks: [],
      remote_writes: 0,
    });

    expect(assessment).toEqual({
      ready: false,
      databaseReady: true,
      remoteWrites: 0,
      blockers: [
        "identity_population_requires_staging",
        "auth_hook_remote_configuration",
        "auth_admin_write_freeze",
        "auth_quiet_window",
        "storage_inventory_second_sample",
        "provider_auth_barrier",
        "maintenance_runtime_release",
      ],
    });
  });

  it("adds database blockers only for canonical-zero drift and active cutover attempts", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );
    const assessment = verifier.assessAccountGenerationJointActivationPreflightResult({
      capability: {
        state: "generation_active",
        revision: 1,
        current_cutover_attempt_id: null,
      },
      capability_count: 1,
      watermark_count: 1,
      lifecycle_count: 1,
      cutover_nonterminal_attempt_count: 1,
      cutover_staging_count: 1,
      legacy_external_write_nonterminal_count: 1,
      auth_deletion_outbox_nonterminal_count: 1,
      auth_deletion_outbox_dead_letter_count: 1,
      recipe_image_registry_nonterminal_count: 1,
      storage_deletion_outbox_nonterminal_count: 1,
      storage_deletion_outbox_dead_letter_count: 1,
      auth_user_count: 3,
      auth_user_digest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      public_user_count: 3,
      public_user_digest:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      auth_public_intersection_count: 2,
      auth_only_count: 1,
      public_only_count: 1,
      legacy_receipt_count: 0,
      current_auth_identity_exact_match_count: 0,
      ...buildPersonalOwnerInventoryFields({
        personal_owner_count: 4,
        personal_owner_without_identity_count: 2,
        personal_owner_sources: PERSONAL_OWNER_SOURCE_NAMES.map((source_name) => ({
          source_name,
          owner_count: source_name === "public.users" ? 3 : 0,
        })),
      }),
      auth_inbound_fks: [],
      remote_writes: 1,
    });

    expect(assessment.ready).toBe(false);
    expect(assessment.databaseReady).toBe(false);
    expect(assessment.remoteWrites).toBe(1);
    expect(assessment.blockers).toContain("database_capability_not_legacy");
    expect(assessment.blockers).toContain("database_watermarks_not_zero");
    expect(assessment.blockers).toContain("database_lifecycles_not_zero");
    expect(assessment.blockers).toContain("database_cutover_nonterminal_attempts_not_zero");
    expect(assessment.blockers).toContain("database_cutover_staging_not_zero");
    expect(assessment.blockers).toContain("database_legacy_external_write_nonterminal");
    expect(assessment.blockers).toContain("database_auth_deletion_outbox_nonterminal");
    expect(assessment.blockers).toContain("database_auth_deletion_outbox_dead_letter");
    expect(assessment.blockers).toContain("database_recipe_image_registry_nonterminal");
    expect(assessment.blockers).toContain("database_storage_deletion_outbox_nonterminal");
    expect(assessment.blockers).toContain("database_storage_deletion_outbox_dead_letter");
    expect(assessment.blockers).toContain("database_remote_writes_not_zero");
    expect(assessment.blockers).toContain("auth_hook_remote_configuration");
  });

  it("throws when aggregate identity counts are internally inconsistent", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.assessAccountGenerationJointActivationPreflightResult({
        capability: {
          state: "legacy",
          revision: 1,
          current_cutover_attempt_id: null,
        },
        capability_count: 1,
        watermark_count: 0,
        lifecycle_count: 0,
        cutover_nonterminal_attempt_count: 0,
        cutover_staging_count: 0,
        legacy_external_write_nonterminal_count: 0,
        auth_deletion_outbox_nonterminal_count: 0,
        auth_deletion_outbox_dead_letter_count: 0,
        recipe_image_registry_nonterminal_count: 0,
        storage_deletion_outbox_nonterminal_count: 0,
        storage_deletion_outbox_dead_letter_count: 0,
        auth_user_count: 3,
        auth_user_digest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        public_user_count: 3,
        public_user_digest:
          "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        auth_public_intersection_count: 2,
        auth_only_count: 0,
        public_only_count: 1,
        legacy_receipt_count: 1,
        current_auth_identity_exact_match_count: 1,
        ...buildPersonalOwnerInventoryFields({
          personal_owner_count: 4,
          personal_owner_without_identity_count: 1,
        }),
        auth_inbound_fks: [],
        remote_writes: 0,
      }),
    ).toThrow(
      "joint activation preflight returned inconsistent identity aggregate counts",
    );
  });

  it("throws when current auth exact matches exceed receipt or auth inventory", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.assessAccountGenerationJointActivationPreflightResult({
        capability: {
          state: "legacy",
          revision: 1,
          current_cutover_attempt_id: null,
        },
        capability_count: 1,
        watermark_count: 0,
        lifecycle_count: 0,
        cutover_nonterminal_attempt_count: 0,
        cutover_staging_count: 0,
        legacy_external_write_nonterminal_count: 0,
        auth_deletion_outbox_nonterminal_count: 0,
        auth_deletion_outbox_dead_letter_count: 0,
        recipe_image_registry_nonterminal_count: 0,
        storage_deletion_outbox_nonterminal_count: 0,
        storage_deletion_outbox_dead_letter_count: 0,
        auth_user_count: 3,
        auth_user_digest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        public_user_count: 3,
        public_user_digest:
          "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        auth_public_intersection_count: 2,
        auth_only_count: 1,
        public_only_count: 1,
        legacy_receipt_count: 1,
        current_auth_identity_exact_match_count: 2,
        ...buildPersonalOwnerInventoryFields({
          personal_owner_count: 4,
          personal_owner_without_identity_count: 2,
        }),
        auth_inbound_fks: [],
        remote_writes: 0,
      }),
    ).toThrow(
      "joint activation preflight returned an impossible current auth identity exact-match aggregate",
    );
  });

  it("throws when auth inbound fks are missing or malformed", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.assessAccountGenerationJointActivationPreflightResult({
        capability: {
          state: "legacy",
          revision: 1,
          current_cutover_attempt_id: null,
        },
        capability_count: 1,
        watermark_count: 0,
        lifecycle_count: 0,
        cutover_nonterminal_attempt_count: 0,
        cutover_staging_count: 0,
        legacy_external_write_nonterminal_count: 0,
        auth_deletion_outbox_nonterminal_count: 0,
        auth_deletion_outbox_dead_letter_count: 0,
        recipe_image_registry_nonterminal_count: 0,
        storage_deletion_outbox_nonterminal_count: 0,
        storage_deletion_outbox_dead_letter_count: 0,
        auth_user_count: 3,
        auth_user_digest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        public_user_count: 3,
        public_user_digest:
          "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        auth_public_intersection_count: 2,
        auth_only_count: 1,
        public_only_count: 1,
        legacy_receipt_count: 1,
        current_auth_identity_exact_match_count: 1,
        ...buildPersonalOwnerInventoryFields({
          personal_owner_count: 4,
          personal_owner_without_identity_count: 2,
          auth_inbound_fks: "invalid",
        }),
        auth_inbound_fks: "invalid",
        remote_writes: 0,
      }),
    ).toThrow("joint activation preflight returned invalid auth_inbound_fks inventory");
  });

  it("throws when public user inbound fks or personal owner inventories are malformed", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.assessAccountGenerationJointActivationPreflightResult({
        capability: {
          state: "legacy",
          revision: 1,
          current_cutover_attempt_id: null,
        },
        capability_count: 1,
        watermark_count: 0,
        lifecycle_count: 0,
        cutover_nonterminal_attempt_count: 0,
        cutover_staging_count: 0,
        legacy_external_write_nonterminal_count: 0,
        auth_deletion_outbox_nonterminal_count: 0,
        auth_deletion_outbox_dead_letter_count: 0,
        recipe_image_registry_nonterminal_count: 0,
        storage_deletion_outbox_nonterminal_count: 0,
        storage_deletion_outbox_dead_letter_count: 0,
        auth_user_count: 2,
        auth_user_digest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        public_user_count: 2,
        public_user_digest:
          "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        auth_public_intersection_count: 2,
        auth_only_count: 0,
        public_only_count: 0,
        legacy_receipt_count: 0,
        current_auth_identity_exact_match_count: 0,
        ...buildPersonalOwnerInventoryFields({
          public_user_inbound_fks: "invalid",
        }),
        auth_inbound_fks: [],
        remote_writes: 0,
      }),
    ).toThrow("joint activation preflight returned invalid public_user_inbound_fks inventory");

    expect(() =>
      verifier.assessAccountGenerationJointActivationPreflightResult({
        capability: {
          state: "legacy",
          revision: 1,
          current_cutover_attempt_id: null,
        },
        capability_count: 1,
        watermark_count: 0,
        lifecycle_count: 0,
        cutover_nonterminal_attempt_count: 0,
        cutover_staging_count: 0,
        legacy_external_write_nonterminal_count: 0,
        auth_deletion_outbox_nonterminal_count: 0,
        auth_deletion_outbox_dead_letter_count: 0,
        recipe_image_registry_nonterminal_count: 0,
        storage_deletion_outbox_nonterminal_count: 0,
        storage_deletion_outbox_dead_letter_count: 0,
        auth_user_count: 2,
        auth_user_digest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        public_user_count: 2,
        public_user_digest:
          "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        auth_public_intersection_count: 2,
        auth_only_count: 0,
        public_only_count: 0,
        legacy_receipt_count: 0,
        current_auth_identity_exact_match_count: 0,
        ...buildPersonalOwnerInventoryFields({
          personal_owner_sources: [{ source_name: "public.users", owner_count: 2 }],
        }),
        auth_inbound_fks: [],
        remote_writes: 0,
      }),
    ).toThrow("joint activation preflight returned invalid personal_owner_sources inventory");
  });

  it("throws when personal owner aggregates are internally inconsistent", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.assessAccountGenerationJointActivationPreflightResult({
        capability: {
          state: "legacy",
          revision: 1,
          current_cutover_attempt_id: null,
        },
        capability_count: 1,
        watermark_count: 0,
        lifecycle_count: 0,
        cutover_nonterminal_attempt_count: 0,
        cutover_staging_count: 0,
        legacy_external_write_nonterminal_count: 0,
        auth_deletion_outbox_nonterminal_count: 0,
        auth_deletion_outbox_dead_letter_count: 0,
        recipe_image_registry_nonterminal_count: 0,
        storage_deletion_outbox_nonterminal_count: 0,
        storage_deletion_outbox_dead_letter_count: 0,
        auth_user_count: 2,
        auth_user_digest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        public_user_count: 3,
        public_user_digest:
          "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        auth_public_intersection_count: 2,
        auth_only_count: 0,
        public_only_count: 1,
        legacy_receipt_count: 0,
        current_auth_identity_exact_match_count: 0,
        ...buildPersonalOwnerInventoryFields({
          personal_owner_count: 2,
          personal_owner_sources: PERSONAL_OWNER_SOURCE_NAMES.map((source_name) => ({
            source_name,
            owner_count: source_name === "public.users" ? 3 : 0,
          })),
        }),
        auth_inbound_fks: [],
        remote_writes: 0,
      }),
    ).toThrow(
      "joint activation preflight returned an impossible personal owner aggregate",
    );

    expect(() =>
      verifier.assessAccountGenerationJointActivationPreflightResult({
        capability: {
          state: "legacy",
          revision: 1,
          current_cutover_attempt_id: null,
        },
        capability_count: 1,
        watermark_count: 0,
        lifecycle_count: 0,
        cutover_nonterminal_attempt_count: 0,
        cutover_staging_count: 0,
        legacy_external_write_nonterminal_count: 0,
        auth_deletion_outbox_nonterminal_count: 0,
        auth_deletion_outbox_dead_letter_count: 0,
        recipe_image_registry_nonterminal_count: 0,
        storage_deletion_outbox_nonterminal_count: 0,
        storage_deletion_outbox_dead_letter_count: 0,
        auth_user_count: 2,
        auth_user_digest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        public_user_count: 2,
        public_user_digest:
          "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        auth_public_intersection_count: 2,
        auth_only_count: 0,
        public_only_count: 0,
        legacy_receipt_count: 0,
        current_auth_identity_exact_match_count: 0,
        ...buildPersonalOwnerInventoryFields({
          personal_owner_count: 2,
          personal_owner_sources: PERSONAL_OWNER_SOURCE_NAMES.map((source_name) => ({
            source_name,
            owner_count:
              source_name === "public.users"
                ? 1
                : source_name === "public.recipe_image_objects"
                  ? 3
                  : 0,
          })),
        }),
        auth_inbound_fks: [],
        remote_writes: 0,
      }),
    ).toThrow(
      "joint activation preflight returned an impossible personal owner source aggregate",
    );
  });

  it("rejects malformed preflight count and digest fields", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.assessAccountGenerationJointActivationPreflightResult({
        capability: {
          state: "legacy",
          revision: 1,
          current_cutover_attempt_id: null,
        },
        capability_count: -1,
        watermark_count: 0,
        lifecycle_count: 0,
        cutover_nonterminal_attempt_count: 0,
        cutover_staging_count: 0,
        legacy_external_write_nonterminal_count: 0,
        auth_deletion_outbox_nonterminal_count: 0,
        auth_deletion_outbox_dead_letter_count: 0,
        recipe_image_registry_nonterminal_count: 0,
        storage_deletion_outbox_nonterminal_count: 0,
        storage_deletion_outbox_dead_letter_count: 0,
        auth_user_count: 1,
        auth_user_digest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        public_user_count: 1,
        public_user_digest:
          "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        auth_public_intersection_count: 1,
        auth_only_count: 0,
        public_only_count: 0,
        legacy_receipt_count: 1,
        current_auth_identity_exact_match_count: 1,
        ...buildPersonalOwnerInventoryFields(),
        remote_writes: 0,
      }),
    ).toThrow("joint activation preflight returned an invalid count: capability_count");

    expect(() =>
      verifier.assessAccountGenerationJointActivationPreflightResult({
        capability: {
          state: "legacy",
          revision: 1,
          current_cutover_attempt_id: null,
        },
        capability_count: 1,
        watermark_count: 0,
        lifecycle_count: 0,
        cutover_nonterminal_attempt_count: 0,
        cutover_staging_count: 0,
        legacy_external_write_nonterminal_count: 0,
        auth_deletion_outbox_nonterminal_count: 0,
        auth_deletion_outbox_dead_letter_count: 0,
        recipe_image_registry_nonterminal_count: 0,
        storage_deletion_outbox_nonterminal_count: 0,
        storage_deletion_outbox_dead_letter_count: 0,
        auth_user_count: 1,
        auth_user_digest: "not-a-sha256",
        public_user_count: 1,
        public_user_digest:
          "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        auth_public_intersection_count: 1,
        auth_only_count: 0,
        public_only_count: 0,
        legacy_receipt_count: 1,
        current_auth_identity_exact_match_count: 1,
        ...buildPersonalOwnerInventoryFields(),
        remote_writes: 0,
        auth_inbound_fks: [],
      }),
    ).toThrow("joint activation preflight returned an invalid digest: auth_user_digest");
  });
});
