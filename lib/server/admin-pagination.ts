export function parseAdminPagination(url: URL) {
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 100)
    : 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return { from, limit, page, to };
}

export function readOptionalQuery(url: URL, key: string) {
  const value = url.searchParams.get(key)?.trim();
  return value ? value : null;
}
