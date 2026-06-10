export const HOMECOOK_GAMIFICATION_REFRESH_EVENT =
  "homecook:gamification-refresh";

export function notifyGamificationSourceAction() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(HOMECOOK_GAMIFICATION_REFRESH_EVENT));
}
