export const PROMOTION_AUTHORITY_SOURCE_CHANGED_PUBLIC_ERROR =
  "promotion_authority_source_changed: production promotion authority source changed.";

export function toPromotionAuthoritySourceError(error) {
  if (error instanceof Error
    && error.message === PROMOTION_AUTHORITY_SOURCE_CHANGED_PUBLIC_ERROR) {
    return error;
  }
  return new Error(PROMOTION_AUTHORITY_SOURCE_CHANGED_PUBLIC_ERROR, { cause: error });
}

export async function verifyPromotionAuthoritySafely(verifier, input) {
  try {
    return await verifier(input);
  } catch (error) {
    throw toPromotionAuthoritySourceError(error);
  }
}
