import {
  HYBRID_PUBLIC_READ_SCOPES,
  HYBRID_PUBLIC_ROUTE_CONTRACTS,
  isAnonymousHybridPublicReadRequest as checkAnonymousHybridPublicReadRequest,
} from "./public-read-policy-runtime.mjs";

export type HybridPublicReadScope =
  | "cooking-methods"
  | "ingredients"
  | "recipe-cook-mode"
  | "recipe-detail"
  | "recipe-themes"
  | "recipes"
  | "tags";

export interface HybridPublicReadRequest {
  scope: HybridPublicReadScope;
  method: string;
  path: string;
  search?: string;
  body?: unknown;
}

export const PUBLIC_HYBRID_READ_SCOPES =
  HYBRID_PUBLIC_READ_SCOPES as ReadonlySet<HybridPublicReadScope>;
export const PUBLIC_HYBRID_ROUTE_CONTRACTS =
  HYBRID_PUBLIC_ROUTE_CONTRACTS as ReadonlyArray<{
    endpoint: string;
    file: string;
    method: "GET";
    scope: HybridPublicReadScope;
  }>;

export function isAnonymousHybridPublicReadRequest(
  input: HybridPublicReadRequest,
) {
  return checkAnonymousHybridPublicReadRequest({
    ...input,
    body: input.body,
  });
}
