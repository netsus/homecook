#!/usr/bin/env node

import {
  createHash,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  join,
  resolve,
} from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES = 1_048_576;
const ALGORITHMS = new Set(["ES256", "RS256"]);

function validateExactEndpoint(endpoint, expectedIssuer) {
  const endpointUrl = new URL(endpoint);
  const issuerUrl = new URL(expectedIssuer);
  if (
    endpointUrl.protocol !== "https:"
    || issuerUrl.protocol !== "https:"
    || endpointUrl.origin !== issuerUrl.origin
    || issuerUrl.pathname !== "/auth/v1"
    || endpointUrl.pathname !== "/auth/v1/.well-known/jwks.json"
    || endpointUrl.search
    || endpointUrl.hash
  ) {
    throw new Error("JWKS endpoint must be the exact HTTPS issuer endpoint");
  }
}

function validatePublicJwks(value, label) {
  if (
    !value
    || typeof value !== "object"
    || !Array.isArray(value.keys)
    || value.keys.length === 0
  ) {
    throw new Error(`${label} JWKS must contain at least one key`);
  }
  const kids = new Set();
  for (const key of value.keys) {
    if (
      !key
      || typeof key !== "object"
      || typeof key.kid !== "string"
      || !key.kid
      || kids.has(key.kid)
      || !ALGORITHMS.has(key.alg)
      || (key.use !== undefined && key.use !== "sig")
      || (
        key.key_ops !== undefined
        && (
          !Array.isArray(key.key_ops)
          || key.key_ops.length !== 1
          || key.key_ops[0] !== "verify"
        )
      )
      || key.d !== undefined
      || key.k !== undefined
      || (
        key.alg === "ES256"
        && (
          key.kty !== "EC"
          || key.crv !== "P-256"
          || typeof key.x !== "string"
          || !key.x
          || typeof key.y !== "string"
          || !key.y
        )
      )
      || (
        key.alg === "RS256"
        && (
          key.kty !== "RSA"
          || typeof key.n !== "string"
          || !key.n
          || typeof key.e !== "string"
          || !key.e
        )
      )
    ) {
      throw new Error(`${label} JWKS contains an unsafe or ambiguous key`);
    }
    kids.add(key.kid);
  }
  return value.keys;
}

function canonicalBundle(keys) {
  return `${JSON.stringify({ keys }, null, 2)}\n`;
}

function atomicReplace(outputPath, content) {
  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(temporaryPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    JSON.parse(readFileSync(temporaryPath, "utf8"));
    renameSync(temporaryPath, outputPath);
    chmodSync(outputPath, 0o600);
  } finally {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
  }
}

export async function syncRemoteAuthJwks({
  endpoint,
  expectedIssuer,
  localJwks,
  outputPath,
  fetchImpl = globalThis.fetch,
  write = true,
}) {
  validateExactEndpoint(endpoint, expectedIssuer);
  const localKeys = validatePublicJwks(localJwks, "local");
  let response;
  try {
    response = await fetchImpl(endpoint, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    throw new Error("Remote JWKS fetch failed closed");
  }
  if (!response.ok) {
    throw new Error(`Remote JWKS fetch failed with HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new Error("Remote JWKS exceeds the 1 MiB limit");
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BODY_BYTES) {
    throw new Error("Remote JWKS exceeds the 1 MiB limit");
  }

  let remoteJwks;
  try {
    remoteJwks = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("Remote JWKS is not valid JSON");
  }
  const remoteKeys = validatePublicJwks(remoteJwks, "remote");
  const combinedKeys = [...localKeys, ...remoteKeys];
  validatePublicJwks({ keys: combinedKeys }, "combined");

  const content = canonicalBundle(combinedKeys);
  const previous = existsSync(outputPath)
    ? readFileSync(outputPath, "utf8")
    : null;
  const changed = previous !== content;
  if (write && changed) {
    atomicReplace(outputPath, content);
  }

  return {
    changed,
    keyCount: combinedKeys.length,
    remoteKeyCount: remoteKeys.length,
    sha256: createHash("sha256").update(content).digest("hex"),
    wrote: write && changed,
  };
}

function parseArgs(argv) {
  const values = new Map();
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      check = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    values.set(argument, argv[index + 1]);
    index += 1;
  }
  return {
    check,
    endpoint: values.get("--endpoint") ?? process.env.AUTH_SUPABASE_JWKS_URL,
    expectedIssuer:
      values.get("--issuer") ?? process.env.AUTH_SUPABASE_EXPECTED_ISSUER,
    localPath: values.get("--local-jwks"),
    outputPath: values.get("--output"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (
    !args.endpoint
    || !args.expectedIssuer
    || !args.localPath
    || !args.outputPath
  ) {
    throw new Error(
      "--endpoint, --issuer, --local-jwks and --output are required",
    );
  }
  const result = await syncRemoteAuthJwks({
    endpoint: args.endpoint,
    expectedIssuer: args.expectedIssuer,
    localJwks: JSON.parse(readFileSync(resolve(args.localPath), "utf8")),
    outputPath: resolve(args.outputPath),
    write: !args.check,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
