import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertAuthOnlyPublicRouteContract,
  authOnlyUpstreamTarget,
} from "../infra/full-local-supabase/auth-only-proxy.mjs";

import {
  FULL_LOCAL_SECRET_NAMES,
  assertFullLocalComposeModel,
  assertNoSecretLeakage,
  assertSecretRotationAllowed,
  fullLocalImageRefsForPlatform,
  generateFullLocalSecretBundle,
  materializeFullLocalSecrets,
  summarizeFullLocalRuntimeStates,
  validateExternalSecretDirectory,
  validateFullLocalProductionConfig,
  validateFullLocalSecretFiles,
  validateLoopbackS3Endpoint,
} from "../scripts/lib/full-local-production-runtime.mjs";

function validConfig(overrides: Record<string, string> = {}) {
  const images = fullLocalImageRefsForPlatform("linux/arm64");
  return {
    FULL_LOCAL_ADDITIONAL_REDIRECT_URLS:
      "https://app.mumeok.kr/auth/callback,https://app.mumeok.kr/auth/link/callback",
    FULL_LOCAL_API_EXTERNAL_URL: "https://auth.mumeok.kr/auth/v1",
    FULL_LOCAL_AUTH_IMAGE: images.auth,
    FULL_LOCAL_AUTH_PROXY_PORT: "54482",
    FULL_LOCAL_COMPOSE_PROJECT_NAME: "homecook-full-local-isolated",
    FULL_LOCAL_DOCKER_PLATFORM: "linux/arm64",
    FULL_LOCAL_ENABLE_ANONYMOUS_USERS: "false",
    FULL_LOCAL_ENABLE_EMAIL_AUTOCONFIRM: "false",
    FULL_LOCAL_ENABLE_EMAIL_SIGNUP: "false",
    FULL_LOCAL_ENABLE_PHONE_SIGNUP: "false",
    FULL_LOCAL_INTERNAL_GATEWAY_PORT: "54481",
    FULL_LOCAL_INTERNAL_GATEWAY_URL: "http://127.0.0.1:54481",
    FULL_LOCAL_INTERNAL_S3_URL:
      "http://127.0.0.1:54481/storage/v1/s3",
    FULL_LOCAL_KONG_IMAGE: images.kong,
    FULL_LOCAL_NODE_IMAGE: images.node,
    FULL_LOCAL_POSTGRES_IMAGE: images.postgres,
    FULL_LOCAL_POSTGRES_VOLUME_NAME: "homecook-full-local-test-postgres",
    FULL_LOCAL_POSTGREST_IMAGE: images.postgrest,
    FULL_LOCAL_PUBLIC_AUTH_URL: "https://auth.mumeok.kr",
    FULL_LOCAL_SITE_URL: "https://app.mumeok.kr",
    FULL_LOCAL_STORAGE_IMAGE: images.storage,
    FULL_LOCAL_STORAGE_VOLUME_NAME: "homecook-full-local-test-storage",
    FULL_LOCAL_STORAGE_REGION: "homecook-local-1",
    ...overrides,
  };
}

function validSecrets() {
  return Object.fromEntries(
    FULL_LOCAL_SECRET_NAMES.map((name, index) => [
      name,
      name === "jwt_keys"
        ? JSON.stringify({ keys: [{ d: `private-${index}`, kid: "local-es256" }] })
        : name === "jwt_jwks"
          ? JSON.stringify({ keys: [{ kid: "local-es256", kty: "EC" }] })
          : `${name}-value-that-is-unique-and-at-least-32-bytes-${index}`,
    ]),
  );
}

