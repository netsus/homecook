import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assertIntegratedMasterDatabaseGuard,
  assertIntegratedMasterDescriptor,
  assertIntegratedMasterDatabaseObservation,
  assertIntegratedMasterWebFirstState,
  integratedMasterAppliedDatabaseState,
  parseIntegratedMasterDescriptor,
  reviewedIntegratedMasterReadiness,
  unwrapIntegratedMigration,
  YOUTUBE_INTEGRATED_CLIENT_VERSION,
  YOUTUBE_INTEGRATED_DB_GUARD_SCHEMA,
  YOUTUBE_INTEGRATED_LIVE_RELEASE,
  YOUTUBE_INTEGRATED_MIGRATION,
  YOUTUBE_INTEGRATED_PIPELINE_IDENTITY,
  YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR,
  YOUTUBE_INTEGRATED_SOURCE_COMMITS,
  YOUTUBE_INTEGRATED_VERIFIER_VERSION,
  YOUTUBE_INTEGRATED_ROLLBACK_REASON,
  YOUTUBE_INTEGRATED_WEB_FIRST_SCHEMA,
} from "../scripts/lib/prelaunch-integrated-master-readiness.mjs";
import {
  classifyPrelaunchScope,
  parsePrelaunchOptions,
} from "../scripts/lib/prelaunch-web-deploy.mjs";

const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const controlledDbSource = readFileSync(new URL("../scripts/youtube-integrated-controlled-db.mjs", import.meta.url), "utf8");
const deploySource = readFileSync(new URL("../scripts/deploy-prelaunch-web.mjs", import.meta.url), "utf8");
const runtimePath = "lib/server/youtube-i031-runtime/bundle/scripts/recipe-loop/lib/source-anchored-vision.mjs";
const policyPath = "lib/server/youtube-async-extraction.ts";
const deniedPath = ".oxlintrc.json";
const contents = new Map<string, Buffer>([
  [runtimePath, Buffer.from(`${YOUTUBE_INTEGRATED_CLIENT_VERSION}\n${YOUTUBE_INTEGRATED_VERIFIER_VERSION}`)],
  [policyPath, Buffer.from(YOUTUBE_INTEGRATED_PIPELINE_IDENTITY)],
  [YOUTUBE_INTEGRATED_MIGRATION, Buffer.from("begin; select 1; commit;\n")],
  [deniedPath, Buffer.from("{}\n")],
]);
const paths = [deniedPath, policyPath, runtimePath, YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR,
  YOUTUBE_INTEGRATED_MIGRATION].sort();
const descriptorValue = {
  schema: "homecook.youtube-integrated-master-release.v1",
  liveReleaseSha: YOUTUBE_INTEGRATED_LIVE_RELEASE,
  sourceCommits: [...YOUTUBE_INTEGRATED_SOURCE_COMMITS],
  database: {
    beforeLedgerCount: 218,
    afterLedgerCount: 219,
    migration: { path: YOUTUBE_INTEGRATED_MIGRATION, sha256: digest(contents.get(YOUTUBE_INTEGRATED_MIGRATION)!) },
  },
  worker: {
    policyVersion: 3,
    credentialGenerationBefore: 46,
    credentialGenerationAfter: 47,
    pipelineIdentity: YOUTUBE_INTEGRATED_PIPELINE_IDENTITY,
    clientVersion: YOUTUBE_INTEGRATED_CLIENT_VERSION,
    verifierVersion: YOUTUBE_INTEGRATED_VERIFIER_VERSION,
  },
  files: paths.map((path) => ({
    path,
    beforeSha256: null,
    afterSha256: path === YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR ? null : digest(contents.get(path)!),
  })),
};

