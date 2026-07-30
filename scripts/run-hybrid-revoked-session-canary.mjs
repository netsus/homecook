#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const LOCKED_PROJECT_REF = "vfubnhtawezmheylfhsv";

function parseArgs(argv) {
  const allow = argv.includes("--allow-hosted-session-revocation");
  const refIndex = argv.indexOf("--expected-project-ref");
  return {
    allow,
    expectedProjectRef: refIndex >= 0 ? argv[refIndex + 1] : null,
  };
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function decodeClaims(accessToken) {
  const parts = accessToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Canary access token is malformed");
  }
  return JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  );
}

async function remoteUser({
  authUrl,
  publishableKey,
  accessToken,
}) {
  return fetch(`${authUrl}/auth/v1/user`, {
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(3_000),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (
    !args.allow
    || args.expectedProjectRef !== LOCKED_PROJECT_REF
    || process.env.HYBRID_CANARY_DISPOSABLE
      !== "YES-REVOKE-THIS-SESSION"
  ) {
    throw new Error(
      "Refusing hosted mutation: explicit disposable-session gate is missing",
    );
  }

  const authUrl = required("NEXT_PUBLIC_AUTH_SUPABASE_URL").replace(/\/+$/, "");
  const publishableKey = required(
    "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY",
  );
  const accessToken = required("HYBRID_CANARY_ACCESS_TOKEN");
  const refreshToken = required("HYBRID_CANARY_REFRESH_TOKEN");
  const expectedUrl = `https://${LOCKED_PROJECT_REF}.supabase.co`;
  if (authUrl !== expectedUrl) {
    throw new Error("Hosted Auth URL does not match the locked project ref");
  }

  const claims = decodeClaims(accessToken);
  if (
    claims.iss !== `${expectedUrl}/auth/v1`
    || claims.aud !== "authenticated"
    || claims.role !== "authenticated"
    || typeof claims.session_id !== "string"
  ) {
    throw new Error("Canary token does not have the locked user-session shape");
  }

  const before = await remoteUser({ authUrl, publishableKey, accessToken });
  if (!before.ok) {
    throw new Error("Canary precondition failed: session is not live");
  }

  const client = createClient(authUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const sessionResult = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionResult.error) {
    throw new Error("Canary session setup failed");
  }
  const logoutResult = await client.auth.signOut({ scope: "local" });
  if (logoutResult.error) {
    throw new Error("Canary local-scope logout failed");
  }

  const after = await remoteUser({ authUrl, publishableKey, accessToken });
  const body = await after.text();
  if (
    after.ok
    || !/session_not_found/i.test(body)
  ) {
    throw new Error(
      "Revoked-session negative canary failed: /auth/v1/user stayed live",
    );
  }

  process.stdout.write(`${JSON.stringify({
    project_ref: LOCKED_PROJECT_REF,
    pre_liveness_status: before.status,
    logout_scope: "local",
    post_liveness_status: after.status,
    post_liveness_code: "session_not_found",
    local_application_mutations: 0,
  })}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
