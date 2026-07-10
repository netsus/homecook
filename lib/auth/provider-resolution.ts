import {
  normalizeAuthProviderId,
  type AuthProviderId,
} from "@/lib/auth/providers";

export interface AuthIdentityEvidence {
  provider?: unknown;
  last_sign_in_at?: unknown;
  identity_data?: unknown;
}

interface ResolveActualAuthProviderInput {
  queryAttempt: unknown;
  cookieAttempt: unknown;
  identities: AuthIdentityEvidence[] | null | undefined;
}

function parseTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function resolveActualAuthProvider({
  queryAttempt,
  cookieAttempt,
  identities,
}: ResolveActualAuthProviderInput): AuthProviderId | null {
  const queryProvider = normalizeAuthProviderId(queryAttempt);
  const cookieProvider = normalizeAuthProviderId(cookieAttempt);

  if (queryProvider && cookieProvider && queryProvider !== cookieProvider) {
    return null;
  }

  const attemptedProvider = queryProvider ?? cookieProvider;
  if (!attemptedProvider || !identities?.length) {
    return null;
  }

  const matchingIdentities = identities.filter(
    (identity) => normalizeAuthProviderId(identity.provider) === attemptedProvider,
  );

  if (matchingIdentities.length === 1) {
    return attemptedProvider;
  }

  const timestamps = matchingIdentities.map((identity) => parseTimestamp(identity.last_sign_in_at));
  if (timestamps.length === 0 || timestamps.some((timestamp) => timestamp === null)) {
    return null;
  }

  const latestTimestamp = Math.max(...timestamps as number[]);
  return timestamps.filter((timestamp) => timestamp === latestTimestamp).length === 1
    ? attemptedProvider
    : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function hasExplicitlyInvalidEmailEvidence(
  identities: AuthIdentityEvidence[] | null | undefined,
  provider: AuthProviderId,
) {
  return identities?.some((identity) => {
    if (normalizeAuthProviderId(identity.provider) !== provider) {
      return false;
    }

    const metadata = asRecord(identity.identity_data);
    return metadata.email_verified === false
      || metadata.is_email_verified === false
      || metadata.is_email_valid === false;
  }) ?? false;
}

export function hasVerifiedEmailEvidence({
  identities,
  provider,
  userEmailConfirmedAt,
  userMetadata,
}: {
  identities: AuthIdentityEvidence[] | null | undefined;
  provider: AuthProviderId;
  userEmailConfirmedAt: unknown;
  userMetadata: unknown;
}) {
  const metadata = asRecord(userMetadata);
  if (
    metadata.email_verified === false
    || metadata.is_email_verified === false
    || metadata.is_email_valid === false
  ) {
    return false;
  }

  if (typeof userEmailConfirmedAt === "string" && userEmailConfirmedAt.trim()) {
    return true;
  }

  if (
    metadata.email_verified === true
    || metadata.is_email_verified === true
  ) {
    return true;
  }

  return identities?.some((identity) => {
    if (normalizeAuthProviderId(identity.provider) !== provider) {
      return false;
    }

    const identityMetadata = asRecord(identity.identity_data);
    return identityMetadata.email_verified === true
      || identityMetadata.is_email_verified === true;
  }) ?? false;
}

export function hasProviderIdentity(
  identities: AuthIdentityEvidence[] | null | undefined,
  provider: AuthProviderId,
) {
  return identities?.some(
    (identity) => normalizeAuthProviderId(identity.provider) === provider,
  ) ?? false;
}
