export const MISSING_LEGAL_VALUE = "";

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
    childAccountPolicy:
      readPublicEnv("NEXT_PUBLIC_LEGAL_CHILD_ACCOUNT_POLICY") ?? MISSING_LEGAL_VALUE,
    complaintDepartment:
      readPublicEnv("NEXT_PUBLIC_PRIVACY_COMPLAINT_DEPARTMENT") ?? MISSING_LEGAL_VALUE,
    complaintDepartmentContact:
      readPublicEnv("NEXT_PUBLIC_PRIVACY_COMPLAINT_CONTACT") ?? privacyOfficerContact,
    contactEmail,
    effectiveDate:
      readPublicEnv("NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE") ?? MISSING_LEGAL_VALUE,
    operatorName:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OPERATOR_NAME") ?? MISSING_LEGAL_VALUE,
    overseasTransferCountry:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER_COUNTRY") ?? MISSING_LEGAL_VALUE,
    overseasTransferItems:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER_ITEMS") ?? MISSING_LEGAL_VALUE,
    overseasTransferLegalBasis:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER_LEGAL_BASIS") ?? MISSING_LEGAL_VALUE,
    overseasTransferMethod:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER_METHOD") ?? MISSING_LEGAL_VALUE,
    overseasTransferPurpose:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER_PURPOSE") ?? MISSING_LEGAL_VALUE,
    overseasTransferRecipient:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER_RECIPIENT") ?? MISSING_LEGAL_VALUE,
    overseasTransferRecipientContact:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER_CONTACT") ?? MISSING_LEGAL_VALUE,
    overseasTransferRetention:
      readPublicEnv("NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER_RETENTION") ?? MISSING_LEGAL_VALUE,
    privacyOfficerContact,
    privacyOfficerName:
      readPublicEnv("NEXT_PUBLIC_PRIVACY_OFFICER_NAME") ?? MISSING_LEGAL_VALUE,
    processingConsignment:
      readPublicEnv("NEXT_PUBLIC_LEGAL_PROCESSING_CONSIGNMENT") ?? MISSING_LEGAL_VALUE,
    processingConsignmentWork:
      readPublicEnv("NEXT_PUBLIC_LEGAL_PROCESSING_CONSIGNMENT_WORK") ?? MISSING_LEGAL_VALUE,
    serviceName: "무엇을 먹든",
    thirdPartySharing:
      readPublicEnv("NEXT_PUBLIC_LEGAL_THIRD_PARTY_SHARING") ?? MISSING_LEGAL_VALUE,
    thirdPartySharingItems:
      readPublicEnv("NEXT_PUBLIC_LEGAL_THIRD_PARTY_SHARING_ITEMS") ?? MISSING_LEGAL_VALUE,
    thirdPartySharingPurpose:
      readPublicEnv("NEXT_PUBLIC_LEGAL_THIRD_PARTY_SHARING_PURPOSE") ?? MISSING_LEGAL_VALUE,
    thirdPartySharingRetention:
      readPublicEnv("NEXT_PUBLIC_LEGAL_THIRD_PARTY_SHARING_RETENTION") ?? MISSING_LEGAL_VALUE,
  };
}
