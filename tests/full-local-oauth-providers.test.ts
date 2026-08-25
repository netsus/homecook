import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  FULL_LOCAL_OAUTH_SECRET_NAMES,
  assertLocalOAuthProvisionApproved,
  buildNaverCustomProviderConfig,
  materializeFullLocalOAuthSecrets,
  upsertNaverCustomProvider,
  validateFullLocalOAuthConfig,
} from "@/scripts/lib/full-local-oauth-providers.mjs";

function credentials() {
  return Object.fromEntries(FULL_LOCAL_OAUTH_SECRET_NAMES.map((name, index) => [
    name,
    `${name}-secure-value-${index}`,
  ]));
}

describe("full-local OAuth credential boundary", () => {
  it("keeps providers disabled without loading credentials", () => {
    expect(validateFullLocalOAuthConfig({
      config: { FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS: "false" },
      secrets: {},
    })).toEqual({ enabled: false, provider_count: 0, secret_count: 0 });
  });

  it("fails closed when enabled credentials are missing, unsafe, or reused", () => {
    const config = {
      FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS: "true",
      FULL_LOCAL_OAUTH_KEYCHAIN_SERVICE: "homecook-oauth",
    };
    expect(() => validateFullLocalOAuthConfig({ config, secrets: {} }))
      .toThrow("google_client_id");
    expect(() => validateFullLocalOAuthConfig({
      config,
      secrets: { ...credentials(), naver_client_secret: "bad\nsecret" },
    })).toThrow("unsafe whitespace");
    expect(() => validateFullLocalOAuthConfig({
      config,
      secrets: { ...credentials(), naver_client_secret: credentials().google_client_secret },
    })).toThrow("must not be reused");
  });

  it("materializes provider credentials with mode 0600", () => {
    const targetDirectory = mkdtempSync(join(tmpdir(), "homecook-oauth-secrets-"));
    const secrets = credentials();
    expect(materializeFullLocalOAuthSecrets({ secrets, targetDirectory }))
      .toBe(FULL_LOCAL_OAUTH_SECRET_NAMES.length);
    for (const name of FULL_LOCAL_OAUTH_SECRET_NAMES) {
      const path = join(targetDirectory, name);
      expect(readFileSync(path, "utf8")).toBe(secrets[name]);
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it("preserves existing provider files when Keychain values already match", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-existing-oauth-secrets-"));
    const targetDirectory = join(root, "runtime");
    const secrets = credentials();
    const preservedDate = new Date("2020-01-02T03:04:05.000Z");

    try {
      mkdirSync(targetDirectory, { mode: 0o700 });
      for (const name of FULL_LOCAL_OAUTH_SECRET_NAMES) {
        const path = join(targetDirectory, name);
        writeFileSync(path, secrets[name], { mode: 0o600 });
        utimesSync(path, preservedDate, preservedDate);
      }

      materializeFullLocalOAuthSecrets({ secrets, targetDirectory });

      for (const name of FULL_LOCAL_OAUTH_SECRET_NAMES) {
        expect(statSync(join(targetDirectory, name)).mtimeMs)
          .toBe(preservedDate.getTime());
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("full-local Naver provider", () => {
  it("uses the app normalization proxy and official Naver OAuth2 endpoints", () => {
    expect(buildNaverCustomProviderConfig({
      clientId: "naver-client-id",
      clientSecret: "naver-client-secret",
      siteUrl: "https://app.mumeok.kr",
    })).toMatchObject({
      authorization_url: "https://nid.naver.com/oauth2.0/authorize",
      email_optional: false,
      identifier: "custom:naver",
      provider_type: "oauth2",
      token_url: "https://nid.naver.com/oauth2.0/token",
      userinfo_url: "https://app.mumeok.kr/api/auth/oauth-userinfo/naver",
    });
  });

  it("requires an exact local Auth mutation confirmation", () => {
    expect(() => assertLocalOAuthProvisionApproved({ confirmation: "yes" }))
      .toThrow("--confirm-local-auth-mutation");
    expect(assertLocalOAuthProvisionApproved({
      confirmation: "PROVISION_LOCAL_OAUTH_PROVIDERS",
    })).toBe(true);
  });

  it("creates a missing provider and updates an existing provider", async () => {
    const createProvider = vi.fn(async (config) => ({
      data: { ...config, enabled: true },
      error: null,
    }));
    const updateProvider = vi.fn(async (identifier, config) => ({
      data: { ...config, identifier, enabled: true },
      error: null,
    }));
    const base = {
      clientId: "naver-client-id",
      clientSecret: "naver-client-secret",
      siteUrl: "https://app.mumeok.kr",
    };
    await expect(upsertNaverCustomProvider({
      ...base,
      admin: {
        createProvider,
        getProvider: vi.fn(async () => ({ data: null, error: { message: "missing", status: 404 } })),
        updateProvider,
      },
    })).resolves.toMatchObject({ action: "created", identifier: "custom:naver" });
    expect(createProvider).toHaveBeenCalledOnce();

    await expect(upsertNaverCustomProvider({
      ...base,
      admin: {
        createProvider,
        getProvider: vi.fn(async () => ({ data: { identifier: "custom:naver" }, error: null })),
        updateProvider,
      },
    })).resolves.toMatchObject({ action: "updated", identifier: "custom:naver" });
    expect(updateProvider).toHaveBeenCalledWith(
      "custom:naver",
      expect.not.objectContaining({ identifier: expect.anything(), provider_type: expect.anything() }),
    );
  });
});
