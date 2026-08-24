const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function required(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function exactLoopbackOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(required(value, label));
  } catch {
    throw new Error(`${label} must be an exact loopback HTTP origin`);
  }
  if (
    parsed.protocol !== "http:"
    || !LOOPBACK_HOSTS.has(parsed.hostname)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must be an exact loopback HTTP origin`);
  }
  return parsed.origin;
}

export function resolveLocalDemoSeedTargets({ env = {}, primary }) {
  const auth = {
    serviceRoleKey: required(primary?.SERVICE_ROLE_KEY, "primary service role key"),
    url: exactLoopbackOrigin(primary?.API_URL, "primary API URL"),
  };
  const shadowUrl = env.HOMECOOK_LOCAL_SEED_DATA_API_URL?.trim();
  const shadowKey = env.HOMECOOK_LOCAL_SEED_DATA_API_SERVICE_ROLE_KEY?.trim();
  if (Boolean(shadowUrl) !== Boolean(shadowKey)) {
    throw new Error("shadow seed Data API URL and service role key must both be provided");
  }
  if (!shadowUrl) {
    return Object.freeze({ auth, data: { ...auth }, split: false });
  }
  return Object.freeze({
    auth,
    data: {
      serviceRoleKey: shadowKey,
      url: exactLoopbackOrigin(shadowUrl, "shadow seed Data API URL"),
    },
    split: true,
  });
}

export function buildLocalDemoSeedClientOptions({
  directPostgrest = false,
  fetchImpl = fetch,
  url,
}) {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  };
  if (!directPostgrest) return options;
  if (typeof fetchImpl !== "function") {
    throw new Error("shadow seed Data API fetch implementation is required");
  }
  const origin = exactLoopbackOrigin(url, "shadow seed Data API URL");
  return {
    ...options,
    global: {
      fetch: (input, init) => {
        const rawUrl = input instanceof Request ? input.url : String(input);
        const parsed = new URL(rawUrl);
        if (parsed.origin !== origin || !parsed.pathname.startsWith("/rest/v1/")) {
          throw new Error("shadow seed Data API request escaped the direct PostgREST route");
        }
        parsed.pathname = parsed.pathname.slice("/rest/v1".length);
        const rewritten = parsed.toString();
        if (input instanceof Request) {
          return fetchImpl(new Request(rewritten, input), init);
        }
        return fetchImpl(rewritten, init);
      },
    },
  };
}
