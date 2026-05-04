export interface LocalDevAuthAccount {
  id: "main" | "other";
  email: string;
  password: string;
  nickname: string;
  buttonLabel: string;
  helperText: string;
}

const LOCAL_DEV_AUTH_ACCOUNTS: LocalDevAuthAccount[] = [
  {
    id: "main",
    email: "local-tester@homecook.local",
    password: "homecook-local-dev",
    nickname: "로컬 테스트 계정",
    buttonLabel: "로컬 테스트 계정으로 시작",
    helperText: "기본 저장/좋아요/플래너 데모 데이터가 연결된 메인 계정",
  },
  {
    id: "other",
    email: "local-other@homecook.local",
    password: "homecook-local-peer",
    nickname: "로컬 다른 유저",
    buttonLabel: "다른 테스트 계정으로 시작",
    helperText: "소유권과 다른 유저 데이터 경계를 확인할 때 쓰는 보조 계정",
  },
];

function isLocalSupabaseUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname;

    if (hostname === "127.0.0.1" || hostname === "localhost") {
      return true;
    }

    const octets = hostname.split(".").map((part) => Number(part));

    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return false;
    }

    const [first, second] = octets;

    return first === 10
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
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

export function isLocalGoogleOAuthEnabled() {
  return isLocalDevAuthEnabled()
    && process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH === "1";
}

export function getLocalDevAuthAccounts() {
  return LOCAL_DEV_AUTH_ACCOUNTS.map((account) => ({ ...account }));
}

export function getLocalDevAuthCredentials(accountId: LocalDevAuthAccount["id"] = "main") {
  const account = LOCAL_DEV_AUTH_ACCOUNTS.find((item) => item.id === accountId)
    ?? LOCAL_DEV_AUTH_ACCOUNTS[0];

  return {
    email: account.email,
    password: account.password,
    nickname: account.nickname,
  };
}
