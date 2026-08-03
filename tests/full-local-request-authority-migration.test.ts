import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260801151000_full_local_request_authority.sql", import.meta.url),
  "utf8",
);
const optionalNbfMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260803091000_full_local_optional_nbf_authority.sql",
    import.meta.url,
  ),
  "utf8",
);
const recipeFutureInternalScopeMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260803092000_recipe_future_internal_scope.sql",
    import.meta.url,
  ),
  "utf8",
);
const recipeFutureScopedRpcMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260803100000_recipe_future_scoped_internal_rpc_clients.sql",
    import.meta.url,
  ),
  "utf8",
);
const readOnlyRequestAuthorityMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260803093000_full_local_read_only_request_authority.sql",
    import.meta.url,
  ),
  "utf8",
);
const authorizationManifest = readFileSync(
  new URL(
    "../docs/security/account-session-generation-security-function-authorization-manifest.json",
    import.meta.url,
  ),
  "utf8",
);

describe("full-local request authority migration", () => {
  it("keeps the remote verifier dormant and branches authenticated requests to local authority", () => {
    expect(migration).toContain("verify_hybrid_request_authority_remote_legacy");
    expect(migration).toContain("verify_full_local_authenticated_authority");
    expect(migration).toContain("full_local_auth_control");
    expect(migration).toContain("binding.auth_authority = 'local'");
    expect(migration).toContain("binding.local_issuer = v_issuer");
    expect(migration).toContain("binding.auth_cutover_epoch = v_control.cutover_epoch");
    expect(migration).not.toContain("remote_auth_identity_epochs");
  });

  it("trusts only the gateway-verified payload and stores no attestation secret in PostgreSQL", () => {
    expect(migration).toContain("x-homecook-attestation-verified");
    expect(migration).not.toContain(
      "app.settings.homecook_session_attestation_hmac_key",
    );
    expect(migration).not.toContain("extensions.hmac");
  });

  it("uses iat when GoTrue omits the standards-optional nbf claim", () => {
    expect(optionalNbfMigration).toContain(
      "v_request_nbf := coalesce(\n    v_claims ->> 'nbf',\n    v_claims ->> 'iat'",
    );
    expect(optionalNbfMigration).toContain("v_claims ->> 'iat' is null");
    expect(optionalNbfMigration).not.toContain("v_claims ->> 'nbf' is null");
  });

  it("keeps GET authority checks read-only while mutation requests retain row locks", () => {
    expect(readOnlyRequestAuthorityMigration).toContain(
      "v_read_only_request := v_method in ('GET', 'HEAD')",
    );
    expect(readOnlyRequestAuthorityMigration).toMatch(
      /if v_read_only_request then[\s\S]*from private\.full_local_auth_control[\s\S]*else[\s\S]*from private\.full_local_auth_control[\s\S]*for share/iu,
    );
    expect(readOnlyRequestAuthorityMigration).toMatch(
      /if v_read_only_request then[\s\S]*from public\.user_session_generation_bindings[\s\S]*else[\s\S]*from public\.user_session_generation_bindings[\s\S]*for key share/iu,
    );
  });

  it("allowlists each new internal RPC under an exact server scope", () => {
    for (const fragment of [
      "v_scope = 'auth-flow'",
      "/rpc/read_full_local_auth_control",
      "/rpc/insert_auth_flow_attempt",
      "/rpc/read_auth_flow_attempt",
      "/rpc/terminal_auth_flow_attempt",
      "/rpc/record_full_local_session_authority",
      "/rpc/assert_full_local_session_authority",
      "/rpc/revoke_full_local_session_authority",
    ]) {
      expect(migration).toContain(fragment);
    }
  });

  it("allowlists only the recipe future RPCs and nutrition predecessor reads", () => {
    expect(recipeFutureInternalScopeMigration).toContain(
      "v_scope = 'recipe-future-propagation'",
    );
    for (const path of [
      "/rpc/preview_recipe_future_plan_impact",
      "/rpc/write_recipe_future_plan_change",
      "/rpc/write_personal_recipe_core",
      "/ingredient_nutrition_profiles",
      "/ingredient_conversion_assignments",
    ]) {
      expect(recipeFutureInternalScopeMigration).toContain(path);
    }
  });

  it("allowlists snapshot-v2, future-meal, and shopping RPCs under exact route scopes", () => {
    for (const [scope, paths] of [
      [
        "snapshot-v2-session",
        [
          "/rpc/start_snapshot_v2_cooking_session",
          "/rpc/read_snapshot_v2_cook_mode",
          "/rpc/cancel_snapshot_v2_cooking_session",
        ],
      ],
      [
        "future-meal-write",
        ["/rpc/write_future_meal_with_snapshot_authority"],
      ],
      [
        "shopping-create",
        ["/rpc/create_shopping_list_with_snapshot_authority"],
      ],
    ] as const) {
      expect(recipeFutureScopedRpcMigration).toContain(`v_scope = '${scope}'`);
      for (const path of paths) {
        expect(recipeFutureScopedRpcMigration).toContain(path);
      }
    }
  });

  it("classifies every full-local pre-request helper as internal-only", () => {
    expect(authorizationManifest).toContain("20260801151000_full_local_request_authority.sql");
    expect(authorizationManifest).toContain("20260803091000_full_local_optional_nbf_authority.sql");
    expect(authorizationManifest).toContain("20260803092000_recipe_future_internal_scope.sql");
    expect(authorizationManifest).toContain("20260803093000_full_local_read_only_request_authority.sql");
    expect(authorizationManifest).toContain("20260803100000_recipe_future_scoped_internal_rpc_clients.sql");
    expect(authorizationManifest).toContain("private.verify_hybrid_request_authority_remote_legacy()");
    expect(authorizationManifest).toContain("private.verify_full_local_internal_scope()");
    expect(authorizationManifest).toContain("private.verify_full_local_anonymous_authority()");
    expect(authorizationManifest).toContain("private.verify_full_local_authenticated_authority()");
  });
});
