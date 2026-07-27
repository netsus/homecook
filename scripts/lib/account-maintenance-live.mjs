import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

export const ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE =
  "com.homecook.account-maintenance";
export const ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT =
  "HOMECOOK_MAINTENANCE_WORKER_SECRET";
export const ACCOUNT_MAINTENANCE_ALLOWED_TICK_HOSTS = Object.freeze([
  "homecook-flame.vercel.app",
  "homecook-jipbap.vercel.app",
  "homecook-git-master-jipbap.vercel.app",
]);

function requireStrongSecret(value) {
  const secret = typeof value === "string" ? value.trim() : "";
  if (secret.length < 43) {
    throw new Error("Account maintenance Keychain secret is missing or too short.");
  }
  return secret;
}

export function loadAccountMaintenanceSecretFromKeychain({
  execFile = execFileSync,
} = {}) {
  let secret;
  try {
    secret = execFile(
      "/usr/bin/security",
      [
        "find-generic-password",
        "-s",
        ACCOUNT_MAINTENANCE_KEYCHAIN_SERVICE,
        "-a",
        ACCOUNT_MAINTENANCE_KEYCHAIN_ACCOUNT,
        "-w",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    throw new Error("Account maintenance Keychain secret is unavailable.");
  }

  return requireStrongSecret(secret);
}

export function normalizeAccountMaintenanceTickUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Account maintenance tick URL is invalid.");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
  ) {
    throw new Error("Account maintenance tick URL must be plain HTTPS.");
  }
  if (!ACCOUNT_MAINTENANCE_ALLOWED_TICK_HOSTS.includes(url.hostname)) {
    throw new Error("Account maintenance tick URL host is not allowlisted.");
  }
  if (url.pathname !== "/internal/account-maintenance/tick") {
    throw new Error("Account maintenance tick URL has an unexpected path.");
  }
  return url.toString();
}

async function postTick({ tickUrl, secret, fetchImpl }) {
  return fetchImpl(tickUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error("Account maintenance tick returned invalid JSON.");
  }
}

/**
 * @param {{
 *   tickUrl: string,
 *   loadSecret?: () => string,
 *   fetchImpl?: typeof fetch,
 *   now?: () => Date,
 *   verifyWrongSecret?: boolean,
 * }} options
 */
export async function runAccountMaintenanceLiveTick({
  tickUrl,
  loadSecret = loadAccountMaintenanceSecretFromKeychain,
  fetchImpl = fetch,
  now = () => new Date(),
  verifyWrongSecret = false,
}) {
  const normalizedTickUrl = normalizeAccountMaintenanceTickUrl(tickUrl);
  const secret = requireStrongSecret(loadSecret());
  let wrongSecretStatus = null;
  if (verifyWrongSecret) {
    const wrongSecret = randomBytes(32).toString("base64url");
    const wrongSecretResponse = await postTick({
      tickUrl: normalizedTickUrl,
      secret: wrongSecret,
      fetchImpl,
    });
    wrongSecretStatus = wrongSecretResponse.status;
    if (wrongSecretStatus !== 401) {
      throw new Error("Live tick refused: wrong-secret probe did not return 401.");
    }
  }

  const liveResponse = await postTick({
    tickUrl: normalizedTickUrl,
    secret,
    fetchImpl,
  });
  const body = await readJson(liveResponse);
  const data = body?.data;

  if (
    liveResponse.status !== 200
    || body?.success !== true
    || data?.feature_state !== "feature_off"
    || data?.status !== "blocked"
  ) {
    if (data?.feature_state === "joint_activation_ready") {
      throw new Error("Live tick refused: joint activation is not approved.");
    }
    throw new Error("Live tick refused: feature-off safety contract failed.");
  }

  return {
    event: "account_maintenance_tick",
    timestamp: now().toISOString(),
    ok: true,
    wrongSecretStatus,
    liveStatus: liveResponse.status,
    featureState: data.feature_state,
    status: data.status,
    blockedAt: data.blocked_at ?? null,
    activationAllowed: false,
    externalHeartbeatConfigured: false,
    externalAlertConfigured: false,
  };
}
