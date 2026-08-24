import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RUNTIME_SUPABASE_CLI_PACKAGE,
  SECURITY_SUPABASE_CLI_PACKAGE,
  assertNoDockerOomInventory,
  assertOwnedDockerResourceInventory,
  buildIsolatedDataApiContainerArgs,
  buildIsolatedSupabaseConfig,
  buildIsolatedSupabaseStartArgs,
  buildSupabaseCliArgs,
  createIsolatedSupabaseProject,
  readPinnedLocalDockerTarget,
  resolvePinnedLocalDockerTarget,
} from "../scripts/lib/local-supabase-isolated-runtime.mjs";
import packageJson from "../package.json";

const tempRoots: string[] = [];

const SOURCE_CONFIG = `
project_id = "homecook"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]

[db]
port = 54322
shadow_port = 54320
major_version = 17

[studio]
enabled = true
port = 54323

[inbucket]
enabled = true
port = 54324
smtp_port = 54325
pop3_port = 54326

[storage]
enabled = true

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
`;

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function createRepositoryFixture() {
  const root = mkdtempSync(join(tmpdir(), "homecook-isolated-runtime-fixture-"));
  tempRoots.push(root);
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(root, "supabase", "config.toml"), SOURCE_CONFIG);
  writeFileSync(
    join(root, "supabase", "migrations", "20260813000000_fixture.sql"),
    "select 1;\n",
  );
  writeFileSync(join(root, "supabase", "seed.sql"), "select 2;\n");
  return root;
}

