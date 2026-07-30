import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type MigrationModule = typeof import(
  "../scripts/lib/hybrid-production-data-migration.mjs"
);

async function loadMigrationModule(): Promise<MigrationModule | null> {
  return import("../scripts/lib/hybrid-production-data-migration.mjs")
    .catch(() => null);
}

describe("hybrid production legacy data migration plan", () => {
  it("exposes explicit read-only verification and migration commands", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    expect(packageJson.scripts["hybrid-production:verify-backup"]).toBe(
      "node scripts/hybrid-production-runtime.mjs verify-backup",
    );
    expect(packageJson.scripts["hybrid-production:migrate-data"]).toBe(
      "node scripts/hybrid-production-data-migration.mjs",
    );

    const result = spawnSync(
      process.execPath,
      ["scripts/hybrid-production-data-migration.mjs", "--help"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("plan");
    expect(result.stdout).toContain("dry-run");
    expect(result.stdout).toContain("apply");
  });

  it("replaces every target public table while transferring only source-compatible columns", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }

    const plan = migration.buildLegacyDataMigrationPlan({
      sourceTables: [
        {
          columns: [
            {
              defaultExpression: null,
              generated: false,
              identity: false,
              name: "id",
              nullable: false,
              type: "uuid",
            },
          ],
          name: "public.recipes",
          rowCount: 44,
        },
      ],
      targetTables: [
        {
          columns: [
            {
              defaultExpression: null,
              generated: false,
              identity: false,
              name: "id",
              nullable: false,
              type: "uuid",
            },
            {
              defaultExpression: "1",
              generated: false,
              identity: false,
              name: "revision",
              nullable: false,
              type: "bigint",
            },
          ],
          name: "public.recipes",
          rowCount: 30,
        },
        {
          columns: [
            {
              defaultExpression: null,
              generated: false,
              identity: false,
              name: "id",
              nullable: false,
              type: "uuid",
            },
          ],
          name: "public.recipe_content_snapshots",
          rowCount: 0,
        },
      ],
    });

    expect(plan.transferTables).toEqual([
      {
        columns: ["id"],
        name: "public.recipes",
        sourceRowCount: 44,
      },
    ]);
    expect(plan.truncateTables).toEqual([
      "public.recipe_content_snapshots",
      "public.recipes",
    ]);
    expect(plan.targetOnlyTables).toEqual([
      "public.recipe_content_snapshots",
    ]);
  });

  it("rejects source drift and target-only required columns without defaults", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }
    const idColumn = {
      defaultExpression: null,
      generated: false,
      identity: false,
      name: "id",
      nullable: false,
      type: "uuid",
    };

    expect(() =>
      migration.buildLegacyDataMigrationPlan({
        sourceTables: [{
          columns: [idColumn],
          name: "public.source_only",
          rowCount: 1,
        }],
        targetTables: [],
      }),
    ).toThrow(/missing source table public\.source_only/u);

    expect(() =>
      migration.buildLegacyDataMigrationPlan({
        sourceTables: [{
          columns: [idColumn],
          name: "public.recipes",
          rowCount: 1,
        }],
        targetTables: [{
          columns: [
            idColumn,
            {
              ...idColumn,
              name: "required_without_default",
              type: "text",
            },
          ],
          name: "public.recipes",
          rowCount: 0,
        }],
      }),
    ).toThrow(/requires a value/u);
  });

  it("builds a single fail-closed transaction and distinguishes dry-run from apply", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }

    const dryRun = migration.buildLegacyDataMigrationTransaction({
      dataSql: "-- source data",
      dryRun: true,
      evidenceSql: "select 'HOMECOOK_EVIDENCE|{}';",
      truncateTables: [
        "public.recipe_content_snapshots",
        "public.recipes",
      ],
    });
    const apply = migration.buildLegacyDataMigrationTransaction({
      dataSql: "-- source data",
      dryRun: false,
      evidenceSql: "select 'HOMECOOK_EVIDENCE|{}';",
      truncateTables: ["public.recipes"],
    });

    expect(dryRun).toMatch(
      /begin;[\s\S]*lock table auth\.users in share row exclusive mode/u,
    );
    expect(dryRun).toContain(
      "truncate table public.recipe_content_snapshots, public.recipes restart identity;",
    );
    expect(dryRun).toMatch(
      /session_replication_role = replica[\s\S]*-- source data[\s\S]*session_replication_role = origin/u,
    );
    expect(dryRun.trimEnd()).toMatch(/rollback;$/u);
    expect(apply.trimEnd()).toMatch(/commit;$/u);
  });

  it("accepts only the isolated legacy evidence shape without changing complete-v2", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }
    const entries = [
      "hybrid-rehearsal-20260730/",
      "hybrid-rehearsal-20260730/backup-manifest.json",
      "hybrid-rehearsal-20260730/data-application.sql",
      "hybrid-rehearsal-20260730/data-public-storage.sql",
      "hybrid-rehearsal-20260730/roles.sql",
      "hybrid-rehearsal-20260730/schema-application.sql",
      "hybrid-rehearsal-20260730/schema-public-storage.sql",
      "hybrid-rehearsal-20260730/storage-objects/",
      "hybrid-rehearsal-20260730/storage-objects/recipe-images/",
      "hybrid-rehearsal-20260730/storage-objects/recipe-images/owner/object.jpg",
    ];

    expect(migration.assertLegacyEvidenceArchive({
      entries,
      types: entries.map((entry) => entry.endsWith("/") ? "d" : "-"),
    })).toEqual({
      root: "hybrid-rehearsal-20260730",
      storageEntries: [
        "hybrid-rehearsal-20260730/storage-objects/recipe-images/owner/object.jpg",
      ],
    });
    expect(() =>
      migration.assertLegacyEvidenceArchive({
        entries: [...entries, "hybrid-rehearsal-20260730/manifest.json"],
        types: [...entries.map((entry) => entry.endsWith("/") ? "d" : "-"), "-"],
      }),
    ).toThrow(/unexpected legacy archive entry/u);
    expect(() =>
      migration.assertLegacyEvidenceArchive({
        entries: ["hybrid-rehearsal-20260730/storage-objects/../escape"],
        types: ["-"],
      }),
    ).toThrow(/unsafe legacy archive path/u);
  });

  it("keeps the gateway private unless import and publication evidence are independently safe", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }
    const evidence = {
      authUsersAfter: 0,
      authUsersBefore: 0,
      authUsersResidualAfter: 0,
      constraintDigestAfter: "constraints",
      constraintDigestBefore: "constraints",
      foreignKeyViolations: 0,
      gatewayRunning: false,
      migrationDigestAfter: "migrations",
      migrationDigestBefore: "migrations",
      next3100Running: true,
      prebackupMatchesCurrent: true,
      rlsDigestAfter: "rls",
      rlsDigestBefore: "rls",
      sourceDataDigest: "source",
      storageHttpCacheControl: "max-age=3600",
      storageHttpContentType: "image/jpeg",
      storagePayloadSha256: "a".repeat(64),
      storageSourceSha256: "a".repeat(64),
      targetDataDigest: "source",
      identityEpochAntiJoinCount: 5,
    };

    expect(migration.evaluateLegacyDataMigrationEvidence(evidence)).toEqual({
      importSafe: true,
      publicationBlockers: ["identity-epoch-anti-join:5"],
      publicationSafe: false,
    });
    expect(() =>
      migration.evaluateLegacyDataMigrationEvidence({
        ...evidence,
        gatewayRunning: true,
      }),
    ).toThrow(/gateway must remain private/u);
    expect(() =>
      migration.evaluateLegacyDataMigrationEvidence({
        ...evidence,
        storageHttpContentType: "application/octet-stream",
      }),
    ).toThrow(/Storage HTTP metadata/u);
  });

  it("never compensates Storage after PostgreSQL has already committed", () => {
    const cli = readFileSync(
      "scripts/hybrid-production-data-migration.mjs",
      "utf8",
    );

    expect(cli).toMatch(
      /const output = psql\([\s\S]*if \(!dryRun\) \{\s*onCommitted\(\);\s*\}[\s\S]*return parseTransactionEvidence/u,
    );
    expect(cli).toMatch(
      /onCommitted: \(\) => \{\s*publicCommitted = true;\s*\}/u,
    );
  });
});
