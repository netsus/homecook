import type { ApiError, ApiResponse } from "@/types/api";
import type {
  MarketingValidationRequestBody,
  MarketingValidationResponseData,
} from "@/types/marketing-validation";

const NETWORK_ERROR: ApiError = {
  code: "NETWORK_ERROR",
  message: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  fields: [],
};

const INVALID_RESPONSE: ApiError = {
  code: "INVALID_RESPONSE",
  message: "서버 응답을 해석하지 못했어요.",
  fields: [],
};

function invalidResponse<T>(): ApiResponse<T> {
  return {
    success: false,
    data: null,
    error: INVALID_RESPONSE,
  };
}

export async function postMarketingValidation(
  body: MarketingValidationRequestBody,
): Promise<ApiResponse<MarketingValidationResponseData>> {
  try {
    const response = await fetch(
      "/api/v1/marketing/validation",
      {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    let payload: ApiResponse<MarketingValidationResponseData>;
    try {
      payload = await response.json() as ApiResponse<MarketingValidationResponseData>;
    } catch {
      return invalidResponse();
    }

    if (!response.ok || !payload.success) {
      return {
        success: false,
        data: null,
        error: payload.error ?? INVALID_RESPONSE,
      };
    }

    return {
      success: true,
      data: payload.data,
      error: null,
    };
  } catch {
    return {
      success: false,
      data: null,
      error: NETWORK_ERROR,
    };
  }
}
