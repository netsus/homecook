export type MypageRestoreTab = "saved" | "recipebooks" | "shopping";
export type MypageRestoreMobileSurface = "home" | "recipebook" | "shopping";

export interface MypageRestoreState {
  activeTab: MypageRestoreTab;
  mobileSurface: MypageRestoreMobileSurface;
}

type SearchParamRecord = Record<string, string | string[] | undefined>;

interface SearchParamReader {
  get(name: string): string | null;
}

const DEFAULT_MYPAGE_STATE: MypageRestoreState = {
  activeTab: "saved",
  mobileSurface: "home",
};

function readSearchValue(
  params: URLSearchParams | SearchParamReader | SearchParamRecord,
  name: string,
) {
  if (isSearchParamReader(params)) {
    return params.get(name);
  }

  const value = params[name];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function isSearchParamReader(
  params: URLSearchParams | SearchParamReader | SearchParamRecord,
): params is URLSearchParams | SearchParamReader {
  return typeof (params as SearchParamReader).get === "function";
}

export function resolveMypageRestoreState(
  params: URLSearchParams | SearchParamReader | SearchParamRecord,
): MypageRestoreState {
  const restore = readSearchValue(params, "restore");
  const returnSurface = readSearchValue(params, "returnSurface");

  if (
    restore === "shopping-history-tab" ||
    returnSurface === "mypage.shopping-history"
  ) {
    return {
      activeTab: "shopping",
      mobileSurface: "shopping",
    };
  }

  if (restore === "recipebook-tab" || returnSurface === "mypage.recipebooks") {
    return {
      activeTab: "recipebooks",
      mobileSurface: "recipebook",
    };
  }

  return DEFAULT_MYPAGE_STATE;
}
