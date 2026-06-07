export type ReturnSurface =
  | "home"
  | "leftovers.list"
  | "mypage.eaten-list"
  | "mypage.leftovers"
  | "mypage.recipebooks"
  | "mypage.shopping-history"
  | "planner.meal-add-modal"
  | "planner.week"
  | "recipe.detail";

export type RestoreTarget =
  | "eaten-list-tab"
  | "leftovers-tab"
  | "meal-add-modal"
  | "mypage-home"
  | "recipebook-tab"
  | "shopping-history-tab";

export interface ReturnContext {
  restore?: RestoreTarget;
  returnSurface?: ReturnSurface;
  returnTo: string;
}

const INTERNAL_URL_BASE = "http://homecook.local";
const DEFAULT_FALLBACK = "/";

function toSearchParams(params: URLSearchParams | ReadonlyURLSearchParamsLike) {
  return params instanceof URLSearchParams
    ? params
    : new URLSearchParams(params.toString());
}

interface ReadonlyURLSearchParamsLike {
  get(name: string): string | null;
  toString(): string;
}

export function sanitizeInternalPath(
  rawPath: string | null | undefined,
  fallback = DEFAULT_FALLBACK,
) {
  const fallbackPath =
    fallback.startsWith("/") && !fallback.startsWith("//")
      ? fallback
      : DEFAULT_FALLBACK;

  if (!rawPath || !rawPath.startsWith("/") || rawPath.startsWith("//")) {
    return fallbackPath;
  }

  try {
    const url = new URL(rawPath, INTERNAL_URL_BASE);
    if (url.origin !== INTERNAL_URL_BASE) {
      return fallbackPath;
    }

    if (url.pathname === "/mypage" && url.searchParams.get("tab") === "account") {
      url.searchParams.set("tab", "preferences");
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallbackPath;
  }
}

export function buildReturnHref(targetPath: string, context: ReturnContext) {
  const target = new URL(
    sanitizeInternalPath(targetPath, DEFAULT_FALLBACK),
    INTERNAL_URL_BASE,
  );
  target.searchParams.set(
    "returnTo",
    sanitizeInternalPath(context.returnTo, DEFAULT_FALLBACK),
  );
  if (context.returnSurface) {
    target.searchParams.set("returnSurface", context.returnSurface);
  }
  if (context.restore) {
    target.searchParams.set("restore", context.restore);
  }

  return `${target.pathname}${target.search}${target.hash}`;
}

export function resolveReturnHref(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
  fallback = DEFAULT_FALLBACK,
) {
  const searchParams = toSearchParams(params);
  const rawReturnTo = searchParams.get("returnTo");
  const fallbackPath = sanitizeInternalPath(fallback, DEFAULT_FALLBACK);
  const returnTo = sanitizeInternalPath(rawReturnTo, fallbackPath);
  const target = new URL(returnTo, INTERNAL_URL_BASE);

  const returnSurface = searchParams.get("returnSurface");
  if (returnSurface) {
    target.searchParams.set("returnSurface", returnSurface);
  }

  const restore = searchParams.get("restore");
  if (restore) {
    target.searchParams.set("restore", restore);
  }

  return `${target.pathname}${target.search}${target.hash}`;
}
