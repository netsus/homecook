import type { Provider } from "@supabase/supabase-js";

export const AUTH_PROVIDER_META = {
  kakao: {
    label: "카카오로 시작하기",
    displayName: "카카오",
    className: "bg-[#FEE500] text-[#181600]",
  },
  naver: {
    label: "네이버로 시작하기",
    displayName: "네이버",
    className: "bg-[#03C75A] text-white",
  },
  google: {
    label: "Google로 시작하기",
    displayName: "Google",
    className: "border border-black/10 bg-white text-[#2c2c2c]",
  },
} as const;

export type AuthProviderId = keyof typeof AUTH_PROVIDER_META;

const DEFAULT_PROVIDERS: AuthProviderId[] = ["kakao", "naver", "google"];
const LEGACY_GOOGLE_ONLY_PROVIDERS = "google";
const DEFAULT_KAKAO_SUPABASE_PROVIDER: Provider = "kakao";
const DEFAULT_NAVER_SUPABASE_PROVIDER: Extract<Provider, `custom:${string}`> =
  "custom:naver";

function isAuthProviderId(value: string): value is AuthProviderId {
  return Object.prototype.hasOwnProperty.call(AUTH_PROVIDER_META, value);
}

export function parseEnabledAuthProviders(raw?: string | null) {
  if (!raw) {
    return DEFAULT_PROVIDERS;
  }

  if (raw.trim().toLowerCase() === LEGACY_GOOGLE_ONLY_PROVIDERS) {
    return DEFAULT_PROVIDERS;
  }

  const providers = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(isAuthProviderId);

  return providers.length ? providers : DEFAULT_PROVIDERS;
}

export function getEnabledAuthProviders() {
  return parseEnabledAuthProviders(
    process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS,
  );
}

export function getSupabaseAuthProvider(provider: AuthProviderId): Provider {
  if (provider === "kakao") {
    return getKakaoSupabaseProvider();
  }

  if (provider === "naver") {
    return getNaverSupabaseProvider();
  }

  return provider;
}

export function normalizeAuthProviderId(value: unknown): AuthProviderId | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const provider = normalized.startsWith("custom:")
    ? normalized.slice("custom:".length)
    : normalized;

  if (isAuthProviderId(provider)) {
    return provider;
  }

  return null;
}

export function getAuthProviderDisplayName(provider: AuthProviderId) {
  return AUTH_PROVIDER_META[provider].displayName;
}

function getKakaoSupabaseProvider() {
  const configuredProvider = process.env.NEXT_PUBLIC_KAKAO_SUPABASE_PROVIDER
    ?.trim();

  if (configuredProvider?.startsWith("custom:")) {
    return configuredProvider as Extract<Provider, `custom:${string}`>;
  }

  return DEFAULT_KAKAO_SUPABASE_PROVIDER;
}

function getNaverSupabaseProvider() {
  const configuredProvider = process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER
    ?.trim();

  if (configuredProvider?.startsWith("custom:")) {
    return configuredProvider as Extract<Provider, `custom:${string}`>;
  }

  return DEFAULT_NAVER_SUPABASE_PROVIDER;
}
