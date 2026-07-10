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

  const normalizedIdentities = identities
    .map((identity) => ({
      provider: normalizeAuthProviderId(identity.provider),
      timestamp: parseTimestamp(identity.last_sign_in_at),
    }))
    .filter((identity) => identity.provider !== null);

  if (!normalizedIdentities.some((identity) => identity.provider === attemptedProvider)) {
    return null;
  }

  if (normalizedIdentities.length === 1) {
    return normalizedIdentities[0]?.provider === attemptedProvider
      ? attemptedProvider
      : null;
  }

  if (normalizedIdentities.some((identity) => identity.timestamp === null)) {
    return null;
  }

  const latestTimestamp = Math.max(
    ...normalizedIdentities.map((identity) => identity.timestamp as number),
  );
  const latestIdentities = normalizedIdentities.filter(
    (identity) => identity.timestamp === latestTimestamp,
  );

  return latestIdentities.length === 1
    && latestIdentities[0]?.provider === attemptedProvider
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
