export function resolveNextPath(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  return raw;
}