describe("isolated local Supabase gates", () => {
  it("pins the exact CLI and replaces every unisolated Stage 1 command", () => {
    expect(SECURITY_SUPABASE_CLI_PACKAGE).toBe("supabase@2.110.0");
    expect(RUNTIME_SUPABASE_CLI_PACKAGE).toBe("supabase@2.110.0");
    expect(packageJson.scripts["verify:security-functions:isolated"]).toBe(
      "node scripts/run-isolated-security-function-gate.mjs",
    );
    expect(packageJson.scripts["verify:security-functions:release"]).toBe(
      "pnpm verify:security-functions:isolated",
    );
    expect(packageJson.scripts["verify:local-supabase-runtime:isolated"]).toBe(
      "node scripts/run-isolated-local-supabase-runtime-gate.mjs",
    );

    const automation = readFileSync(
      "docs/workpacks/youtube-async-extraction-notification/automation-spec.json",
      "utf8",
    );
    expect(automation).toContain("pnpm verify:local-supabase-runtime:isolated");
    expect(automation).not.toContain('"pnpm local:reset:demo"');
  });

  it("uses a unique project id, dynamic non-production ports, and isolated auth env names", () => {
    const config = buildIsolatedSupabaseConfig(SOURCE_CONFIG, {
      projectId: "hcg_1234_abcd",
      basePort: 58320,
    });

    expect(config).toContain('project_id = "hcg_1234_abcd"');
    for (const port of [58320, 58321, 58322, 58323, 58324, 58325, 58326, 58327]) {
      expect(config).toContain(String(port));
    }
    for (const productionPort of [54320, 54321, 54322, 54323, 54324, 54325, 54326]) {
      expect(config).not.toContain(String(productionPort));
    }
    expect(config).toContain('client_id = "env(HOMECOOK_ISOLATED_GOOGLE_CLIENT_ID)"');
    expect(config).toContain('secret = "env(HOMECOOK_ISOLATED_GOOGLE_CLIENT_SECRET)"');
    expect(config).not.toContain("SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET");
  });

  it("builds only pinned local CLI invocations in the temporary workdir", () => {
    expect(buildSupabaseCliArgs(["--version"], { workdir: "/tmp/hcg" })).toEqual([
      "dlx",
      "supabase@2.110.0",
      "--version",
      "--workdir",
      "/tmp/hcg",
    ]);

    const startArgs = buildIsolatedSupabaseStartArgs("/tmp/hcg", {
      services: ["gotrue", "kong", "postgrest"],
    });
    expect(startArgs).toEqual(expect.arrayContaining([
      "dlx",
      "supabase@2.110.0",
      "start",
      "--workdir",
      "/tmp/hcg",
    ]));
    expect(startArgs.join(" ")).not.toMatch(/--linked|\blink\b|db push/iu);

    expect(buildIsolatedDataApiContainerArgs({
      containerName: "homecook_gate_rest_hcg_1234_abcd",
      environmentFilePath: "/tmp/hcg/data-api.env",
      networkId: "network-a",
      port: 58327,
      projectId: "hcg_1234_abcd",
    })).toEqual(expect.arrayContaining([
      "run",
      "--detach",
      "--label",
      "com.docker.compose.project=hcg_1234_abcd",
      "--network",
      "network-a",
      "--publish",
      "127.0.0.1:58327:3000",
      "--env-file",
      "/tmp/hcg/data-api.env",
      "public.ecr.aws/supabase/postgrest:v14.10",
    ]));
  });

  it("creates 0600 isolated env and secret files without inheriting production credentials", async () => {
    const repositoryRoot = createRepositoryFixture();
    const isolated = await createIsolatedSupabaseProject(repositoryRoot);

    try {
      expect(isolated.rootDir).not.toContain(repositoryRoot);
      expect(isolated.projectId).toMatch(/^hcg_[a-z0-9_]+$/u);
      expect(statSync(isolated.environmentFilePath).mode & 0o777).toBe(0o600);
      expect(statSync(isolated.secretFilePath).mode & 0o777).toBe(0o600);
      expect(statSync(isolated.dataApiEnvironmentFilePath).mode & 0o777).toBe(0o600);

      const envFile = readFileSync(isolated.environmentFilePath, "utf8");
      const secret = readFileSync(isolated.secretFilePath, "utf8").trim();
      const isolatedSeed = readFileSync(
        join(isolated.rootDir, "supabase", "seed.sql"),
        "utf8",
      );
      const dataApiEnv = readFileSync(isolated.dataApiEnvironmentFilePath, "utf8");
      expect(envFile).toContain("HOMECOOK_ISOLATED_GOOGLE_CLIENT_ID=");
      expect(envFile).toContain("HOMECOOK_ISOLATED_GOOGLE_CLIENT_SECRET_FILE=");
      expect(envFile).not.toContain(secret);
      expect(isolatedSeed).toBe("select 2;\n");
      expect(dataApiEnv).toContain(isolated.dataApiJwtSecret);
      expect(dataApiEnv).toContain(`supabase_db_${isolated.projectId}`);
      expect(envFile).not.toContain(isolated.dataApiJwtSecret);
      expect(readdirSync(join(isolated.rootDir, "supabase", "migrations")))
        .not.toContain("00000000000000_homecook_isolated_gate.sql");
      expect(readFileSync(join(repositoryRoot, "supabase", "seed.sql"), "utf8"))
        .toBe("select 2;\n");

      const commandEnv = await isolated.buildCommandEnv({
        PATH: "/usr/bin",
        HOME: "/tmp/homecook-test-home",
        DOCKER_HOST: "ssh://root@remote.example/run/docker.sock",
        DOCKER_CONTEXT: "production",
        SUPABASE_ACCESS_TOKEN: "forbidden-access-token",
        SUPABASE_DB_PASSWORD: "forbidden-db-password",
        SECURITY_FUNCTION_LINKED_ROOT: "/forbidden/linked-root",
        NEXT_PUBLIC_SUPABASE_URL: "https://forbidden-project.supabase.co",
        SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET: "production-google-secret",
      }, { dockerHost: "unix:///tmp/docker.sock" });

      expect(commandEnv).toMatchObject({
        PATH: "/usr/bin",
        HOME: "/tmp/homecook-test-home",
        DOCKER_HOST: "unix:///tmp/docker.sock",
      });
      expect(commandEnv.HOMECOOK_ISOLATED_GOOGLE_CLIENT_SECRET).toBe(secret);
      expect(commandEnv).not.toHaveProperty("DOCKER_CONTEXT");
      expect(commandEnv).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
      expect(commandEnv).not.toHaveProperty("SUPABASE_DB_PASSWORD");
      expect(commandEnv).not.toHaveProperty("SECURITY_FUNCTION_LINKED_ROOT");
      expect(commandEnv).not.toHaveProperty("NEXT_PUBLIC_SUPABASE_URL");
      expect(commandEnv).not.toHaveProperty(
        "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET",
      );

      const expectedMigrationSha = createHash("sha256")
        .update("20260813000000_fixture.sql\0select 1;\n")
        .digest("hex");
      expect(isolated.migrationSha256).toBe(expectedMigrationSha);
    } finally {
      await isolated.removeFiles();
    }
  });

  it("pins only an exact local unix Docker endpoint", () => {
    expect(resolvePinnedLocalDockerTarget({
      ambient: { DOCKER_HOST: "unix:///Users/test/.docker/run/docker.sock" },
    })).toEqual({
      context_name: null,
      docker_host: "unix:///Users/test/.docker/run/docker.sock",
      source: "ambient-host",
    });

    for (const dockerHost of [
      "",
      "ssh://root@remote.example/run/docker.sock",
      "tcp://127.0.0.1:2375",
      "http://127.0.0.1:2375",
      "https://remote.example:2376",
      "unix://",
      "not-a-docker-endpoint",
    ]) {
      expect(() => resolvePinnedLocalDockerTarget({
        ambient: { DOCKER_HOST: dockerHost },
      }), dockerHost).toThrow(/local Docker target/iu);
    }
    expect(() => resolvePinnedLocalDockerTarget({
      ambient: {
        DOCKER_CONTEXT: "desktop-linux",
        DOCKER_HOST: "unix:///var/run/docker.sock",
      },
    })).toThrow(/ambiguous/iu);
  });

  it("rejects remote active Docker contexts and pins a local inspected context", () => {
    const remoteContext = [{
      Endpoints: { docker: { Host: "ssh://root@remote.example" } },
      Name: "production",
    }];
    expect(() => resolvePinnedLocalDockerTarget({
      activeContextName: "production",
      ambient: {},
      inspectedContexts: remoteContext,
    })).toThrow(/local Docker target/iu);
    expect(resolvePinnedLocalDockerTarget({
      activeContextName: "desktop-linux",
      ambient: {},
      inspectedContexts: [{
        Endpoints: {
          docker: { Host: "unix:///Users/test/.docker/run/docker.sock" },
        },
        Name: "desktop-linux",
      }],
    })).toEqual({
      context_name: "desktop-linux",
      docker_host: "unix:///Users/test/.docker/run/docker.sock",
      source: "context",
    });
    expect(() => resolvePinnedLocalDockerTarget({
      activeContextName: "",
      ambient: {},
      inspectedContexts: [],
    })).toThrow(/local Docker target/iu);
  });

  it("reads context metadata without contacting a daemon and returns only a safe target", () => {
    const calls: string[][] = [];
    const spawnSyncImpl = (_command: string, args: string[]) => {
      calls.push(args);
      if (args[1] === "show") {
        return { status: 0, stdout: "desktop-linux\n" };
      }
      return {
        status: 0,
        stdout: JSON.stringify([{
          Endpoints: {
            docker: { Host: "unix:///Users/test/.docker/run/docker.sock" },
          },
          Name: "desktop-linux",
        }]),
      };
    };

    expect(readPinnedLocalDockerTarget({ ambient: {}, spawnSyncImpl })).toEqual({
      context_name: "desktop-linux",
      docker_host: "unix:///Users/test/.docker/run/docker.sock",
      source: "context",
    });
    expect(calls).toEqual([
      ["context", "show"],
      ["context", "inspect", "desktop-linux"],
    ]);
  });

  it("accepts only Docker resources labeled for the unique isolated project", () => {
    expect(assertOwnedDockerResourceInventory({
      containers: [{ id: "container-a", project: "hcg_1234_abcd" }],
      networks: [{ id: "network-a", project: "hcg_1234_abcd" }],
      volumes: [{ id: "volume-a", project: "hcg_1234_abcd" }],
    }, "hcg_1234_abcd")).toEqual({
      containers: 1,
      networks: 1,
      volumes: 1,
    });

    expect(() => assertOwnedDockerResourceInventory({
      containers: [{ id: "production", project: "homecook" }],
      networks: [{ id: "network-a", project: "hcg_1234_abcd" }],
      volumes: [{ id: "volume-a", project: "hcg_1234_abcd" }],
    }, "hcg_1234_abcd")).toThrow(/production.*homecook/iu);

    expect(() => assertNoDockerOomInventory({
      containers: [{ id: "rest", project: "hcg_1234_abcd", oomKilled: true }],
      networks: [],
      volumes: [],
    }, "hcg_1234_abcd")).toThrow(/rest.*OOM/iu);
  });

  it("keeps PostgreSQL inventory/checksum and exact Data API denial in one isolated lifecycle", () => {
    const securityRunner = readFileSync(
      "scripts/run-isolated-security-function-gate.mjs",
      "utf8",
    );
    const runtimeRunner = readFileSync(
      "scripts/run-isolated-local-supabase-runtime-gate.mjs",
      "utf8",
    );

    expect(securityRunner).toContain('runPackageScript("verify:security-functions"');
    expect(securityRunner).toContain(
      'runPackageScript("verify:security-functions:data-api"',
    );
    expect(securityRunner).toContain("waitForIsolatedDataApi");
    expect(securityRunner).toContain("assertNoIsolatedDockerResources");
    expect(securityRunner).not.toContain("withLocalGoogleOAuthEnv");
    expect(securityRunner).not.toContain("process.env,");
    expect(runtimeRunner).toContain("services: []");

    for (const source of [securityRunner, runtimeRunner]) {
      expect(source.indexOf("readPinnedLocalDockerTarget({"))
        .toBeLessThan(source.indexOf("await ensureDockerRunning({"));
      expect(source.indexOf("await ensureDockerRunning({"))
        .toBeLessThan(source.indexOf("createIsolatedSupabaseProject("));
      expect(source).toContain("DOCKER_HOST: dockerTarget.docker_host");
      expect(source).toContain("delete pinnedDockerEnv.DOCKER_CONTEXT");
      expect(source).toContain("delete pinnedDockerEnv.DOCKER_CERT_PATH");
      expect(source).toContain("delete pinnedDockerEnv.DOCKER_TLS_VERIFY");
      expect(source).toContain("{ dockerHost: dockerTarget.docker_host }");
      expect(source).toContain("assertOwnedDockerResources");
      expect(source).toContain("assertNoIsolatedDockerOom");
      expect(source).toContain("timeoutMs: 300_000");
      expect(source).toContain("removeIsolatedDockerResources");
      expect(source).toContain("startIsolatedDataApi");
      expect(source).toContain("isolated.buildCommandEnv");
      expect(source).toContain('buildSupabaseCliArgs(["stop", "--no-backup"]');
      expect(source).toContain("isolated cleanup failed");
      expect(source).not.toMatch(
        /SECURITY_FUNCTION_LINKED_ROOT|SUPABASE_ACCESS_TOKEN|\.supabase\.co|local:reset:demo/iu,
      );
    }
  });

  it("records only the final frozen plan provenance in the active workpack", () => {
    const readme = readFileSync(
      "docs/workpacks/youtube-async-extraction-notification/README.md",
      "utf8",
    );

    expect(readme).toContain(
      "7906f9ec975f309c310b2275714873cebb78e109770f885f09878e5c6bbed57a",
    );
    expect(readme).toContain("991 lines");
    expect(readme).toContain("019ffb44-5614-7af3-86a9-4ebd50977123");
    expect(readme).not.toContain(
      "b560b60ff758171e1d52ad56b2a63a2e1877cd762d1f691c9cea32c753f8d332",
    );
    expect(readme).not.toContain("873 lines");
  });
});
