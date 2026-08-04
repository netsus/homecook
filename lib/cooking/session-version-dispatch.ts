export type CookingSessionIdentity = {
  session_id: string;
  contract_version: "legacy_v1" | "snapshot_v2";
};

export function getCookingSessionCookModeHref(identity: CookingSessionIdentity) {
  if (!identity.contract_version) {
    throw new Error("contract_version is required for cooking dispatch");
  }
  if (identity.contract_version === "legacy_v1") {
    return `/cooking/sessions/${identity.session_id}/cook-mode`;
  }
  if (identity.contract_version === "snapshot_v2") {
    return `/cooking/session-attempts/${identity.session_id}/cook-mode`;
  }
  throw new Error("unsupported contract_version");
}
