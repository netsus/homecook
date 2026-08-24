import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  assertNoStage4AuxiliaryContainerName,
  assertNoStage4GuardedDataContainers,
  assertNoStage4ShadowSeedContainers,
  assertStage4AuxiliaryContainerIdentity,
  assertStage4AuxiliaryContainerRunId,
  buildStage4GuardedDataContainerArgs,
  buildStage4ShadowSeedContainerArgs,
  createStage4ShadowSeedDatabaseJwt,
  runStage4AuxiliaryContainerStart,
  runStage4ShadowSeedLifecycle,
} from "../scripts/lib/cooking-meal-log-stage4-shadow-seed.mjs";
import {
  buildStage4DiagnosticOutcome,
  runStage4DockerCleanup,
} from "../scripts/lib/cooking-meal-log-stage4-isolated.mjs";
import {
  buildLocalDemoSeedClientOptions,
  resolveLocalDemoSeedTargets,
} from "../scripts/lib/local-demo-seed-targets.mjs";

function decodeBase64UrlJson(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

describe("cooking meal-log Stage 4 shadow seed Data API", () => {
  it("classifies a pre-id auxiliary run conflict and blocks every broad cleanup", () => {
    const contested = (() => {
      try {
        runStage4AuxiliaryContainerStart({
          assertNameAvailable: () => true,
          start: () => {
            throw new Error("docker name conflict with sensitive output");
          },
        });
        throw new Error("expected auxiliary start to fail");
      } catch (error) {
        return error as Error & {
          code?: string;
          safeFailure?: { code: string; message: string };
        };
      }
    })();

    expect(contested).toMatchObject({
      code: "auxiliary_identity_mismatch",
      safeFailure: {
        code: "auxiliary_identity_mismatch",
        message: "Stage 4 auxiliary Docker identity could not be proven",
      },
    });
    expect(contested?.message).not.toContain("sensitive output");

    const stopCleanup = vi.fn(() => true);
    const fallbackCleanup = vi.fn();
    const verifyCleanup = vi.fn();
    expect(() => runStage4DockerCleanup({
      contestedError: contested,
      fallbackCleanup,
      stopCleanup,
      verifyCleanup,
    })).toThrow(contested);
    expect(stopCleanup).not.toHaveBeenCalled();
    expect(fallbackCleanup).not.toHaveBeenCalled();
    expect(verifyCleanup).not.toHaveBeenCalled();
    expect(buildStage4DiagnosticOutcome({
      cleanupError: contested,
      diagnosticStatus: "failed",
      primaryFailure: contested?.safeFailure ?? null,
    })).toMatchObject({
      cleanupFailure: contested?.safeFailure,
      failure: contested?.safeFailure,
      status: "failed",
    });
  });

  it("accepts only one exact Docker run container id", () => {
    const id = "a".repeat(64);
    expect(assertStage4AuxiliaryContainerRunId(`${id}\n`)).toBe(id);
    expect(() => assertStage4AuxiliaryContainerRunId("short-id\n"))
      .toThrow(/container id/u);
    expect(() => assertStage4AuxiliaryContainerRunId(`${id}\n${"b".repeat(64)}\n`))
      .toThrow(/container id/u);
  });

  it("requires exact id, name, project and service before auxiliary deletion", () => {
    const expected = {
      containerId: "a".repeat(64),
      containerName: "homecook_stage4_guarded_rest_hcg_123_abc",
      projectId: "hcg_123_abc",
      serviceLabel: "stage4-guarded-postgrest",
    };
    const resource = {
      Config: { Labels: {
        "com.docker.compose.project": expected.projectId,
        "com.docker.compose.service": expected.serviceLabel,
      } },
      Id: expected.containerId,
      Name: `/${expected.containerName}`,
    };

    expect(assertStage4AuxiliaryContainerIdentity({ expected, resource }))
      .toBe(expected.containerId);
    for (const mismatch of [
      { ...resource, Id: "b".repeat(64) },
      { ...resource, Name: "/replacement" },
      { ...resource, Config: { Labels: {
        ...resource.Config.Labels,
        "com.docker.compose.project": "other-project",
      } } },
      { ...resource, Config: { Labels: {
        ...resource.Config.Labels,
        "com.docker.compose.service": "other-service",
      } } },
    ]) {
      expect(() => assertStage4AuxiliaryContainerIdentity({
        expected,
        resource: mismatch,
      })).toThrow(/identity/u);
    }
    const mismatchedExpected = {
      ...expected,
      containerName: "homecook_stage4_guarded_rest_hcg_other_project",
    };
    expect(() => assertStage4AuxiliaryContainerIdentity({
      expected: mismatchedExpected,
      resource: { ...resource, Name: `/${mismatchedExpected.containerName}` },
    })).toThrow(/identity/u);
  });

  it("detects an exact same-name replacement regardless of project labels", () => {
    const expectedName = "homecook_stage4_guarded_rest_hcg_123_abc";
    expect(assertNoStage4AuxiliaryContainerName({
      expectedName,
      resources: [{ Name: "/unrelated" }],
    })).toBe(true);
    expect(() => assertNoStage4AuxiliaryContainerName({
      expectedName,
      resources: [{
        Config: { Labels: { "com.docker.compose.project": "attacker" } },
        Id: "b".repeat(64),
        Name: `/${expectedName}`,
      }],
    })).toThrow(/same-name/u);

    const runner = readFileSync(
      join(process.cwd(), "scripts/run-cooking-meal-log-stage4-isolated-capture.mjs"),
      "utf8",
    );
    expect(runner).toContain('["container", "rm", "--force", containerId]');
    expect(runner).not.toContain(
      '["container", "rm", "--force", container.containerName]',
    );
  });

  it("creates a temporary HS256 postgres database JWT without embedding the secret", () => {
    const jwtSecret = "shadow-secret-that-must-not-appear-in-the-token";
    const token = createStage4ShadowSeedDatabaseJwt({
      jwtSecret,
      nowSeconds: 1_786_000_000,
    });
    const [encodedHeader, encodedPayload, signature] = token.split(".");

    expect(decodeBase64UrlJson(encodedHeader)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decodeBase64UrlJson(encodedPayload)).toEqual({
      aud: "authenticated",
      exp: 1_786_003_600,
      iat: 1_786_000_000,
      role: "postgres",
    });
    expect(signature).toBe(
      createHmac("sha256", jwtSecret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest("base64url"),
    );
    expect(token).not.toContain(jwtSecret);
  });

  it("builds one project-owned main-database PostgREST without a pre-request guard", () => {
    const args = buildStage4ShadowSeedContainerArgs({
      containerName: "homecook_stage4_seed_rest_hcg_123_abc",
      environmentFilePath: "/tmp/shadow-seed.env",
      image: "public.ecr.aws/supabase/postgrest:v14.14",
      networkId: "network-123",
      port: 4312,
      projectId: "hcg_123_abc",
    });
    const serialized = args.join(" ");

    expect(args).toContain("127.0.0.1:4312:3000");
    expect(args).toContain("com.docker.compose.project=hcg_123_abc");
    expect(args).toContain("com.docker.compose.service=stage4-shadow-seed-postgrest");
    expect(args).toContain("/tmp/shadow-seed.env");
    expect(args.at(-1)).toBe("public.ecr.aws/supabase/postgrest:v14.14");
    expect(serialized).not.toContain("pgrst.db_pre_request");

    const runner = readFileSync(
      join(process.cwd(), "scripts/run-cooking-meal-log-stage4-isolated-capture.mjs"),
      "utf8",
    );
    expect(runner).toContain('"PGRST_DB_CONFIG=false"');
    expect(runner).toContain(":5432/postgres`");
    const shadowStart = runner.indexOf("async function startStage4ShadowSeedApi");
    const guardedStart = runner.indexOf("async function startStage4GuardedDataApi");
    expect(runner.slice(shadowStart, guardedStart))
      .not.toContain("PGRST_DB_PRE_REQUEST=");
    expect(runner.slice(shadowStart, guardedStart)).toContain(
      "createStage4ShadowSeedDatabaseJwt",
    );
    expect(runner.slice(shadowStart, guardedStart)).toContain("databaseKey");
    expect(runner.slice(shadowStart, guardedStart)).not.toContain(
      "status.SERVICE_ROLE_KEY",
    );

    const seedStart = runner.indexOf("seed: () => run(");
    const seedEnd = runner.indexOf("startShadow: async () =>", seedStart);
    const seedBlock = runner.slice(seedStart, seedEnd);
    expect(seedBlock).toContain(
      "HOMECOOK_LOCAL_SEED_DATA_API_SERVICE_ROLE_KEY:",
    );
    expect(seedBlock).toContain("shadowSeedApi.databaseKey");
    expect(seedBlock).not.toContain("shadowSeedApi.serviceRoleKey");
    expect(seedBlock).not.toContain("status.SERVICE_ROLE_KEY");
  });

  it("builds one project-owned guarded Data API with a distinct container identity", () => {
    const args = buildStage4GuardedDataContainerArgs({
      containerName: "homecook_stage4_guarded_rest_hcg_123_abc",
      environmentFilePath: "/tmp/guarded-data.env",
      image: "public.ecr.aws/supabase/postgrest:v14.14",
      networkId: "network-123",
      port: 4313,
      projectId: "hcg_123_abc",
    });

    expect(args).toContain("127.0.0.1:4313:3000");
    expect(args).toContain("com.docker.compose.project=hcg_123_abc");
    expect(args).toContain("com.docker.compose.service=stage4-guarded-postgrest");
    expect(args).toContain("/tmp/guarded-data.env");
    expect(args.at(-1)).toBe("public.ecr.aws/supabase/postgrest:v14.14");

    const runner = readFileSync(
      join(process.cwd(), "scripts/run-cooking-meal-log-stage4-isolated-capture.mjs"),
      "utf8",
    );
    expect(runner).toContain(
      "PGRST_DB_PRE_REQUEST=public.verify_hybrid_request_authority_pre_request",
    );
    expect(runner).toContain("jwtSecret: status.JWT_SECRET");
  });

  it("accepts cleanup only when the exact owned shadow container is absent", () => {
    expect(assertNoStage4ShadowSeedContainers({
      containers: [{ name: "supabase_rest_hcg_123_abc", project: "hcg_123_abc" }],
      projectId: "hcg_123_abc",
    })).toBe(true);
    expect(() => assertNoStage4ShadowSeedContainers({
      containers: [{
        name: "homecook_stage4_seed_rest_hcg_123_abc",
        project: "hcg_123_abc",
      }],
      projectId: "hcg_123_abc",
    })).toThrow(/cleanup/u);
  });

  it("accepts cleanup only when the exact owned guarded Data API is absent", () => {
    expect(assertNoStage4GuardedDataContainers({
      containers: [{ name: "supabase_rest_hcg_123_abc", project: "hcg_123_abc" }],
      projectId: "hcg_123_abc",
    })).toBe(true);
    expect(() => assertNoStage4GuardedDataContainers({
      containers: [{
        name: "homecook_stage4_guarded_rest_hcg_123_abc",
        project: "hcg_123_abc",
      }],
      projectId: "hcg_123_abc",
    })).toThrow(/cleanup/u);
  });

  it("keeps normal demo seed targets unchanged unless both shadow values opt in", () => {
    const primary = {
      API_URL: "http://127.0.0.1:58101",
      SERVICE_ROLE_KEY: "primary-service-key",
    };

    expect(resolveLocalDemoSeedTargets({ env: {}, primary })).toEqual({
      auth: {
        serviceRoleKey: "primary-service-key",
        url: "http://127.0.0.1:58101",
      },
      data: {
        serviceRoleKey: "primary-service-key",
        url: "http://127.0.0.1:58101",
      },
      split: false,
    });

    expect(resolveLocalDemoSeedTargets({
      env: {
        HOMECOOK_LOCAL_SEED_DATA_API_SERVICE_ROLE_KEY: "shadow-database-key",
        HOMECOOK_LOCAL_SEED_DATA_API_URL: "http://127.0.0.1:4312",
      },
      primary,
    })).toEqual({
      auth: {
        serviceRoleKey: "primary-service-key",
        url: "http://127.0.0.1:58101",
      },
      data: {
        serviceRoleKey: "shadow-database-key",
        url: "http://127.0.0.1:4312",
      },
      split: true,
    });
  });

  it("rejects partial or non-loopback shadow target opt-in", () => {
    const primary = {
      API_URL: "http://127.0.0.1:58101",
      SERVICE_ROLE_KEY: "primary-service-key",
    };

    expect(() => resolveLocalDemoSeedTargets({
      env: { HOMECOOK_LOCAL_SEED_DATA_API_URL: "http://127.0.0.1:4312" },
      primary,
    })).toThrow(/both/u);
    expect(() => resolveLocalDemoSeedTargets({
      env: {
        HOMECOOK_LOCAL_SEED_DATA_API_SERVICE_ROLE_KEY: "shadow-service-key",
        HOMECOOK_LOCAL_SEED_DATA_API_URL: "https://remote.example.com",
      },
      primary,
    })).toThrow(/loopback/u);
  });

  it("routes only the split data client REST prefix directly to PostgREST", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const options = buildLocalDemoSeedClientOptions({
      directPostgrest: true,
      fetchImpl,
      url: "http://127.0.0.1:4312",
    });
    if (!("global" in options)) throw new Error("direct fetch was not configured");

    await options.global.fetch(
      "http://127.0.0.1:4312/rest/v1/users?select=id",
      { method: "GET" },
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4312/users?select=id",
      { method: "GET" },
    );
    expect(buildLocalDemoSeedClientOptions({
      directPostgrest: false,
      fetchImpl,
      url: "http://127.0.0.1:58101",
    })).not.toHaveProperty("global");
  });

  it("removes the shadow API before probing the unchanged primary guard", async () => {
    const order: string[] = [];
    const state = {
      negative_probe_passed: false,
      primary_guard_unchanged: false,
      shadow_seed_api_removed: false,
      shadow_seed_api_used: false,
    };

    await runStage4ShadowSeedLifecycle({
      assertShadowRemoved: async () => order.push("assert-shadow-removed"),
      negativeProbe: async () => order.push("negative-probe"),
      onPhase: (phase: string) => order.push(phase),
      removeShadow: async () => order.push("remove-shadow"),
      seed: async () => order.push("seed"),
      startShadow: async () => order.push("start-shadow"),
      state,
      verifyPrimaryGuard: async () => {
        order.push("verify-primary-guard");
        return "pgrst.db_pre_request=public.verify_hybrid_request_authority_pre_request";
      },
      verifyPrimaryAuthHealth: async () => order.push("verify-primary-auth-health"),
      waitShadow: async () => order.push("wait-shadow"),
    });

    expect(order).toEqual([
      "verify-primary-guard",
      "primary-guard-baseline-verified",
      "start-shadow",
      "shadow-seed-api-started",
      "wait-shadow",
      "shadow-seed-api-ready",
      "demo-seed-begin",
      "seed",
      "demo-seed-complete",
      "remove-shadow",
      "assert-shadow-removed",
      "shadow-seed-api-removed",
      "verify-primary-guard",
      "primary-guard-unchanged",
      "verify-primary-auth-health",
      "primary-auth-health-after-shadow",
      "negative-probe-begin",
      "negative-probe",
      "negative-probe-pass",
    ]);
    expect(state).toEqual({
      negative_probe_passed: true,
      primary_guard_unchanged: true,
      shadow_seed_api_removed: true,
      shadow_seed_api_used: true,
    });
  });

  it("removes the shadow API and verifies primary safety when seeding fails", async () => {
    const order: string[] = [];
    const seedFailure = new Error("seed failed without raw secrets");
    const state = {
      negative_probe_passed: false,
      primary_guard_unchanged: false,
      shadow_seed_api_removed: false,
      shadow_seed_api_used: false,
    };

    await expect(runStage4ShadowSeedLifecycle({
      assertShadowRemoved: async () => order.push("assert-shadow-removed"),
      negativeProbe: async () => order.push("negative-probe"),
      removeShadow: async () => order.push("remove-shadow"),
      seed: async () => {
        order.push("seed");
        throw seedFailure;
      },
      startShadow: async () => order.push("start-shadow"),
      state,
      verifyPrimaryGuard: async () => "pgrst.db_pre_request=public.verify_hybrid_request_authority_pre_request",
      verifyPrimaryAuthHealth: async () => order.push("verify-primary-auth-health"),
      waitShadow: async () => order.push("wait-shadow"),
    })).rejects.toBe(seedFailure);

    expect(order).toEqual([
      "start-shadow",
      "wait-shadow",
      "seed",
      "remove-shadow",
      "assert-shadow-removed",
      "verify-primary-auth-health",
      "negative-probe",
    ]);
    expect(state).toEqual({
      negative_probe_passed: true,
      primary_guard_unchanged: true,
      shadow_seed_api_removed: true,
      shadow_seed_api_used: true,
    });
  });
});