describe("full-local production runtime static contract", () => {
  it.each([
    ["GET", "/auth/v1/health", true],
    ["POST", "/auth/v1/token?grant_type=refresh_token", true],
    ["OPTIONS", "/auth/v1/callback/", true],
    ["HEAD", "/rest/v1/", false],
    ["POST", "/rest/v1/rpc/private_operation?probe=1", false],
    ["DELETE", "/storage/v1/object/private/a", false],
    ["GET", "/studio/", false],
    ["GET", "/health", false],
    ["GET", "/auth//v1/health", false],
    ["GET", "/auth/v1//health", false],
    ["GET", "/auth/v1/../../rest/v1/", false],
    ["GET", "/auth/v1/../storage/v1/", false],
    ["GET", "/auth%2fv1/health", false],
    ["GET", "/%73torage/v1/object/a", false],
    ["GET", "//postgrest:3000/rest/v1/", false],
    ["GET", "/rest/v1/?next=/auth/v1/health", false],
    ["GET", "/auth/v1", false],
  ])("applies the Auth-only public route to %s %s", (method, url, allowed) => {
    expect(authOnlyUpstreamTarget({ method, url }) !== null).toBe(allowed);
  });

  it("rejects equality, regex, Set, and encoded-storage route mutations", () => {
    const canonical = ({ url }: { url?: string }) =>
      typeof url === "string" && url.startsWith("/auth/v1/");
    const equalityMutation = ({ url }: { url?: string }) =>
      canonical({ url }) || url === "/rest/v1/";
    const regexMutation = ({ url }: { url?: string }) =>
      canonical({ url }) || /^\/rest\/v1\//u.test(url ?? "");
    const exposed = new Set(["/rest/v1/", "/storage/v1/"]);
    const setMutation = ({ url }: { url?: string }) =>
      canonical({ url }) || exposed.has(url ?? "");
    const encodedStorageMutation = ({ url }: { url?: string }) =>
      canonical({ url }) || url === "/%73torage/v1/object/a";

    expect(() => assertAuthOnlyPublicRouteContract(equalityMutation)).toThrow();
    expect(() => assertAuthOnlyPublicRouteContract(regexMutation)).toThrow();
    expect(() => assertAuthOnlyPublicRouteContract(setMutation)).toThrow();
    expect(() =>
      assertAuthOnlyPublicRouteContract(encodedStorageMutation),
    ).toThrow();
  });

  it("pins the reviewed arm64 runtime images by RepoDigest", () => {
    const images = fullLocalImageRefsForPlatform("linux/arm64");

    expect(images).toEqual({
      auth:
        "supabase/gotrue@sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf",
      kong:
        "kong/kong@sha256:6addf50e6bd8d578314cb9ce4f2d2d1e3781d2edecef59f707e00c6e05d384f5",
      node:
        "docker.io/library/node@sha256:74e144386aaec923ce092c3371b351d96c4f977a4ac3f58431fa9164b9399534",
      postgres:
        "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a",
      postgrest:
        "postgrest/postgrest@sha256:844785450d6b046ee97f1c67ea37e3ff6b4ed7ee3570b1b91c03f66f032c4805",
      storage:
        "supabase/storage-api@sha256:9326eb9c6b74c0a5ba393ab46a08a51d16bc5ea5f2978fc5b0f17fc67c64a4de",
    });
  });

  it("keeps raw services private and publishes only two loopback gateways", () => {
    expect(
      assertFullLocalComposeModel({
        services: {
          auth: {},
          "auth-proxy": {
            ports: [{ host_ip: "127.0.0.1", published: "54482", target: 8080 }],
          },
          "api-gateway": {
            ports: [{ host_ip: "127.0.0.1", published: "54481", target: 54481 }],
          },
          postgres: {},
          postgrest: {},
          storage: {},
        },
      }),
    ).toBe(true);

    expect(() =>
      assertFullLocalComposeModel({
        services: {
          auth: {},
          "auth-proxy": {
            ports: [{ host_ip: "0.0.0.0", published: "54482", target: 8080 }],
          },
          "api-gateway": {
            ports: [{ host_ip: "127.0.0.1", published: "54481", target: 54481 }],
          },
          postgres: {},
          postgrest: {},
          storage: {
            ports: [{ host_ip: "127.0.0.1", published: "5000", target: 5000 }],
          },
        },
      }),
    ).toThrow(/loopback|raw service|storage/iu);

    for (const rawService of ["postgres", "postgrest", "storage", "studio"]) {
      expect(() =>
        assertFullLocalComposeModel({
          services: {
            auth: {},
            "auth-proxy": { ports: ["127.0.0.1:54482:8080"] },
            "api-gateway": { ports: ["127.0.0.1:54481:8000"] },
            postgres: {},
            postgrest: {},
            storage: {},
            studio: {},
            [rawService]: { ports: ["127.0.0.1:59999:59999"] },
          },
        }),
      ).toThrow(/raw service/iu);
    }
  });

  it("defines ordered health, read-only secrets, social-only auth, and S3 isolation", () => {
    const compose = readFileSync(
      "infra/full-local-supabase/docker-compose.production.yml",
      "utf8",
    );
    const oauthCompose = readFileSync(
      "infra/full-local-supabase/docker-compose.oauth.production.yml",
      "utf8",
    );
    const proxy = readFileSync(
      "infra/full-local-supabase/auth-only-proxy.mjs",
      "utf8",
    );
    const runtimeCli = readFileSync(
      "scripts/full-local-production-runtime.mjs",
      "utf8",
    );
    const kong = readFileSync(
      "infra/full-local-supabase/kong.yml",
      "utf8",
    );
    const attestationPlugin = readFileSync(
      "infra/full-local-supabase/kong/plugins/homecook-attestation/handler.lua",
      "utf8",
    );
    const roleBootstrap = readFileSync(
      "infra/full-local-supabase/full-local-role-passwords.sh",
      "utf8",
    );

    for (const image of Object.values(fullLocalImageRefsForPlatform("linux/arm64"))) {
      expect(compose).toContain(image);
    }
    expect(compose).toMatch(
      /auth:[\s\S]*postgres:[\s\S]*condition:\s*service_healthy/u,
    );
    expect(compose).toMatch(
      /postgrest:[\s\S]*auth:[\s\S]*condition:\s*service_healthy/u,
    );
    expect(compose).toMatch(
      /storage:[\s\S]*auth:[\s\S]*condition:\s*service_healthy/u,
    );
    expect(compose).toMatch(
      /api-gateway:[\s\S]*storage:[\s\S]*condition:\s*service_healthy/u,
    );
    expect(compose).toContain("GOTRUE_EXTERNAL_EMAIL_ENABLED=false");
    expect(compose).toContain("GOTRUE_EXTERNAL_PHONE_ENABLED=false");
    expect(compose).toContain("GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false");
    expect(compose).toContain("REGION=FULL_LOCAL_STORAGE_REGION");
    expect(compose).toContain(
      "STORAGE_PUBLIC_URL: ${FULL_LOCAL_INTERNAL_GATEWAY_URL:?FULL_LOCAL_INTERNAL_GATEWAY_URL is required}/storage/v1",
    );
    expect(compose).toContain('REQUEST_ALLOW_X_FORWARDED_PATH: "true"');
    expect(compose).toContain("S3_PROTOCOL_ACCESS_KEY_ID=storage_s3_access_key_id");
    expect(compose).toContain(
      "S3_PROTOCOL_ACCESS_KEY_SECRET=storage_s3_access_key_secret",
    );
    expect(kong).toMatch(
      /name:\s*storage-v1-all[\s\S]*?preserve_host:\s*true[\s\S]*?strip_path:\s*true/u,
    );
    expect(kong).toMatch(
      /name:\s*storage-v1-s3[\s\S]*?url:\s*http:\/\/storage:5000\/[\s\S]*?headers:[\s\S]*?authorization:[\s\S]*?AWS4-HMAC-SHA256[\s\S]*?paths:[\s\S]*?- \/storage\/v1[\s\S]*?plugins:[\s\S]*?- name: cors/u,
    );
    expect(kong).not.toContain('"X-Forwarded-Port: $FULL_LOCAL_INTERNAL_GATEWAY_PORT"');
    expect(kong).toContain("- /storage/v1");
    expect(kong).not.toMatch(/^\s*- \/storage\/v1\/$/mu);
    expect(compose).toContain("/run/secrets");
    expect(compose).not.toContain("/var/run/docker.sock");
    expect(compose).toContain('KONG_PROXY_ACCESS_LOG: "off"');
    expect(compose).toContain(
      "KONG_NGINX_MAIN_ENV: HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1",
    );
    expect(compose).toMatch(
      /api-gateway:[\s\S]*session_attestation_hmac_key_v1/u,
    );
    expect(kong).toContain("homecook-attestation");
    expect(attestationPlugin).toContain("x-homecook-attestation-verified");
    expect(attestationPlugin).toContain("x-homecook-session-attestation-signature");
    expect(attestationPlugin).toContain('require "resty.hmac"');
    expect(attestationPlugin).toContain("secure_equal");
    expect(attestationPlugin).toContain("kong.service.request.clear_header");
    expect(roleBootstrap).not.toContain(
      "app.settings.homecook_session_attestation_hmac_key",
    );
    expect(compose).not.toContain("KONG_PROXY_ACCESS_LOG: /dev/stdout combined");
    expect(proxy).toContain("authOnlyUpstreamTarget(request, upstream)");
    expect(proxy).toContain("FULL_LOCAL_INTERNAL_GATEWAY_ORIGIN");
    expect(proxy).toContain('"forwarded"');
    expect(proxy).toContain('"x-forwarded-for"');
    expect(proxy).toContain("isIP(cloudflareClientIp)");
    expect(proxy).toContain("isLoopbackAddress(peerAddress)");
    expect(proxy).toContain('headers.set("x-forwarded-for", verifiedClientIp)');
    expect(proxy).toContain('headers.set("cache-control", "no-store, max-age=0")');
    expect(runtimeCli).toContain("homecook_storage_url_references");
    expect(runtimeCli).not.toContain("like ('%' || storage_object.name)");
    expect(proxy).toContain("headers.delete(name)");
    expect(proxy).toContain("FULL_LOCAL_PUBLIC_AUTH_URL");
    expect(proxy).not.toContain('headers.set("x-forwarded-host", "auth.mumeok.kr")');
    expect(oauthCompose).toContain('GOTRUE_EXTERNAL_GOOGLE_ENABLED: "true"');
    expect(oauthCompose).toContain('GOTRUE_EXTERNAL_KAKAO_ENABLED: "true"');
    expect(oauthCompose).toContain("GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=google_client_id");
    expect(oauthCompose).toContain("GOTRUE_EXTERNAL_KAKAO_SECRET=kakao_client_secret");
    expect(oauthCompose).not.toContain("/run/secrets");
    expect(oauthCompose).not.toContain("homecook-full-local-oauth-providers-v1");
  });
});

