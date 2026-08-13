import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import { assertExactLoopbackHttpOrigin } from "./lib/local-only-supabase-operator-env.mjs";
import {
  SECURITY_SUPABASE_CLI_PACKAGE,
  buildSupabaseCliArgs,
} from "./lib/local-supabase-isolated-runtime.mjs";

const repositoryRoot = process.cwd();
const localWorkdir = process.env.SECURITY_FUNCTION_LOCAL_WORKDIR ?? repositoryRoot;
const maxAttempts = Number.parseInt(
  process.env.SECURITY_FUNCTION_DATA_API_MAX_ATTEMPTS ?? "20",
  10,
);

function parseAssignments(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^(?:export )?([A-Z0-9_]+)=(?:"([^"]*)"|'([^']*)'|(.*))$/u);
    if (!match) continue;
    values[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return values;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed without a usable environment`);
  }
  return result.stdout;
}

function signLocalJwt(secret, role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: role,
    exp: now + 300,
    iat: now,
    iss: "supabase-demo",
    role,
    ...(role === "authenticated" ? { sub: randomUUID() } : {}),
  })}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function readInjectedEnvironment() {
  const url = process.env.SECURITY_FUNCTION_DATA_API_URL;
  const jwtSecret = process.env.SECURITY_FUNCTION_DATA_API_JWT_SECRET;
  if (!url && !jwtSecret) return null;
  if (!url || !jwtSecret || jwtSecret.length < 32) {
    throw new Error("isolated Data API URL/JWT secret overrides are incomplete");
  }
  return {
    rpcBasePath: "/rpc",
    url: assertExactLoopbackHttpOrigin(url, { label: "SECURITY_FUNCTION_DATA_API_URL" }),
    tokens: [
      { role: "anon", token: signLocalJwt(jwtSecret, "anon") },
      { role: "authenticated", token: signLocalJwt(jwtSecret, "authenticated") },
    ],
  };
}

function readLocalEnvironment() {
  const values = parseAssignments(run(
    "pnpm",
    buildSupabaseCliArgs(["status", "-o", "env"], {
      cliPackage: SECURITY_SUPABASE_CLI_PACKAGE,
      workdir: localWorkdir,
    }),
    { cwd: localWorkdir },
  ));
  if (!values.API_URL || !values.ANON_KEY || !values.JWT_SECRET) {
    throw new Error("local Supabase environment is unavailable");
  }
  return {
    rpcBasePath: "/rest/v1/rpc",
    url: assertExactLoopbackHttpOrigin(values.API_URL, { label: "API_URL" }),
    tokens: [
      { role: "anon", token: values.ANON_KEY },
      { role: "authenticated", token: signLocalJwt(values.JWT_SECRET, "authenticated") },
    ],
  };
}

async function assertRejected({
  environment,
  functionName,
  role,
  rpcBasePath,
  token,
  url,
}) {
  let lastStatus = 0;
  let lastCode = "no-code";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`${url}${rpcBasePath}/${functionName}`, {
      method: "POST",
      headers: {
        apikey: token,
        authorization: `Bearer ${token}`,
        "accept-profile": "net",
        "content-profile": "net",
        "content-type": "application/json",
      },
      body: JSON.stringify(functionName === "http_get"
        ? {
          url: "http://127.0.0.1:9/security-negative-smoke",
          params: {},
          headers: {},
          timeout_milliseconds: 100,
        }
        : {
          url: "http://127.0.0.1:9/security-negative-smoke",
          body: {},
          params: {},
          headers: {},
          timeout_milliseconds: 100,
        }),
    });
    const payload = await response.json().catch(() => ({}));
    lastStatus = response.status;
    lastCode = payload.code ?? "no-code";
    if (response.status === 406 && payload.code === "PGRST106") {
      return {
        environment,
        role,
        function: `net.${functionName}`,
        status: response.status,
        code: payload.code,
      };
    }
    if (![502, 503].includes(response.status) || attempt === maxAttempts) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `${environment}/${role}/${functionName} returned ${lastStatus}/${lastCode} instead of 406/PGRST106`,
  );
}

const environments = [
  { environment: "local", ...(readInjectedEnvironment() ?? readLocalEnvironment()) },
];
const results = [];
for (const current of environments) {
  for (const { role, token } of current.tokens) {
    for (const functionName of ["http_get", "http_post"]) {
      results.push(await assertRejected({
        environment: current.environment,
        role,
        rpcBasePath: current.rpcBasePath,
        token,
        url: current.url,
        functionName,
      }));
    }
  }
}

console.warn(JSON.stringify(results, null, 2));
