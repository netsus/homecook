/** Preparation also blocks social auth and unfinished food detail. Release verification is required before setting NEXT_PUBLIC_PRELAUNCH_UI=false and rebuilding. */
export function isPrelaunchUiEnabled() {
  return process.env.NEXT_PUBLIC_PRELAUNCH_UI !== "false";
}