describe("full-local production configuration", () => {
  it("exposes a cutover CLI that fails closed without complete Storage backup evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "full-local-cutover-preflight-"));
    const evidencePath = join(root, "evidence.json");
    writeFileSync(evidencePath, JSON.stringify({
      complete_storage_backup_verified: false,
      off_mac_restore_count: 2,
      provider_callback_verified: true,
      remote_outstanding_flows: 0,
      restore_replay_verified: true,
      storage_verified: true,
      temporary_hosted_s3_credential_revoked: true,
    }), { encoding: "utf8", mode: 0o600 });
    chmodSync(evidencePath, 0o600);

    try {
      const result = spawnSync(process.execPath, [
        "scripts/full-local-production-runtime.mjs",
        "cutover-preflight",
        "--evidence",
        evidencePath,
        "--confirm-first-local-auth-mutation",
        "APPROVE_FIRST_LOCAL_PRODUCTION_AUTH_MUTATION",
      ], { cwd: process.cwd(), encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("complete-storage-backup-verification-missing");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("accepts exact HTTPS public URLs and loopback-only internal URLs", () => {
    expect(
      validateFullLocalProductionConfig({
        config: validConfig(),
        configFileMode: 0o600,
        secretDirectoryMode: 0o700,
        secrets: validSecrets(),
      }),
    ).toMatchObject({
      authProxyPort: 54482,
      dockerPlatform: "linux/arm64",
      internalGatewayPort: 54481,
      publicAuthOrigin: "https://auth.mumeok.kr",
      secretCount: FULL_LOCAL_SECRET_NAMES.length,
    });
  });

  it.each([
    ["FULL_LOCAL_PUBLIC_AUTH_URL", "http://auth.mumeok.kr"],
    ["FULL_LOCAL_API_EXTERNAL_URL", "https://auth.mumeok.kr/not-auth"],
    ["FULL_LOCAL_INTERNAL_GATEWAY_URL", "http://192.168.0.36:54481"],
    ["FULL_LOCAL_INTERNAL_S3_URL", "http://storage:5000/storage/v1/s3"],
  ])("rejects unsafe URL config %s", (name, value) => {
    expect(() =>
      validateFullLocalProductionConfig({
        config: validConfig({ [name]: value }),
        configFileMode: 0o600,
        secretDirectoryMode: 0o700,
        secrets: validSecrets(),
      }),
    ).toThrow(/HTTPS|loopback|auth\/v1|storage\/v1\/s3/iu);
  });

  it.each([
    "FULL_LOCAL_ENABLE_EMAIL_SIGNUP",
    "FULL_LOCAL_ENABLE_EMAIL_AUTOCONFIRM",
    "FULL_LOCAL_ENABLE_PHONE_SIGNUP",
    "FULL_LOCAL_ENABLE_ANONYMOUS_USERS",
  ])("rejects a non-social production auth surface: %s", (name) => {
    expect(() =>
      validateFullLocalProductionConfig({
        config: validConfig({ [name]: "true" }),
        configFileMode: 0o600,
        secretDirectoryMode: 0o700,
        secrets: validSecrets(),
      }),
    ).toThrow(/social-only|disabled/iu);
  });

  it("rejects missing, reused, or placeholder secret material", () => {
    const secrets = validSecrets();
    secrets.service_role_key = secrets.postgres_password;

    expect(() =>
      validateFullLocalProductionConfig({
        config: validConfig(),
        configFileMode: 0o600,
        secretDirectoryMode: 0o700,
        secrets,
      }),
    ).toThrow(/unique|secret/iu);
  });

  it("accepts only the exact internal loopback S3 endpoint", () => {
    expect(
      validateLoopbackS3Endpoint(
        "http://127.0.0.1:54481/storage/v1/s3",
        54481,
      ),
    ).toBe("http://127.0.0.1:54481/storage/v1/s3");
    expect(() =>
      validateLoopbackS3Endpoint(
        "https://auth.mumeok.kr/storage/v1/s3",
        54481,
      ),
    ).toThrow(/loopback/iu);
  });
});

describe("full-local secret delivery", () => {
  it("requires the materialized secret directory to stay outside the repository", () => {
    const repositoryRoot = "/Users/example/homecook";

    expect(
      validateExternalSecretDirectory({
        repositoryRoot,
        secretDirectory: "/Users/example/.homecook/full-local-secrets",
      }),
    ).toBe("/Users/example/.homecook/full-local-secrets");
    expect(() =>
      validateExternalSecretDirectory({
        repositoryRoot,
        secretDirectory: "/Users/example/homecook/.runtime-secrets",
      }),
    ).toThrow(/outside.*repository/iu);
    expect(() =>
      validateExternalSecretDirectory({
        repositoryRoot,
        secretDirectory: repositoryRoot,
      }),
    ).toThrow(/outside.*repository/iu);
  });

  it("rejects an external-looking symlink that resolves inside the repository", () => {
    const root = mkdtempSync(join(tmpdir(), "full-local-secret-link-"));
    const repositoryRoot = join(root, "repository");
    const repositorySecretDirectory = join(repositoryRoot, "runtime-secrets");
    const externalLink = join(root, "external-secrets");
    mkdirSync(repositorySecretDirectory, { recursive: true });
    symlinkSync(repositorySecretDirectory, externalLink, "dir");

    try {
      expect(() =>
        validateExternalSecretDirectory({
          repositoryRoot,
          secretDirectory: externalLink,
        }),
      ).toThrow(/outside.*repository/iu);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("blocks secret replacement once the persistent PostgreSQL volume exists", () => {
    expect(
      assertSecretRotationAllowed({
        postgresVolumeExists: false,
        replace: true,
      }),
    ).toBe(true);
    expect(() =>
      assertSecretRotationAllowed({
        postgresVolumeExists: true,
        replace: true,
      }),
    ).toThrow(/PostgreSQL volume|rotation runbook/iu);
  });

  it("generates one internally consistent Supabase Auth and S3 secret bundle", () => {
    const secrets = generateFullLocalSecretBundle();

    expect(Object.keys(secrets).sort()).toEqual([...FULL_LOCAL_SECRET_NAMES].sort());
    expect(JSON.parse(secrets.jwt_keys)).toHaveLength(2);
    expect(JSON.parse(secrets.jwt_jwks).keys).toHaveLength(2);
    expect(new Set(Object.values(secrets)).size).toBe(FULL_LOCAL_SECRET_NAMES.length);
    expect(
      validateFullLocalProductionConfig({
        config: validConfig(),
        configFileMode: 0o600,
        secretDirectoryMode: 0o700,
        secrets,
      }),
    ).toMatchObject({ secretCount: FULL_LOCAL_SECRET_NAMES.length });
  });

  it("materializes Keychain values into a 0700 directory and 0600 files", () => {
    const root = mkdtempSync(join(tmpdir(), "full-local-secrets-"));
    const directory = join(root, "runtime");
    const secrets = validSecrets();

    try {
      const result = materializeFullLocalSecrets({
        readSecret: (name: string) => secrets[name],
        targetDirectory: directory,
      });

      expect(result.secretCount).toBe(FULL_LOCAL_SECRET_NAMES.length);
      expect(statSync(directory).mode & 0o777).toBe(0o700);
      for (const name of FULL_LOCAL_SECRET_NAMES) {
        expect(statSync(join(directory, name)).mode & 0o777).toBe(0o600);
        expect(readFileSync(join(directory, name), "utf8")).toBe(secrets[name]);
      }
      expect(
        validateFullLocalSecretFiles({
          directory,
          expectedNames: FULL_LOCAL_SECRET_NAMES,
        }),
      ).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("fails closed when the source directory or a secret file is too permissive", () => {
    expect(() =>
      validateFullLocalProductionConfig({
        config: validConfig(),
        configFileMode: 0o640,
        secretDirectoryMode: 0o700,
        secrets: validSecrets(),
      }),
    ).toThrow(/0600/u);
    expect(() =>
      validateFullLocalProductionConfig({
        config: validConfig(),
        configFileMode: 0o600,
        secretDirectoryMode: 0o755,
        secrets: validSecrets(),
      }),
    ).toThrow(/0700/u);
  });

  it("detects raw, base64, and URL-encoded secret leakage", () => {
    const secret = "s3-secret-value-that-must-never-leak-0001";
    expect(
      assertNoSecretLeakage({
        artifacts: ["compose has only /run/secrets/storage_s3_access_key_secret"],
        secrets: [secret],
      }),
    ).toBe(true);
    expect(() =>
      assertNoSecretLeakage({ artifacts: [`log=${secret}`], secrets: [secret] }),
    ).toThrow(/secret leakage/iu);
    expect(() =>
      assertNoSecretLeakage({
        artifacts: [Buffer.from(secret).toString("base64")],
        secrets: [secret],
      }),
    ).toThrow(/secret leakage/iu);
    expect(() =>
      assertNoSecretLeakage({
        artifacts: [encodeURIComponent(secret)],
        secrets: [secret],
      }),
    ).toThrow(/secret leakage/iu);
  });
});

describe("full-local runtime readiness", () => {
  const healthyState = { Health: { Status: "healthy" }, Status: "running" };

  it("requires all seven containers to be running and healthy", () => {
    expect(
      summarizeFullLocalRuntimeStates(Array.from({ length: 7 }, () => healthyState)),
    ).toEqual({ container_count: 7, exited: false, healthy: true });
    expect(
      summarizeFullLocalRuntimeStates([
        ...Array.from({ length: 6 }, () => healthyState),
        { Health: { Status: "starting" }, Status: "running" },
      ]),
    ).toEqual({ container_count: 7, exited: false, healthy: false });
    expect(
      summarizeFullLocalRuntimeStates([
        ...Array.from({ length: 6 }, () => healthyState),
        { Status: "exited" },
      ]),
    ).toEqual({ container_count: 7, exited: true, healthy: false });
  });
});
