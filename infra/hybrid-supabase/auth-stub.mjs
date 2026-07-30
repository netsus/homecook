#!/usr/bin/env node

import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { createServer } from "node:http";

const KEY_ID = "hybrid-runtime-es256";
const DEFAULT_OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const DEFAULT_SESSION_UUID = "22222222-2222-4222-8222-222222222222";
const DEFAULT_CREATED_AT = "2026-07-29T00:00:00.000Z";
const DEFAULT_NOW_SECONDS = 1_785_254_400;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const issuer = requiredEnv("AUTH_STUB_ISSUER");
const port = Number(process.env.AUTH_STUB_PORT ?? "4100");
const privateKey = createPrivateKey(
  Buffer.from(
    requiredEnv("AUTH_STUB_PRIVATE_KEY_PEM_BASE64"),
    "base64",
  ).toString("utf8"),
);
if (
  privateKey.asymmetricKeyType !== "ec"
  || privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
) {
  throw new Error("AUTH_STUB_PRIVATE_KEY_PEM_BASE64 must contain a P-256 key");
}
const publicJwk = {
  ...createPublicKey(privateKey).export({ format: "jwk" }),
  alg: "ES256",
  ext: true,
  kid: KEY_ID,
  key_ops: ["verify"],
  use: "sig",
};

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function issueToken({
  ownerUuid = DEFAULT_OWNER_UUID,
  sessionId = DEFAULT_SESSION_UUID,
  createdAt = DEFAULT_CREATED_AT,
  nowSeconds = DEFAULT_NOW_SECONDS,
  role = "authenticated",
  audience = "authenticated",
} = {}) {
  const signingInput = [
    encodeJson({
      alg: "ES256",
      kid: KEY_ID,
      typ: "JWT",
    }),
    encodeJson({
      iss: issuer,
      aud: audience,
      role,
      sub: ownerUuid,
      session_id: sessionId,
      iat: nowSeconds - 60,
      nbf: nowSeconds - 60,
      exp: nowSeconds + 300,
      user_metadata: {
        hybrid_created_at: createdAt,
      },
    }),
  ].join(".");
  const signature = sign(
    "sha256",
    Buffer.from(signingInput, "utf8"),
    { key: privateKey, dsaEncoding: "ieee-p1363" },
  ).toString("base64url");

  return {
    accessToken: `${signingInput}.${signature}`,
    claims: {
      iss: issuer,
      aud: audience,
      role,
      sub: ownerUuid,
      session_id: sessionId,
      iat: nowSeconds - 60,
      nbf: nowSeconds - 60,
      exp: nowSeconds + 300,
    },
    createdAt,
  };
}

function verifyToken(accessToken) {
  const [headerPart, payloadPart, signaturePart] = accessToken.split(".");
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error("invalid token");
  }
  const header = decodeJson(headerPart);
  if (header.alg !== "ES256" || header.kid !== KEY_ID) {
    throw new Error("invalid token header");
  }
  const valid = verify(
    "sha256",
    Buffer.from(`${headerPart}.${payloadPart}`, "utf8"),
    { key: createPublicKey(privateKey), dsaEncoding: "ieee-p1363" },
    Buffer.from(signaturePart, "base64url"),
  );
  if (!valid) {
    throw new Error("invalid token signature");
  }
  return decodeJson(payloadPart);
}

function writeJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function startServer() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (requestUrl.pathname === "/auth/v1/.well-known/jwks.json") {
      writeJson(response, 200, { keys: [publicJwk] });
      return;
    }
    if (requestUrl.pathname === "/auth/v1/user") {
      const authorization = request.headers.authorization ?? "";
      if (!authorization.startsWith("Bearer ")) {
        writeJson(response, 401, { code: "session_not_found" });
        return;
      }
      try {
        const claims = verifyToken(authorization.slice("Bearer ".length));
        writeJson(response, 200, {
          id: claims.sub,
          created_at: claims.user_metadata?.hybrid_created_at ?? DEFAULT_CREATED_AT,
        });
      } catch {
        writeJson(response, 401, { code: "session_not_found" });
      }
      return;
    }
    response.writeHead(404);
    response.end();
  });

  server.listen(port, "0.0.0.0");
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) {
    return fallback;
  }
  return process.argv[index + 1];
}

if (process.argv[2] === "issue-token") {
  const issued = issueToken({
    ownerUuid: readOption("--owner-uuid", DEFAULT_OWNER_UUID),
    sessionId: readOption("--session-id", DEFAULT_SESSION_UUID),
    createdAt: readOption("--created-at", DEFAULT_CREATED_AT),
    nowSeconds: Number(readOption("--now-seconds", String(DEFAULT_NOW_SECONDS))),
    role: readOption("--role", "authenticated"),
    audience: readOption("--aud", "authenticated"),
  });
  process.stdout.write(`${JSON.stringify({
    issuer,
    access_token: issued.accessToken,
    claims: issued.claims,
    created_at: issued.createdAt,
    jwks: { keys: [publicJwk] },
  })}\n`);
} else {
  startServer();
}
