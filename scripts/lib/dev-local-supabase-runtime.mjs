import path from "node:path";

export function buildLocalSupabaseNextDevArgs(nextArgs = []) {
  return ["exec", "next", "dev", "--turbopack", ...nextArgs];
}

export function getLocalSupabaseNextArtifactsToReset(cwd) {
  return [path.join(cwd, ".next")];
}

export function toLocalSupabaseNextEnvFileContent(env) {
  return [
    `NEXT_PUBLIC_SUPABASE_URL=${env.NEXT_PUBLIC_SUPABASE_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${env.SUPABASE_SERVICE_ROLE_KEY}`,
    env.YOUTUBE_API_KEY ? `YOUTUBE_API_KEY=${env.YOUTUBE_API_KEY}` : null,
    env.HOMECOOK_ENABLE_YOUTUBE_IMPORT
      ? `HOMECOOK_ENABLE_YOUTUBE_IMPORT=${env.HOMECOOK_ENABLE_YOUTUBE_IMPORT}`
      : null,
    env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT
      ? `NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT=${env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT}`
      : null,
    `NEXT_PUBLIC_APP_URL=${env.NEXT_PUBLIC_APP_URL}`,
    "HOMECOOK_ENABLE_LOCAL_DEV_AUTH=1",
    "NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH=1",
    `NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH=${env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH ?? "0"}`,
    "",
  ].filter((line) => line !== null).join("\n");
}
