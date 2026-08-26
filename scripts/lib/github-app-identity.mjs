import { constants, sign } from "node:crypto";

const GITHUB_APP_ENDPOINT = "https://api.github.com/app";
const GITHUB_API_VERSION = "2026-03-10";
const USER_AGENT = "homecook-release-attestation-c2";

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createGitHubAppJwt({ appId, nowMs = Date.now(), privateKey }) {
  const now = Math.floor(nowMs / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({
    exp: now + 480,
    iat: now - 60,
    iss: Number(appId),
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), {
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING,
  }).toString("base64url");
  return `${signingInput}.${signature}`;
}

export async function verifyGitHubAppIdentity({
  appId,
  fetchImpl = globalThis.fetch,
  nowMs = Date.now(),
  privateKey,
  timeoutMs = 10_000,
}) {
  const jwt = createGitHubAppJwt({ appId, nowMs, privateKey });
  const response = await fetchImpl(GITHUB_APP_ENDPOINT, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response?.ok) {
    throw new Error("GitHub App authentication failed.");
  }
  const identity = await response.json();
  if (!identity || !Number.isInteger(identity.id)) {
    throw new Error("GitHub App identity response is invalid.");
  }
  return { id: identity.id, slug: identity.slug ?? null };
}
