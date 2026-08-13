const EXACT_LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);

export function assertExactLoopbackPostgresUrl(
  value,
  { name = "PostgreSQL URL" } = {},
) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `${name} must use postgresql:// with an exact loopback host (127.0.0.1 or ::1)`,
    );
  }

  if (
    parsed.protocol !== "postgresql:"
    || !EXACT_LOOPBACK_HOSTS.has(parsed.hostname)
  ) {
    throw new Error(
      `${name} must use postgresql:// with an exact loopback host (127.0.0.1 or ::1)`,
    );
  }

  return value;
}
