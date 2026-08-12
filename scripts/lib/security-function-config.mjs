export function parseFunctionSearchPath(proconfig) {
  if (typeof proconfig !== "string" || proconfig.length === 0) return [];

  if (proconfig.includes('search_path=\\"\\"')) {
    return ["pg_catalog", "pg_temp"];
  }

  const quoted = proconfig.match(
    /(?:^|[{,])"search_path=([^"]*)"/u,
  )?.[1];
  const unquoted = proconfig.match(
    /(?:^|[{,])search_path=([^}]*)/u,
  )?.[1];
  const value = quoted ?? unquoted ?? "";

  if (value.length === 0) {
    return ["pg_catalog", "pg_temp"];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
