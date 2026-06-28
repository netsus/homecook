export const HOMECOOK_GAMIFICATION_REFRESH_EVENT =
  "homecook:gamification-refresh";
export const HOMECOOK_GAMIFICATION_OPEN_NOTIFICATIONS_EVENT =
  "homecook:gamification-open-notifications";
export const ONBOARDING_TUTORIAL_REFRESH_KEY =
  "homecook:onboarding-tutorial-refresh";

export function notifyGamificationSourceAction() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(HOMECOOK_GAMIFICATION_REFRESH_EVENT));
}

export function notifyGamificationSourceActionAfter(delayMs: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.setTimeout(() => {
    notifyGamificationSourceAction();
  }, delayMs);
}
