import type { RecipeSortKey } from "@/types/recipe";

export interface HomeDiscoveryState {
  query: string;
  sort: RecipeSortKey;
  ingredientIds: string[];
  tagKey: string | null;
  themeId: string | null;
}

export const HOME_DISCOVERY_SCROLL_STATE_KEY = "homecook.home-discovery-scroll";
const SORT_KEYS: RecipeSortKey[] = ["view_count", "latest", "save_count", "plan_count", "cook_count"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readHomeDiscoveryState(params: URLSearchParams): HomeDiscoveryState {
  const sort = SORT_KEYS.find((key) => key === params.get("sort")) ?? "view_count";
  return {
    query: params.get("q") ?? "",
    sort,
    ingredientIds: Array.from(new Set((params.get("ingredient_ids") ?? "").split(",").filter((id) => UUID_PATTERN.test(id)))),
    tagKey: params.get("tag")?.trim() || null,
    themeId: params.get("theme")?.trim() || null,
  };
}

export function buildHomeDiscoveryHref(currentHref: string, state: HomeDiscoveryState) {
  const url = new URL(currentHref, "http://homecook.local");
  const values = {
    q: state.query,
    sort: state.sort === "view_count" ? "" : state.sort,
    ingredient_ids: state.ingredientIds.join(","),
    tag: state.tagKey ?? "",
    theme: state.themeId ?? "",
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function readHomeDiscoveryScrollState(historyState: unknown, href: string) {
  if (!historyState || typeof historyState !== "object" || !(HOME_DISCOVERY_SCROLL_STATE_KEY in historyState)) return null;
  const value: unknown = Reflect.get(historyState, HOME_DISCOVERY_SCROLL_STATE_KEY);
  if (!value || typeof value !== "object"
    || !("href" in value) || value.href !== href
    || !("top" in value) || typeof value.top !== "number" || !Number.isFinite(value.top) || value.top < 0
    || !("pages" in value) || typeof value.pages !== "number" || !Number.isSafeInteger(value.pages) || value.pages < 1) return null;
  return { top: value.top, pages: value.pages };
}

export function readHomeDiscoveryReturnScrollState(raw: string | null, href: string) {
  const target = new URL(href, "http://homecook.local");
  if (!raw || target.pathname !== "/" || target.searchParams.get("returnSurface") !== "home") return null;
  target.searchParams.delete("returnSurface");
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("href" in value)
      || typeof value.href !== "string" || !value.href.startsWith("/") || value.href.startsWith("//")) return null;
    const saved = new URL(value.href, "http://homecook.local");
    saved.searchParams.delete("returnSurface");
    if (saved.pathname + saved.search + saved.hash !== target.pathname + target.search + target.hash) return null;
    return readHomeDiscoveryScrollState({ [HOME_DISCOVERY_SCROLL_STATE_KEY]: value }, value.href);
  } catch {
    return null;
  }
}
