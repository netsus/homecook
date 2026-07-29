import { describe, expect, it } from "vitest";

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

    expect(inventory.readOnly).toBe(true);
    expect(inventory.requiresMergedOriginMaster).toBe(false);
    expect(preflight.readOnly).toBe(true);
    expect(preflight.requiresMergedOriginMaster).toBe(true);
    expect(postMerge.readOnly).toBe(true);
    expect(postMerge.requiresMergedOriginMaster).toBe(true);

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
    expect(preflight.sql).not.toContain("registry.status");
    expect(preflight.sql).toContain("'cutover_nonterminal_attempt_count'");
    expect(preflight.sql).not.toContain("'cutover_attempt_count'");
    expect(preflight.sql).toMatch(
      /where state in \('staging', 'staged'\)/iu,
    );
    expect(preflight.sql).toMatch(
      /registry\.state in \([\s\S]*'pending_upload'[\s\S]*'uploaded_unlinked'[\s\S]*'cleanup_pending'[\s\S]*'not_found_observed'[\s\S]*\)/iu,
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

    for (const plan of [inventory, preflight, postMerge]) {
      expect(plan.sql.toLowerCase()).toContain("from pg_catalog.pg_constraint");
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

  it("rejects mutating or multi-statement preflight SQL even inside WITH clauses", async () => {
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
      auth_inbound_fks: [],
      remote_writes: 0,
    });

    expect(assessment).toEqual({
      ready: false,
      databaseReady: true,
      remoteWrites: 0,
      blockers: [
        "identity_population_requires_staging",
        "personal_owner_universe_inventory",
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
        auth_inbound_fks: "invalid",
        remote_writes: 0,
      }),
    ).toThrow("joint activation preflight returned invalid auth_inbound_fks inventory");
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
        remote_writes: 0,
        auth_inbound_fks: [],
      }),
    ).toThrow("joint activation preflight returned an invalid digest: auth_user_digest");
  });
});