describe("prelaunch integrated master readiness", () => {
  it("binds the complete live-to-master file closure and both source commits", () => {
    const descriptor = parseIntegratedMasterDescriptor(Buffer.from(JSON.stringify(descriptorValue)));
    const review = assertIntegratedMasterDescriptor({
      descriptor,
      liveSha: YOUTUBE_INTEGRATED_LIVE_RELEASE,
      changedFiles: paths,
      readAt: (ref: string, path: string) => ref === YOUTUBE_INTEGRATED_LIVE_RELEASE ? null : contents.get(path) ?? null,
      isAncestor: (source: string) => YOUTUBE_INTEGRATED_SOURCE_COMMITS.includes(source),
    });
    expect([...review.reviewedFiles]).toEqual(paths);
    expect(() => assertIntegratedMasterDescriptor({
      descriptor,
      liveSha: YOUTUBE_INTEGRATED_LIVE_RELEASE,
      changedFiles: [...paths, "unexpected"],
      readAt: () => null,
      isAncestor: () => true,
    })).toThrow("closure");
    expect(() => assertIntegratedMasterDescriptor({
      descriptor,
      liveSha: YOUTUBE_INTEGRATED_LIVE_RELEASE,
      changedFiles: paths,
      readAt: (ref: string, path: string) => ref === "target" && path === deniedPath
        ? Buffer.from("drift") : ref === "target" ? contents.get(path) ?? null : null,
      isAncestor: () => true,
    })).toThrow("target digest");

    const deletedPath = "scripts/retired-helper.mjs";
    const deletedBytes = Buffer.from("export {};\n");
    const deletedDescriptorValue = {
      ...descriptorValue,
      files: [...descriptorValue.files, {
        path: deletedPath,
        beforeSha256: digest(deletedBytes),
        afterSha256: null,
      }].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    };
    const deletedDescriptor = parseIntegratedMasterDescriptor(
      Buffer.from(JSON.stringify(deletedDescriptorValue)),
    );
    expect(assertIntegratedMasterDescriptor({
      descriptor: deletedDescriptor,
      liveSha: YOUTUBE_INTEGRATED_LIVE_RELEASE,
      changedFiles: deletedDescriptor.files.map((entry: { path: string }) => entry.path),
      readAt: (ref: string, path: string) => path === deletedPath
        ? ref === YOUTUBE_INTEGRATED_LIVE_RELEASE ? deletedBytes : null
        : ref === YOUTUBE_INTEGRATED_LIVE_RELEASE ? null : contents.get(path) ?? null,
      isAncestor: () => true,
    }).reviewedFiles.has(deletedPath)).toBe(true);
  });

  it("allows otherwise denied support only inside the exact reviewed set", () => {
    const manifest = { scripts: { build: "next build" } };
    expect(classifyPrelaunchScope([deniedPath], manifest, manifest,
      { reviewedIntegratedFiles: new Set([deniedPath]) }).support).toEqual([deniedPath]);
    expect(() => classifyPrelaunchScope([deniedPath, "secrets.txt"], manifest, manifest,
      { reviewedIntegratedFiles: new Set([deniedPath]) })).toThrow("허용하지 않는");
  });

  it("requires origin/master plus predecessor DB verification for the integrated web-first lane", () => {
    expect(parsePrelaunchOptions(["--reviewed-integrated-master-readiness",
      "--db-config", "/private/config"]).reviewedIntegratedMasterReadiness).toBe(true);
    expect(() => parsePrelaunchOptions(["--reviewed-integrated-master-readiness",
      "--already-applied-db", "--db-config", "/private/config"])).toThrow("선배포");
    expect(() => parsePrelaunchOptions(["--reviewed-integrated-master-readiness",
      "--db-config", "/private/config", "--reviewed-ref", "a".repeat(40)])).toThrow("origin/master");
  });

  it("accepts only the exact applied 219 bridge ledger and retargets existing R2 proof", () => {
    const descriptor = parseIntegratedMasterDescriptor(Buffer.from(JSON.stringify(descriptorValue)));
    const migration = descriptor.database.migration;
    const prefix = Array.from({ length: 218 }, (_, index) => ({
      filename: `${String(index).padStart(14, "0")}_prior.sql`,
      sha256: "a".repeat(64),
    }));
    const source = [...prefix, { filename: migration.path.replace("supabase/migrations/", ""), sha256: migration.sha256 }];
    expect(integratedMasterAppliedDatabaseState({ baselineRequired: false, pending: [], applied: source, source },
      descriptor, "b".repeat(40))).toMatchObject({ ledgerCount: 219, backwardCompatible: false });
    expect(() => integratedMasterAppliedDatabaseState({ baselineRequired: false, pending: [], applied: prefix, source: prefix },
      descriptor, "b".repeat(40))).toThrow("ledger");

    const previous = {
      Label: "com.homecook.production",
      WorkingDirectory: "/live",
      ProgramArguments: ["/node", "/live/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"],
      EnvironmentVariables: {
        MUMEOK_ROUND2_RELEASE_SHA: YOUTUBE_INTEGRATED_LIVE_RELEASE,
        MUMEOK_ROUND2_REPOSITORY_ROOT: "/live",
        MUMEOK_ROUND2_READINESS_PATH: "/private/readiness.json",
      },
    };
    const next = {
      ...previous,
      WorkingDirectory: "/next",
      ProgramArguments: ["/node", "/next/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"],
      EnvironmentVariables: { ...previous.EnvironmentVariables },
    };
    const readiness = { version: 1, profile: "production", origin: "https://app.mumeok.kr",
      hostname: "app.mumeok.kr", verified_at: "2026-10-12T00:00:00Z",
      release_sha: YOUTUBE_INTEGRATED_LIVE_RELEASE };
    expect(reviewedIntegratedMasterReadiness({ readiness, previous, next,
      liveSha: YOUTUBE_INTEGRATED_LIVE_RELEASE, releaseSha: "b".repeat(40), files: paths,
      databaseDeployment: true, review: { descriptor } }).readiness.release_sha).toBe("b".repeat(40));
  });

  it("accepts only DB218 before web activation and public owner-created rows after DB219", () => {
    const descriptor = parseIntegratedMasterDescriptor(Buffer.from(JSON.stringify(descriptorValue)));
    const prefix = Array.from({ length: 218 }, (_, index) => ({
      filename: `${String(index).padStart(14, "0")}_prior.sql`,
      sha256: "a".repeat(64),
    }));
    const source = [...prefix, {
      filename: descriptor.database.migration.path.replace("supabase/migrations/", ""),
      sha256: descriptor.database.migration.sha256,
    }];
    const target = { database: { systemIdentifier: "7669475895419854882", major: 17 } };
    expect(assertIntegratedMasterDatabaseObservation({ descriptor, source, ledger: prefix,
      phase: "predecessor", target, saved: { savedRows: 4, bridgeFunctionAbsent: true } }))
      .toMatchObject({ phase: "predecessor", savedRows: 4, pending: [source.at(-1)] });
    expect(assertIntegratedMasterDatabaseObservation({ descriptor, source, ledger: source,
      phase: "applied", target, saved: { savedRows: 4, canonicalRows: 4, invalidRows: 0 } }))
      .toMatchObject({ phase: "applied", savedRows: 4, pending: [] });
    expect(() => assertIntegratedMasterDatabaseObservation({ descriptor, source, ledger: source,
      phase: "applied", target, saved: { savedRows: 4, canonicalRows: 4, invalidRows: 1 } }))
      .toThrow("public owner-created");
  });

  it("binds DB219 apply to the exact serving web-first release and predecessor proof", () => {
    const descriptor = parseIntegratedMasterDescriptor(Buffer.from(JSON.stringify(descriptorValue)));
    const releaseSha = "b".repeat(40);
    const live = { cwd: "/private/release", ref: releaseSha, buildId: "prelaunch-build" };
    const state = {
      ref: releaseSha,
      checkout: live.cwd,
      buildId: live.buildId,
      databaseVerification: {
        phase: "predecessor",
        savedRows: 4,
        pending: [{ sha256: descriptor.database.migration.sha256 }],
      },
      integratedMasterWebFirst: {
        schema: YOUTUBE_INTEGRATED_WEB_FIRST_SCHEMA,
        releaseSha,
        buildId: live.buildId,
        databasePhase: "predecessor",
        migrationSha256: descriptor.database.migration.sha256,
      },
    };
    expect(assertIntegratedMasterWebFirstState({ state, live, releaseSha, descriptor }))
      .toEqual({ releaseSha, buildId: live.buildId, checkout: live.cwd });
    expect(() => assertIntegratedMasterWebFirstState({
      state: { ...state, buildId: "other-build" }, live, releaseSha, descriptor,
    })).toThrow("live web");
    expect(() => assertIntegratedMasterWebFirstState({
      state: { ...state, integratedMasterWebFirst: undefined }, live, releaseSha, descriptor,
    })).toThrow("web-first marker");
  });

  it("ties the fail-closed rollback guard to the exact operation journal", () => {
    const releaseSha = "b".repeat(40);
    const migrationSha256 = "c".repeat(64);
    const operationId = "11111111-2222-4333-8444-555555555555";
    const operationRoot = "/private/youtube-integrated";
    const guard = {
      schema: YOUTUBE_INTEGRATED_DB_GUARD_SCHEMA,
      status: "commit_dispatch_guard",
      operationId,
      operationDirectory: `${operationRoot}/${operationId}`,
      journalFile: "commit-intent.json",
      releaseSha,
      migrationSha256,
      backwardCompatible: false,
      reason: YOUTUBE_INTEGRATED_ROLLBACK_REASON,
    };
    const journal = { operationId, releaseSha, migration: { sha256: migrationSha256 } };
    expect(assertIntegratedMasterDatabaseGuard({ guard, journal, releaseSha,
      migrationSha256, operationRoot })).toMatchObject({ status: "commit_dispatch_guard" });
    expect(() => assertIntegratedMasterDatabaseGuard({
      guard: { ...guard, operationDirectory: "/private/other/11111111-2222-4333-8444-555555555555" },
      journal, releaseSha, migrationSha256, operationRoot,
    })).toThrow("rollback guard");
    expect(() => assertIntegratedMasterDatabaseGuard({
      guard, journal: { ...journal, releaseSha: "d".repeat(40) }, releaseSha,
      migrationSha256, operationRoot,
    })).toThrow("guard journal");
  });

  it("wires the shared deploy lock, queue locks, serving-web proof, and rollback guard into the operational lane", () => {
    expect(controlledDbSource).toContain("mkdirSync(deploymentLockPath");
    expect(controlledDbSource).toContain("mkdirSync(backupDirectory, { mode: 0o700 })");
    expect(controlledDbSource).toContain("JSON.parse((await query(sql)).trim())");
    expect(controlledDbSource).toContain("LOCK TABLE public.youtube_extraction_jobs IN SHARE ROW EXCLUSIVE MODE");
    expect(controlledDbSource).toContain("LOCK TABLE public.youtube_extractor_permits IN SHARE ROW EXCLUSIVE MODE");
    expect(controlledDbSource).toContain("await verifyLiveWebFirst(options.releaseSha, descriptor)");
    expect(controlledDbSource).toContain("status: \"commit_dispatch_guard\"");
    expect(deploySource).toContain("integratedMasterWebFirst");
    expect(deploySource).toContain("loadIntegratedDatabaseGuard(state.ref");
    expect(deploySource).toContain("await durableJson(databaseStatePath, database)");
    expect(deploySource).toContain("await durableJson(statePath");
    expect(deploySource).toContain("durableUnlink(integratedDatabaseGuardPath)");
  });

  it("unwraps exactly one migration transaction for the controlled DB session", () => {
    expect(unwrapIntegratedMigration(Buffer.from("begin;\nselect 1;\ncommit;\n")))
      .toBe("select 1;");
    expect(() => unwrapIntegratedMigration(Buffer.from("select 1;")))
      .toThrow("outer transaction");
    expect(() => unwrapIntegratedMigration(Buffer.from("begin;\ncommit; begin; select 1;\ncommit;")))
      .toThrow("nested transaction");
  });
});
