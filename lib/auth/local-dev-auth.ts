const DEFAULT_LOCAL_DEV_AUTH_EMAIL = "local-tester@homecook.local";
const DEFAULT_LOCAL_DEV_AUTH_PASSWORD = "homecook-local-dev";
const DEFAULT_LOCAL_DEV_AUTH_NICKNAME = "로컬 테스트 계정";

function isLocalSupabaseUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function isLocalDevAuthEnabled() {
  return (
    process.env.NODE_ENV !== "production"
    && process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH === "1"
    && isLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

export function getLocalDevAuthCredentials() {
  return {
    email: DEFAULT_LOCAL_DEV_AUTH_EMAIL,
    password: DEFAULT_LOCAL_DEV_AUTH_PASSWORD,
    nickname: DEFAULT_LOCAL_DEV_AUTH_NICKNAME,
  };
}
