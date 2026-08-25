import { materializeSecretFilesCreateOnly } from "./full-local-production-runtime.mjs";

export const FULL_LOCAL_OAUTH_KEYCHAIN_ACCOUNTS = Object.freeze({
  google_client_id: "google_client_id",
  google_client_secret: "google_client_secret",
  kakao_client_id: "kakao_client_id",
  kakao_client_secret: "kakao_client_secret",
  naver_client_id: "naver_client_id",
  naver_client_secret: "naver_client_secret",
});

export const FULL_LOCAL_OAUTH_SECRET_NAMES = Object.freeze(
  Object.keys(FULL_LOCAL_OAUTH_KEYCHAIN_ACCOUNTS),
);

const PLACEHOLDER_PATTERN =
  /(?:change[-_ ]?me|example|placeholder|replace[-_ ]?me|your[-_ ]?|<[^>]+>)/iu;

function requiredSecret(secrets, name) {
  const value = secrets?.[name];
  if (typeof value !== "string" || value.length < 8) {
    throw new Error(`${name} must contain at least 8 characters.`);
  }
  if (value !== value.trim() || /[\r\n\0]/u.test(value)) {
    throw new Error(`${name} contains unsafe whitespace or control characters.`);
  }
  if (PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(`${name} contains placeholder credential material.`);
  }
  return value;
}

export function validateFullLocalOAuthConfig({ config, secrets }) {
  const enabled = config?.FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS === "true";
  if (!enabled) {
    if (
      config?.FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS !== undefined
      && config.FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS !== "false"
    ) {
      throw new Error("FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS must be true or false.");
    }
    return Object.freeze({ enabled: false, provider_count: 0, secret_count: 0 });
  }
  if (!config?.FULL_LOCAL_OAUTH_KEYCHAIN_SERVICE?.trim()) {
    throw new Error("FULL_LOCAL_OAUTH_KEYCHAIN_SERVICE is required when social providers are enabled.");
  }
  const values = FULL_LOCAL_OAUTH_SECRET_NAMES.map((name) => requiredSecret(secrets, name));
  if (new Set(values).size !== values.length) {
    throw new Error("OAuth provider credentials must not be reused.");
  }
  return Object.freeze({
    enabled: true,
    provider_count: 3,
    secret_count: values.length,
  });
}

export function materializeFullLocalOAuthSecrets({
  additionalExpectedNames = [],
  secrets,
  targetDirectory,
}) {
  return materializeSecretFilesCreateOnly({
    allowedNames: [...FULL_LOCAL_OAUTH_SECRET_NAMES, ...additionalExpectedNames],
    names: FULL_LOCAL_OAUTH_SECRET_NAMES,
    readSecret: (name) => requiredSecret(secrets, name),
    targetDirectory,
  });
}

export function assertLocalOAuthProvisionApproved({ confirmation }) {
  if (confirmation !== "PROVISION_LOCAL_OAUTH_PROVIDERS") {
    throw new Error(
      "Local OAuth provisioning requires --confirm-local-auth-mutation PROVISION_LOCAL_OAUTH_PROVIDERS",
    );
  }
  return true;
}

export function buildNaverCustomProviderConfig({ clientId, clientSecret, siteUrl }) {
  const appOrigin = new URL(siteUrl);
  if (appOrigin.protocol !== "https:" || appOrigin.pathname !== "/") {
    throw new Error("Naver custom provider requires an exact HTTPS app origin.");
  }
  return Object.freeze({
    authorization_url: "https://nid.naver.com/oauth2.0/authorize",
    client_id: requiredSecret({ value: clientId }, "value"),
    client_secret: requiredSecret({ value: clientSecret }, "value"),
    email_optional: false,
    enabled: true,
    identifier: "custom:naver",
    name: "Naver",
    provider_type: "oauth2",
    token_url: "https://nid.naver.com/oauth2.0/token",
    userinfo_url: new URL("/api/auth/oauth-userinfo/naver", appOrigin).toString(),
  });
}

export async function upsertNaverCustomProvider({ admin, clientId, clientSecret, siteUrl }) {
  const desired = buildNaverCustomProviderConfig({ clientId, clientSecret, siteUrl });
  const existing = await admin.getProvider(desired.identifier);
  let result;
  let action;
  if (existing.error) {
    if (existing.error.status !== 404) {
      throw new Error(`Naver provider lookup failed: ${existing.error.message}`);
    }
    action = "created";
    result = await admin.createProvider(desired);
  } else {
    action = "updated";
    const update = { ...desired };
    delete update.identifier;
    delete update.provider_type;
    result = await admin.updateProvider(desired.identifier, update);
  }
  if (result.error || !result.data) {
    throw new Error(`Naver provider ${action} failed: ${result.error?.message ?? "empty response"}`);
  }
  return Object.freeze({
    action,
    enabled: result.data.enabled === true,
    identifier: result.data.identifier,
  });
}
