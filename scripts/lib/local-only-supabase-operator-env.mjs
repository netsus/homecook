const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);

export function assertExactLoopbackHttpOrigin(value, { label = "URL" } = {}) {
  let parsed;
  try {
    parsed = new URL(value?.trim());
  } catch {
    throw new Error(`${label} must be an exact loopback HTTP(S) origin.`);
  }
  if (
    !LOOPBACK_HOSTS.has(parsed.hostname)
    || !["http:", "https:"].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must be an exact loopback HTTP(S) origin.`);
  }
  return parsed.origin;
}

function required(env, name) {
  const value = env?.[name]?.trim();
  if (!value) throw new Error(`${name} is required for a local-only Supabase operator.`);
  return value;
}

export function assertLocalOnlySupabaseOperatorEnv(
  env,
  { urlKey = "NEXT_PUBLIC_SUPABASE_URL" } = {},
) {
  for (const authority of ["HOMECOOK_AUTH_AUTHORITY", "HOMECOOK_DATA_AUTHORITY"]) {
    if (required(env, authority) !== "local") {
      throw new Error(`${authority} must be local for a local-only Supabase operator.`);
    }
  }
  const url = assertExactLoopbackHttpOrigin(required(env, urlKey), { label: urlKey });
  return Object.freeze({
    serviceRoleKey: required(env, "SUPABASE_SERVICE_ROLE_KEY"),
    url,
  });
}
