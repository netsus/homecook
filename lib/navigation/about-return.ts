const ABOUT_RETURN_STORAGE_KEY = "homecook:about-return";
const ABOUT_RETURN_MAX_AGE_MS = 5 * 60 * 1000;

interface AboutReturnMarker {
  createdAt: number;
  historyLength: number;
  href: string;
}

function isSafeInternalHref(href: unknown) {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) {
    return false;
  }

  try {
    const url = new URL(href, window.location.origin);

    return url.origin === window.location.origin && url.pathname !== "/about";
  } catch {
    return false;
  }
}

export function rememberAboutReturn() {
  const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (!isSafeInternalHref(href)) {
    return;
  }

  const marker: AboutReturnMarker = {
    createdAt: Date.now(),
    historyLength: window.history.length,
    href,
  };

  try {
    window.sessionStorage.setItem(ABOUT_RETURN_STORAGE_KEY, JSON.stringify(marker));
  } catch {
    // Storage can be unavailable in privacy-restricted or sandboxed browsers.
  }
}

export function hasSafeAboutHistoryReturn() {
  try {
    const rawMarker = window.sessionStorage.getItem(ABOUT_RETURN_STORAGE_KEY);
    window.sessionStorage.removeItem(ABOUT_RETURN_STORAGE_KEY);

    if (!rawMarker) {
      return false;
    }

    const marker = JSON.parse(rawMarker) as Partial<AboutReturnMarker>;
    const age = Date.now() - Number(marker.createdAt);

    return (
      Number.isInteger(marker.historyLength) &&
      marker.historyLength! >= 1 &&
      window.history.length === marker.historyLength! + 1 &&
      age >= 0 &&
      age <= ABOUT_RETURN_MAX_AGE_MS &&
      isSafeInternalHref(marker.href)
    );
  } catch {
    return false;
  }
}
