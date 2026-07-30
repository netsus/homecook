import { NextResponse } from "next/server";

import type { ApiError, ApiResponse } from "@/types/api";
import {
  consumeHybridAuthorityFailure,
  type HybridAuthorityPublicCode,
} from "@/lib/server/hybrid-auth/route-error-context";

const HYBRID_AUTHORITY_RESPONSES: Record<
  HybridAuthorityPublicCode,
  { message: string; status: number }
> = {
  ACCOUNT_LIFECYCLE_MAINTENANCE: {
    message: "계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요.",
    status: 503,
  },
  ACCOUNT_SESSION_STALE: {
    message: "세션을 다시 확인해 주세요.",
    status: 409,
  },
};

function hybridAuthorityFailureResponse() {
  const code = consumeHybridAuthorityFailure();
  if (!code) {
    return null;
  }
  const contract = HYBRID_AUTHORITY_RESPONSES[code];
  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error: {
      code,
      message: contract.message,
      fields: [],
    },
  };
  return NextResponse.json(body, { status: contract.status });
}

export function ok<T>(data: T, init?: ResponseInit) {
  const authorityFailure = hybridAuthorityFailureResponse();
  if (authorityFailure) {
    return authorityFailure;
  }
  const body: ApiResponse<T> = {
    success: true,
    data,
    error: null,
  };

  return NextResponse.json(body, init);
}

export function fail(
  code: string,
  message: string,
  status: number,
  fields: ApiError["fields"] = [],
) {
  const authorityFailure = hybridAuthorityFailureResponse();
  if (authorityFailure) {
    return authorityFailure;
  }
  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error: {
      code,
      message,
      fields,
    },
  };

  return NextResponse.json(body, { status });
}
