const ANONYMOUS_PUBLIC_READ_PATHS = new Set([
  "/recipes",
  "/recipe_ingredients",
  "/recipe_nutrition_snapshots",
  "/recipe_sources",
  "/recipe_steps",
  "/rpc/find_recipe_ids_by_public_tags",
]);

export function isAnonymousHybridPublicReadRequest({
  method,
  path,
}: {
  method: string;
  path: string;
}) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    return false;
  }

  return ANONYMOUS_PUBLIC_READ_PATHS.has(path);
}
