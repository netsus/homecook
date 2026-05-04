export function isYoutubeImportEnabled() {
  return (
    process.env.NODE_ENV !== "production"
    || process.env.HOMECOOK_ENABLE_YOUTUBE_IMPORT === "1"
    || process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT === "1"
    || process.env.HOMECOOK_ENABLE_QA_FIXTURES === "1"
  );
}
