/** Preparation also blocks social auth and unfinished food detail. Release verification is required before setting NEXT_PUBLIC_PRELAUNCH_UI=false and rebuilding. */
export function isPrelaunchUiEnabled() {
  return process.env.NEXT_PUBLIC_PRELAUNCH_UI !== "false";
}

/** Keep prelaunch presentation visible in QA while opening deterministic fixture flows. */
export function isPrelaunchFeatureLocked() {
  return isPrelaunchUiEnabled()
    && process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES !== "1"
    && process.env.HOMECOOK_ENABLE_QA_FIXTURES !== "1";
}
