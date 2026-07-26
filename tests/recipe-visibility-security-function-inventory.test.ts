import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertHistoricalReplacementIdentity,
  classifyAdditiveDeploymentState,
} from "../scripts/security-function-additive-state.mjs";

const MANIFEST_PATH =
  "docs/security/recipe-visibility-read-hardening-security-function-authorization-manifest.json";
const IMAGE_CLEANUP_MANIFEST_PATH =
  "docs/security/recipe-image-cleanup-outbox-security-function-authorization-manifest.json";
const IMAGE_UPLOAD_MANIFEST_PATH =
  "docs/security/recipe-image-upload-reservation-security-function-authorization-manifest.json";
const IMAGE_UPLOAD_COMPENSATION_MANIFEST_PATH =
  "docs/security/recipe-image-upload-compensation-security-function-authorization-manifest.json";
const IMAGE_ATTACH_MANIFEST_PATH =
  "docs/security/recipe-image-attach-cas-security-function-authorization-manifest.json";
const RECIPE_MANUAL_CREATE_IMAGE_ATTACH_MANIFEST_PATH =
  "docs/security/recipe-manual-create-image-attach-security-function-authorization-manifest.json";
const IMAGE_STALE_SCANNER_MANIFEST_PATH =
  "docs/security/recipe-image-stale-scanner-security-function-authorization-manifest.json";
const IMAGE_TERMINAL_TOMBSTONE_MANIFEST_PATH =
  "docs/security/recipe-image-terminal-tombstone-security-function-authorization-manifest.json";
const IMAGE_EXPECTED_OWNER_SIGNAL_MANIFEST_PATH =
  "docs/security/recipe-image-expected-owner-signal-security-function-authorization-manifest.json";
const IMAGE_AUTH_DELETION_READINESS_MANIFEST_PATH =
  "docs/security/recipe-image-auth-deletion-readiness-security-function-authorization-manifest.json";
const IMAGE_AUTH_DELETION_CLAIM_MANIFEST_PATH =
  "docs/security/recipe-image-auth-deletion-claim-security-function-authorization-manifest.json";
const IMAGE_AUTH_DELETION_FINALIZE_MANIFEST_PATH =
  "docs/security/recipe-image-auth-deletion-finalize-security-function-authorization-manifest.json";
const IMAGE_AUTH_DELETION_CANDIDATE_MANIFEST_PATH =
  "docs/security/recipe-image-auth-deletion-candidate-security-function-authorization-manifest.json";
const IMAGE_LIFECYCLE_COMPLETION_MANIFEST_PATH =
  "docs/security/recipe-image-lifecycle-completion-security-function-authorization-manifest.json";

