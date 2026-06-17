export const PRIMARY_WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export const PRIMARY_MOBILE_TAB_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이" },
] as const;

export type PrimaryNavId = (typeof PRIMARY_WEB_NAV_ITEMS)[number]["id"];

export interface SurfaceChromeRule {
  backFallbackHref?: string;
  mobileBottomTab: PrimaryNavId;
  primaryNavId: PrimaryNavId;
  showBack: boolean;
}

export const SURFACE_CHROME_RULES = {
  home: {
    mobileBottomTab: "home",
    primaryNavId: "home",
    showBack: false,
  },
  planner: {
    mobileBottomTab: "planner",
    primaryNavId: "planner",
    showBack: false,
  },
  pantry: {
    mobileBottomTab: "pantry",
    primaryNavId: "pantry",
    showBack: false,
  },
  mypage: {
    mobileBottomTab: "mypage",
    primaryNavId: "mypage",
    showBack: false,
  },
  "recipe.detail": {
    backFallbackHref: "/",
    mobileBottomTab: "home",
    primaryNavId: "home",
    showBack: true,
  },
  "recipebook.detail": {
    backFallbackHref: "/mypage?tab=recipebooks",
    mobileBottomTab: "mypage",
    primaryNavId: "mypage",
    showBack: true,
  },
  "shopping.flow": {
    backFallbackHref: "/planner",
    mobileBottomTab: "planner",
    primaryNavId: "planner",
    showBack: true,
  },
  "shopping.detail": {
    backFallbackHref: "/mypage?tab=shopping",
    mobileBottomTab: "mypage",
    primaryNavId: "mypage",
    showBack: true,
  },
  "recipe.create": {
    backFallbackHref: "/planner",
    mobileBottomTab: "planner",
    primaryNavId: "planner",
    showBack: true,
  },
  "planner.meal": {
    backFallbackHref: "/planner",
    mobileBottomTab: "planner",
    primaryNavId: "planner",
    showBack: true,
  },
  leftovers: {
    backFallbackHref: "/mypage",
    mobileBottomTab: "mypage",
    primaryNavId: "mypage",
    showBack: true,
  },
  settings: {
    backFallbackHref: "/mypage?tab=preferences",
    mobileBottomTab: "mypage",
    primaryNavId: "mypage",
    showBack: true,
  },
} as const satisfies Record<string, SurfaceChromeRule>;

export type SurfaceChromeKey = keyof typeof SURFACE_CHROME_RULES;

export function getSurfaceChromeRule(surface: SurfaceChromeKey) {
  return SURFACE_CHROME_RULES[surface];
}
