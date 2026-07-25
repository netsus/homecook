export function parseFunctionSearchPath(proconfig) {
  if (typeof proconfig !== "string" || proconfig.length === 0) return [];

  const quoted = proconfig.match(
    /(?:^|[{,])"search_path=([^"]*)"/u,
  )?.[1];
  const unquoted = proconfig.match(
    /(?:^|[{,])search_path=([^}]*)/u,
  )?.[1];
  const value = quoted ?? unquoted ?? "";

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