describe("recipe visibility security function inventory", () => {
  it("classifies the guard and every recreated baseline function", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);

    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature: "public.set_recipe_tags(uuid, jsonb, uuid, text)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        replaces_baseline: true,
      }),
      expect.objectContaining({
        signature: "public.find_recipe_ids_by_public_tags(text, text)",
        allowed_principals: ["anon", "authenticated"],
        security_mode: "invoker",
        replaces_baseline: true,
      }),
      expect.objectContaining({
        signature:
          "public.list_public_recipe_tags(text, text, boolean, integer)",
        allowed_principals: ["anon", "authenticated"],
        security_mode: "invoker",
        replaces_baseline: true,
      }),
      expect.objectContaining({
        signature: "public.list_home_theme_recipes(integer, integer)",
        allowed_principals: ["anon", "authenticated"],
        security_mode: "invoker",
        replaces_baseline: true,
      }),
      expect.objectContaining({
        signature:
          "recipe_visibility_guard.is_owner_publicly_visible(uuid)",
        control_class: "application-controlled",
        effect: "read-only",
        exposure: "public",
        allowed_principals: ["anon", "authenticated"],
        security_mode: "definer",
        owner: "homecook_recipe_visibility_guard_owner",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies every guarded image cleanup outbox function", () => {
    expect(existsSync(IMAGE_CLEANUP_MANIFEST_PATH)).toBe(true);

    const manifest = JSON.parse(
      readFileSync(IMAGE_CLEANUP_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.enqueue_recipe_image_cleanup(uuid, uuid, bigint, bigint, text)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.claim_recipe_image_cleanup(integer, uuid, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.authorize_recipe_image_cleanup_delete(uuid, uuid, bigint, bigint, uuid, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.observe_recipe_image_cleanup_not_found(uuid, uuid, bigint, bigint, uuid, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.recheck_recipe_image_cleanup_not_found(uuid, uuid, bigint, bigint, boolean, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.complete_recipe_image_cleanup_deleted(uuid, uuid, bigint, bigint, uuid, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.claim_recipe_image_cleanup_not_found_rechecks(integer, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.recheck_claimed_recipe_image_cleanup_not_found(uuid, uuid, bigint, bigint, timestamp with time zone, boolean, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.fail_recipe_image_cleanup(uuid, uuid, bigint, bigint, uuid, text, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies every guarded image upload reservation function", () => {
    expect(existsSync(IMAGE_UPLOAD_MANIFEST_PATH)).toBe(true);
    if (!existsSync(IMAGE_UPLOAD_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(IMAGE_UPLOAD_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.reserve_recipe_image_upload(uuid, timestamp with time zone, text, integer, uuid, text, text, bigint, text, text, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "extensions", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.finalize_recipe_image_upload(uuid, timestamp with time zone, text, integer, uuid, uuid, bigint, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "extensions", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.release_recipe_image_upload_reservation(uuid, bigint, uuid, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies the guarded image upload compensation function", () => {
    expect(existsSync(IMAGE_UPLOAD_COMPENSATION_MANIFEST_PATH)).toBe(true);
    if (!existsSync(IMAGE_UPLOAD_COMPENSATION_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(IMAGE_UPLOAD_COMPENSATION_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.compensate_recipe_image_upload(uuid, bigint, uuid, uuid, uuid, bigint, text, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "extensions", "pg_temp"],
      }),
    ]);
  });

  it("classifies the guarded image attach function", () => {
    expect(existsSync(IMAGE_ATTACH_MANIFEST_PATH)).toBe(true);
    if (!existsSync(IMAGE_ATTACH_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(IMAGE_ATTACH_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.attach_recipe_image_object(uuid, timestamp with time zone, text, integer, uuid, uuid, bigint, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: [
          "pg_catalog",
          "public",
          "extensions",
          "pg_temp",
        ],
      }),
    ]);
  });

  it("classifies the guarded manual recipe image writer", () => {
    expect(existsSync(RECIPE_MANUAL_CREATE_IMAGE_ATTACH_MANIFEST_PATH))
      .toBe(true);
    if (!existsSync(RECIPE_MANUAL_CREATE_IMAGE_ATTACH_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(
        RECIPE_MANUAL_CREATE_IMAGE_ATTACH_MANIFEST_PATH,
        "utf8",
      ),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.create_manual_recipe_with_managed_image(uuid, timestamp with time zone, text, integer, uuid, bigint, text, integer, text, text[], text, jsonb, jsonb, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: [
          "pg_catalog",
          "public",
          "extensions",
          "pg_temp",
        ],
      }),
    ]);
  });

  it("classifies the guarded stale image scanner", () => {
    expect(existsSync(IMAGE_STALE_SCANNER_MANIFEST_PATH)).toBe(true);
    if (!existsSync(IMAGE_STALE_SCANNER_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(IMAGE_STALE_SCANNER_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.scan_stale_recipe_image_uploads(integer, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies both guarded terminal tombstone scanner functions", () => {
    expect(existsSync(IMAGE_TERMINAL_TOMBSTONE_MANIFEST_PATH)).toBe(true);
    if (!existsSync(IMAGE_TERMINAL_TOMBSTONE_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(IMAGE_TERMINAL_TOMBSTONE_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.claim_recipe_image_terminal_tombstones(integer, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
      expect.objectContaining({
        signature:
          "public.reopen_recipe_image_terminal_tombstone(uuid, uuid, bigint, bigint, timestamp with time zone, timestamp with time zone)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies the guarded expected-owner signal authority", () => {
    expect(existsSync(IMAGE_EXPECTED_OWNER_SIGNAL_MANIFEST_PATH)).toBe(true);
    if (!existsSync(IMAGE_EXPECTED_OWNER_SIGNAL_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(IMAGE_EXPECTED_OWNER_SIGNAL_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.inspect_recipe_image_expected_owner_signal(uuid, bigint)",
        effect: "read-only",
        exposure: "service-internal",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies the guarded Auth deletion readiness authority", () => {
    expect(existsSync(IMAGE_AUTH_DELETION_READINESS_MANIFEST_PATH)).toBe(
      true,
    );
    if (!existsSync(IMAGE_AUTH_DELETION_READINESS_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(
        IMAGE_AUTH_DELETION_READINESS_MANIFEST_PATH,
        "utf8",
      ),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.inspect_recipe_image_auth_deletion_readiness(uuid, bigint, timestamp with time zone)",
        effect: "read-only",
        exposure: "service-internal",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies the guarded Auth deletion claim authority", () => {
    expect(existsSync(IMAGE_AUTH_DELETION_CLAIM_MANIFEST_PATH)).toBe(true);
    if (!existsSync(IMAGE_AUTH_DELETION_CLAIM_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(IMAGE_AUTH_DELETION_CLAIM_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.claim_recipe_image_auth_deletion_if_ready(uuid, uuid, bigint, uuid, timestamp with time zone)",
        effect: "mutation",
        exposure: "service-internal",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies the guarded lifecycle completion authority", () => {
    expect(existsSync(IMAGE_LIFECYCLE_COMPLETION_MANIFEST_PATH)).toBe(true);
    if (!existsSync(IMAGE_LIFECYCLE_COMPLETION_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(
        IMAGE_LIFECYCLE_COMPLETION_MANIFEST_PATH,
        "utf8",
      ),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.complete_recipe_image_account_lifecycle(uuid, bigint, timestamp with time zone)",
        effect: "mutation",
        exposure: "service-internal",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies the guarded Auth deletion finalize authority", () => {
    expect(existsSync(IMAGE_AUTH_DELETION_FINALIZE_MANIFEST_PATH)).toBe(
      true,
    );
    if (!existsSync(IMAGE_AUTH_DELETION_FINALIZE_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(IMAGE_AUTH_DELETION_FINALIZE_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.finalize_recipe_image_auth_deletion_claim(uuid, uuid, bigint, timestamp with time zone, uuid, integer, text, text, timestamp with time zone)",
        effect: "mutation",
        exposure: "service-internal",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("classifies the Auth deletion candidate read authority", () => {
    expect(existsSync(IMAGE_AUTH_DELETION_CANDIDATE_MANIFEST_PATH)).toBe(
      true,
    );
    if (!existsSync(IMAGE_AUTH_DELETION_CANDIDATE_MANIFEST_PATH)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(IMAGE_AUTH_DELETION_CANDIDATE_MANIFEST_PATH, "utf8"),
    ) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature:
          "public.list_recipe_image_auth_deletion_candidates(integer, timestamp with time zone, timestamp with time zone, uuid)",
        effect: "read-only",
        exposure: "service-internal",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("uses new functions as deployment markers and rejects incomplete replacements", () => {
    const contract = [
      {
        signature: "public.recreated_baseline()",
        replaces_baseline: true,
      },
      {
        signature: "recipe_visibility_guard.marker()",
      },
    ];

    expect(
      classifyAdditiveDeploymentState(contract, [
        { signature: "public.recreated_baseline()" },
      ]),
    ).toBe("pre-deployment");
    expect(
      classifyAdditiveDeploymentState(contract, [
        { signature: "public.recreated_baseline()" },
        { signature: "recipe_visibility_guard.marker()" },
      ]),
    ).toBe("post-migration");
    expect(() =>
      classifyAdditiveDeploymentState(contract, [
        { signature: "recipe_visibility_guard.marker()" },
      ]),
    ).toThrow(
      "partially deployed additive function contract: public.recreated_baseline()",
    );
  });

  it("keeps the historical owner and function shape for deployed replacements", () => {
    const expectedObservation = {
      owner: "postgres",
      extension_name: null,
      result_type: "void",
      volatility: "v",
    };
    const currentRow = {
      owner: "broader_runtime_owner",
      extension_name: null,
      result_type: "void",
      provolatile: "v",
    };

    expect(() =>
      assertHistoricalReplacementIdentity(
        "public.set_recipe_tags(uuid, jsonb, uuid, text)",
        expectedObservation,
        currentRow,
      ),
    ).toThrow(
      "deployed baseline replacement owner drift for public.set_recipe_tags(uuid, jsonb, uuid, text)",
    );
  });

  it("validates every additive manifest without a live database", () => {
    const result = spawnSync(
      "node",
      ["scripts/validate-security-function-authorization.mjs", "--contract-only"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SECURITY_FUNCTION_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:1/postgres",
        },
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status, output).toBe(0);
    expect(output).toContain(
      "recipe-visibility-read-hardening:5 pre-deployment additive application functions",
    );
    expect(output).toContain(
      "recipe-image-cleanup-outbox:9 pre-deployment additive application functions",
    );
    expect(output).toContain(
      "recipe-image-upload-reservation:3 pre-deployment additive application functions",
    );
    expect(output).toContain(
      "recipe-image-upload-compensation:1 pre-deployment additive application functions",
    );
    expect(output).toContain(
      "recipe-image-stale-scanner:1 pre-deployment additive application functions",
    );
  }, 15_000);

  it("fails closed when the guard owner contract drifts", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "homecook-recipe-visibility-security-function-"),
    );
    const fixtureManifestPath = path.join(fixtureRoot, "manifest.json");
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      functions: Array<Record<string, unknown>>;
    };
    await writeFile(
      fixtureManifestPath,
      `${JSON.stringify({
        ...manifest,
        functions: manifest.functions.map((entry) =>
          entry.signature ===
          "recipe_visibility_guard.is_owner_publicly_visible(uuid)"
            ? { ...entry, owner: "postgres" }
            : entry,
        ),
      }, null, 2)}\n`,
    );

    try {
      const result = spawnSync(
        "node",
        [
          "scripts/validate-security-function-authorization.mjs",
          "--contract-only",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            SECURITY_FUNCTION_RECIPE_VISIBILITY_MANIFEST_PATH:
              fixtureManifestPath,
          },
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain(
        "additive function owner drift for recipe_visibility_guard.is_owner_publicly_visible(uuid)",
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when a recreated baseline function is unclassified", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "homecook-recipe-visibility-baseline-override-"),
    );
    const fixtureManifestPath = path.join(fixtureRoot, "manifest.json");
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      functions: Array<Record<string, unknown>>;
    };
    await writeFile(
      fixtureManifestPath,
      `${JSON.stringify({
        ...manifest,
        functions: manifest.functions.filter(
          (entry) =>
            entry.signature !==
            "public.list_home_theme_recipes(integer, integer)",
        ),
      }, null, 2)}\n`,
    );

    try {
      const result = spawnSync(
        "node",
        [
          "scripts/validate-security-function-authorization.mjs",
          "--contract-only",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            SECURITY_FUNCTION_RECIPE_VISIBILITY_MANIFEST_PATH:
              fixtureManifestPath,
          },
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain(
        "unclassified=public.list_home_theme_recipes(integer, integer)",
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
