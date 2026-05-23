export function isQaFixtureClientModeEnabled() {
  return process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES === "1";
}
