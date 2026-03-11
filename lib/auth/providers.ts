export const AUTH_PROVIDER_META = {
  kakao: {
    label: "카카오로 시작하기",
    className: "bg-[#FEE500] text-[#181600]",
  },
  naver: {
    label: "네이버로 시작하기",
    className: "bg-[#03C75A] text-white",
  },
  google: {
    label: "Google로 시작하기",
    className: "border border-black/10 bg-white text-[#2c2c2c]",
  },
} as const;

export type AuthProviderId = keyof typeof AUTH_PROVIDER_META;

const DEFAULT_PROVIDERS: AuthProviderId[] = ["google"];

export function getEnabledAuthProviders() {
  const raw = process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS;

  if (!raw) {
    return DEFAULT_PROVIDERS;
  }

  const providers = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is AuthProviderId => value in AUTH_PROVIDER_META);

  return providers.length ? providers : DEFAULT_PROVIDERS;
}
