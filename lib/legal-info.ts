export const MISSING_LEGAL_VALUE = "운영 정보 확인 필요";

function readPublicEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

export function getPublicSiteOrigin() {
  const explicitUrl =
    readPublicEnv("NEXT_PUBLIC_SITE_URL") ??
    readPublicEnv("NEXT_PUBLIC_APP_URL");
  const vercelHost =
    readPublicEnv("VERCEL_PROJECT_PRODUCTION_URL") ??
    readPublicEnv("VERCEL_URL");
  const raw = explicitUrl ?? (vercelHost
    ? vercelHost.startsWith("http://") || vercelHost.startsWith("https://")
      ? vercelHost
      : `https://${vercelHost}`
    : "http://localhost:3000");

  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function getLegalInfo() {
  const contactEmail =
    readPublicEnv("NEXT_PUBLIC_SERVICE_CONTACT_EMAIL") ?? MISSING_LEGAL_VALUE;
  const privacyOfficerContact =
    readPublicEnv("NEXT_PUBLIC_PRIVACY_OFFICER_CONTACT") ?? contactEmail;

  return {
    contactEmail,
    effectiveDate:
      readPublicEnv("NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE") ?? MISSING_LEGAL_VALUE,
    operatorName:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OPERATOR_NAME") ?? MISSING_LEGAL_VALUE,
    overseasTransfer:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER") ?? MISSING_LEGAL_VALUE,
    privacyOfficerContact,
    privacyOfficerName:
      readPublicEnv("NEXT_PUBLIC_PRIVACY_OFFICER_NAME") ?? MISSING_LEGAL_VALUE,
    processingConsignment:
      readPublicEnv("NEXT_PUBLIC_LEGAL_PROCESSING_CONSIGNMENT") ?? MISSING_LEGAL_VALUE,
    serviceName: "집밥",
    thirdPartySharing:
      readPublicEnv("NEXT_PUBLIC_LEGAL_THIRD_PARTY_SHARING") ?? MISSING_LEGAL_VALUE,
  };
}
