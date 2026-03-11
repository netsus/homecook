import { NextResponse } from "next/server";

import type { ApiError, ApiResponse } from "@/types/api";

export function ok<T>(data: T, init?: ResponseInit) {
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
