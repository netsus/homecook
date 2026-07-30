import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type MigrationModule = typeof import(
  "../scripts/lib/hybrid-production-data-migration.mjs"
);

async function loadMigrationModule(): Promise<MigrationModule | null> {
  return import("../scripts/lib/hybrid-production-data-migration.mjs")
    .catch(() => null);
}

function executeStorageFixtureClient({
  args,
  env,
  script,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  script: string;
}) {
  return new Promise<{ stderr: string; stdout: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--input-type=module", "-e", script, ...args],
        {
          env,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.once("error", reject);
      child.once("close", (status) => {
        if (status !== 0) {
          reject(new Error(`fixture client failed: ${stderr}`));
          return;
        }
        resolve({ stderr, stdout });
      });
    },
  );
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
      commitMarkerSql:
        "insert into public.operational_events (id) values ('attempt');",
      dataSql: "-- source data",
      dryRun: false,
      evidenceSql: "select 'HOMECOOK_EVIDENCE|{}';",
      transactionPreambleSql:
        "set local application_name = 'homecook-migration-attempt';",
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
    expect(apply).toMatch(
      /begin;[\s\S]*set local application_name[\s\S]*-- source data[\s\S]*HOMECOOK_EVIDENCE[\s\S]*insert into public\.operational_events[\s\S]*commit;/u,
    );
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
    expect(() =>
      migration.assertLegacyEvidenceArchive({
        entries: ["--checkpoint-action=exec=malicious/backup-manifest.json"],
        types: ["-"],
      }),
    ).toThrow(/unsafe legacy archive path/u);
    expect(() =>
      migration.assertLegacyEvidenceArchive({
        entries: [...entries, entries.at(-1)!],
        types: [
          ...entries.map((entry) => entry.endsWith("/") ? "d" : "-"),
          "-",
        ],
      }),
    ).toThrow(/duplicate/u);
  });

  it("requires the legacy manifest and regular payload inventory to match exactly", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }
    const root = "hybrid-rehearsal-20260730";
    const sha256 = "a".repeat(64);
    const manifestObjects = [{
      bucket: "recipe-images",
      path: "storage-objects/recipe-images/owner/object.jpg",
      sha256,
      size_bytes: 3,
    }];
    const archiveFile = {
      bytes: 3,
      path: `${root}/storage-objects/recipe-images/owner/object.jpg`,
      sha256,
    };

    expect(migration.validateLegacyStoragePayloadInventory({
      archiveFiles: [archiveFile],
      manifestObjects,
      root,
    })).toEqual([{
      ...manifestObjects[0],
      archiveEntry: archiveFile.path,
      path: "owner/object.jpg",
    }]);

    expect(() => migration.validateLegacyStoragePayloadInventory({
      archiveFiles: [],
      manifestObjects,
      root,
    })).toThrow(/exactly match/u);
    expect(() => migration.validateLegacyStoragePayloadInventory({
      archiveFiles: [
        archiveFile,
        {
          ...archiveFile,
          path: `${root}/storage-objects/recipe-images/extra.jpg`,
        },
      ],
      manifestObjects,
      root,
    })).toThrow(/exactly match/u);
    expect(() => migration.validateLegacyStoragePayloadInventory({
      archiveFiles: [archiveFile, archiveFile],
      manifestObjects,
      root,
    })).toThrow(/duplicate/u);
    expect(() => migration.validateLegacyStoragePayloadInventory({
      archiveFiles: [{ ...archiveFile, sha256: "b".repeat(64) }],
      manifestObjects,
      root,
    })).toThrow(/exactly match/u);

    const cli = readFileSync(
      "scripts/hybrid-production-data-migration.mjs",
      "utf8",
    );
    expect(cli).toMatch(
      /archivePlan\.storageEntries\.map[\s\S]*stdoutPath:[\s\S]*sha256File[\s\S]*validateLegacyStoragePayloadInventory/u,
    );
  });

  it("accepts zero, PNG, WebP, and order-independent Storage evidence before commit", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }
    const png = {
      bucket: "recipe-images",
      bytes: 3,
      cacheControl: "max-age=60",
      contentType: "image/png",
      name: "owner/a.png",
      sha256: "a".repeat(64),
    };
    const webp = {
      bucket: "recipe-images-private",
      bytes: 4,
      cacheControl: "max-age=3600",
      contentType: "image/webp",
      name: "owner/z.webp",
      sha256: "b".repeat(64),
    };

    expect(migration.validateStorageMigrationEvidence({
      actual: [],
      expected: [],
    })).toEqual({ count: 0, objects: [] });
    expect(migration.validateStorageMigrationEvidence({
      actual: [png],
      expected: [png],
    })).toEqual({ count: 1, objects: [png] });
    expect(migration.validateStorageMigrationEvidence({
      actual: [webp],
      expected: [webp],
    })).toEqual({ count: 1, objects: [webp] });
    expect(migration.validateStorageMigrationEvidence({
      actual: [webp, png],
      expected: [png, webp],
    })).toEqual({
      count: 2,
      objects: [png, webp],
    });
    expect(() =>
      migration.validateStorageMigrationEvidence({
        actual: [{ ...png, contentType: "image/webp" }],
        expected: [png],
      }),
    ).toThrow(/Storage migration evidence/u);
    expect(() =>
      migration.validateStorageMigrationEvidence({
        actual: [png, png],
        expected: [png],
      }),
    ).toThrow(/duplicate|Storage migration evidence/u);
  });

  it("preserves Storage when commit succeeded but acknowledgement was lost", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }

    expect(migration.resolvePublicMigrationOutcome({
      executionStatus: "failed",
      markerStatus: "present",
      transactionActive: false,
    })).toEqual({
      databaseOutcome: "committed",
      reason: "durable-marker-present",
    });
    expect(migration.planStorageCommitBoundary({
      databaseOutcome: "committed",
      storageVerifiedBeforeCommit: true,
    })).toEqual({
      commitAllowed: true,
      compensateStorage: false,
      reconciliationRequired: false,
    });
  });

  it.each([
    ["confirmed rollback", "failed"],
    ["pre-commit failure", "precommit_failed"],
  ])("compensates Storage only after %s", async (_label, executionStatus) => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }

    expect(migration.resolvePublicMigrationOutcome({
      executionStatus,
      markerStatus: "absent",
      transactionActive: false,
    })).toEqual({
      databaseOutcome: "rolled_back",
      reason: "marker-absent-and-transaction-inactive",
    });
    expect(migration.planStorageCommitBoundary({
      databaseOutcome: "rolled_back",
      storageVerifiedBeforeCommit: true,
    })).toEqual({
      commitAllowed: true,
      compensateStorage: true,
      reconciliationRequired: false,
    });
  });

  it("preserves Storage and requests reconciliation when commit outcome is unknown", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }

    expect(migration.resolvePublicMigrationOutcome({
      executionStatus: "failed",
      markerStatus: "unknown",
      transactionActive: null,
    })).toEqual({
      databaseOutcome: "unknown",
      reason: "commit-marker-unavailable",
    });
    expect(migration.resolvePublicMigrationOutcome({
      executionStatus: "failed",
      markerStatus: "absent",
      transactionActive: true,
    })).toEqual({
      databaseOutcome: "unknown",
      reason: "commit-outcome-unconfirmed",
    });
    expect(migration.planStorageCommitBoundary({
      databaseOutcome: "unknown",
      storageVerifiedBeforeCommit: true,
    })).toEqual({
      commitAllowed: true,
      compensateStorage: false,
      reconciliationRequired: true,
    });
  });

  it("verifies public and private uploads through the authenticated Storage API before commit", async () => {
    const migration = await loadMigrationModule();
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }
    const api = migration as unknown as {
      buildStorageApiRequestScript: () => string;
      planStorageCommitBoundary: (input: {
        databaseOutcome: "committed" | "rolled_back" | "unknown";
        storageVerifiedBeforeCommit: boolean;
      }) => {
        commitAllowed: boolean;
        compensateStorage: boolean;
        reconciliationRequired: boolean;
      };
    };
    expect(api.buildStorageApiRequestScript).toBeTypeOf("function");
    expect(api.planStorageCommitBoundary).toBeTypeOf("function");

    const serviceJwt = "fixture-service-role-token";
    const objects = new Map<string, {
      body: Buffer;
      cacheControl: string;
      contentType: string;
    }>();
    const calls: Array<{
      authorization: string;
      method: string;
      path: string;
    }> = [];
    const server = createServer(async (request, response) => {
      const body = Buffer.concat(
        await Array.fromAsync(request),
      );
      const path = request.url ?? "";
      calls.push({
        authorization: request.headers.authorization ?? "",
        method: request.method ?? "",
        path,
      });
      if (request.headers.authorization !== `Bearer ${serviceJwt}`) {
        response.writeHead(401).end();
        return;
      }
      const upload = /^\/object\/([^/]+)\/(.+)$/u.exec(path);
      const authenticated =
        /^\/object\/authenticated\/([^/]+)\/(.+)$/u.exec(path);
      if (request.method === "POST" && upload) {
        objects.set(`${upload[1]}/${upload[2]}`, {
          body,
          cacheControl: request.headers["cache-control"] ?? "",
          contentType: request.headers["content-type"] ?? "",
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
        return;
      }
      if (request.method === "GET" && authenticated) {
        const object = objects.get(
          `${authenticated[1]}/${authenticated[2]}`,
        );
        if (!object) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, {
          "cache-control": object.cacheControl,
          "content-type": object.contentType,
        });
        response.end(object.body);
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    expect(address).not.toBeNull();
    expect(typeof address).not.toBe("string");
    if (!address || typeof address === "string") {
      server.close();
      return;
    }
    const directory = mkdtempSync(
      join(tmpdir(), "homecook-storage-api-fixture-"),
    );
    try {
      const results = [];
      for (const [index, fixture] of [
        {
          bucket: "recipe-images",
          cacheControl: "max-age=60",
          extension: "png",
          mime: "image/png",
        },
        {
          bucket: "recipe-images-private",
          cacheControl: "max-age=3600",
          extension: "webp",
          mime: "image/webp",
        },
      ].entries()) {
        const payload = Buffer.from(
          `fixture-${fixture.bucket}`,
          "utf8",
        );
        const file = join(directory, `payload-${index}.bin`);
        writeFileSync(file, payload, { mode: 0o600 });
        const common = [
          `http://127.0.0.1:${address.port}`,
          fixture.bucket,
          `owner/object-${index}.${fixture.extension}`,
          fixture.mime,
          fixture.cacheControl,
        ];
        results.push(JSON.parse((await executeStorageFixtureClient({
          args: [
            common[0],
            "POST",
            ...common.slice(1),
            file,
          ],
          env: { ...process.env, SERVICE_JWT: serviceJwt },
          script: api.buildStorageApiRequestScript(),
        })).stdout));
        results.push(JSON.parse((await executeStorageFixtureClient({
          args: [
            common[0],
            "GET",
            ...common.slice(1),
            "",
          ],
          env: { ...process.env, SERVICE_JWT: serviceJwt },
          script: api.buildStorageApiRequestScript(),
        })).stdout));
      }

      expect(results).toEqual([
        expect.objectContaining({ status: 200 }),
        expect.objectContaining({
          bytes: Buffer.byteLength("fixture-recipe-images"),
          cacheControl: "max-age=60",
          contentType: "image/png",
          status: 200,
        }),
        expect.objectContaining({ status: 200 }),
        expect.objectContaining({
          bytes: Buffer.byteLength("fixture-recipe-images-private"),
          cacheControl: "max-age=3600",
          contentType: "image/webp",
          status: 200,
        }),
      ]);
      expect(calls.filter((call) => call.method === "GET")).toEqual([
        expect.objectContaining({
          authorization: `Bearer ${serviceJwt}`,
          path:
            "/object/authenticated/recipe-images/owner/object-0.png",
        }),
        expect.objectContaining({
          authorization: `Bearer ${serviceJwt}`,
          path:
            "/object/authenticated/recipe-images-private/owner/object-1.webp",
        }),
      ]);
      expect(JSON.stringify(results)).not.toContain(serviceJwt);
      expect(api.planStorageCommitBoundary({
        databaseOutcome: "rolled_back",
        storageVerifiedBeforeCommit: true,
      })).toEqual({
        commitAllowed: true,
        compensateStorage: true,
        reconciliationRequired: false,
      });
      expect(api.planStorageCommitBoundary({
        databaseOutcome: "committed",
        storageVerifiedBeforeCommit: true,
      })).toEqual({
        commitAllowed: true,
        compensateStorage: false,
        reconciliationRequired: false,
      });
      expect(() => api.planStorageCommitBoundary({
        databaseOutcome: "committed",
        storageVerifiedBeforeCommit: false,
      })).toThrow(/must verify before public commit/u);
    } finally {
      server.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("contains no fallible Storage verification after the public commit boundary", () => {
    const cli = readFileSync(
      "scripts/hybrid-production-data-migration.mjs",
      "utf8",
    );

    expect(cli).toMatch(
      /validateStorageMigrationEvidence[\s\S]*executePublicMigration/u,
    );
    const storageValidation = cli.indexOf(
      "storageEvidence = validateStorageMigrationEvidence",
    );
    const publicExecution = cli.indexOf(
      "const execution = executePublicMigration",
    );
    expect(storageValidation).toBeGreaterThan(-1);
    expect(publicExecution).toBeGreaterThan(storageValidation);
    expect(cli.slice(publicExecution)).not.toContain(
      "validateStorageMigrationEvidence",
    );
    expect(cli.slice(publicExecution)).not.toContain(
      "catalogSnapshot(target)",
    );
    expect(cli).toContain("probePublicMigrationAttempt");
    expect(cli).toMatch(
      /psql\(target, sql,[\s\S]*applicationName:[\s\S]*attempt\.applicationName/u,
    );
    expect(cli).toMatch(
      /const first = probePublicMigrationAttemptOnce[\s\S]*const second = probePublicMigrationAttemptOnce/u,
    );
    expect(cli).not.toContain("storageEvidence[0]");
    expect(cli).not.toContain("storagePairs[0]");
    expect(cli).not.toContain("publicCommitted");
    expect(cli).not.toContain("storageMutation.verify()");
    expect(cli).toContain(
      "remote-auth-provider-revision-cas-not-evaluated",
    );
    expect(cli).toContain("publication_safe: false");
    expect(
      readFileSync(
        "scripts/lib/hybrid-production-data-migration.mjs",
        "utf8",
      ),
    ).not.toContain("image/jpeg");
  });
});
