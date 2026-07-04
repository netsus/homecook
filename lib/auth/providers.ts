import type { Provider } from "@supabase/supabase-js";

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

const DEFAULT_PROVIDERS: AuthProviderId[] = ["kakao", "naver", "google"];
const DEFAULT_NAVER_SUPABASE_PROVIDER: Extract<Provider, `custom:${string}`> =
  "custom:naver";

export function parseEnabledAuthProviders(raw?: string | null) {
  if (!raw) {
    return DEFAULT_PROVIDERS;
  }

  const providers = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is AuthProviderId => value in AUTH_PROVIDER_META);

  return providers.length ? providers : DEFAULT_PROVIDERS;
}

export function getEnabledAuthProviders() {
  return parseEnabledAuthProviders(
    process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS,
  );
}

export function getSupabaseAuthProvider(provider: AuthProviderId): Provider {
  if (provider === "naver") {
    return getNaverSupabaseProvider();
  }

  return provider;
}

function getNaverSupabaseProvider() {
  const configuredProvider = process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER
    ?.trim();

  if (configuredProvider?.startsWith("custom:")) {
    return configuredProvider as Extract<Provider, `custom:${string}`>;
  }

  return DEFAULT_NAVER_SUPABASE_PROVIDER;
}
