import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();

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

function signLocalAuthenticatedJwt(secret) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: "authenticated",
    exp: now + 300,
    iat: now,
    iss: "supabase-demo",
    role: "authenticated",
    sub: randomUUID(),
  })}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function readLocalEnvironment() {
  const values = parseAssignments(run(
    "pnpm",
    ["exec", "supabase", "status", "-o", "env"],
    { cwd: repositoryRoot },
  ));
  if (!values.API_URL || !values.ANON_KEY || !values.JWT_SECRET) {
    throw new Error("local Supabase environment is unavailable");
  }
  return {
    url: values.API_URL,
    tokens: [
      { role: "anon", token: values.ANON_KEY },
      { role: "authenticated", token: signLocalAuthenticatedJwt(values.JWT_SECRET) },
    ],
  };
}

async function assertRejected({ environment, role, token, url, functionName }) {
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
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
  if (response.status !== 406 || payload.code !== "PGRST106") {
    throw new Error(`${environment}/${role}/${functionName} unexpectedly reached a non-exposure gate`);
  }
  return {
    environment,
    role,
    function: `net.${functionName}`,
    status: response.status,
    code: payload.code,
  };
}

const environments = [
  { environment: "local", ...readLocalEnvironment() },
];
const results = [];
for (const current of environments) {
  for (const { role, token } of current.tokens) {
    for (const functionName of ["http_get", "http_post"]) {
      results.push(await assertRejected({
        environment: current.environment,
        role,
        token,
        url: current.url,
        functionName,
      }));
    }
  }
}

console.warn(JSON.stringify(results, null, 2));
