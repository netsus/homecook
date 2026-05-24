import { describe, expect, it, vi } from "vitest";

import type { ApiResponse } from "@/types/api";
import type {
  YoutubeIngredientRegistrationBody,
  YoutubeIngredientRegistrationData,
} from "@/types/recipe";
import { registerYoutubeIngredientsBulk } from "@/lib/api/youtube-import";

function makeSuccessResponse(
  ingredientId: string,
  standardName: string,
): ApiResponse<YoutubeIngredientRegistrationData> {
  return {
    success: true,
    data: {
      ingredient: {
        ingredient_id: ingredientId,
        standard_name: standardName,
        category: "양념",
        default_unit: null,
        resolution_status: "resolved",
      },
      synonym_status: "attached",
      warnings: [],
    },
    error: null,
  };
}

function makeErrorResponse(
  code: string,
  message: string,
): ApiResponse<YoutubeIngredientRegistrationData> {
  return {
    success: false,
    data: null,
    error: { code, message, fields: [] },
  };
}

function makeRow(tempId: string, standardName: string) {
  return {
    tempId,
    body: {
      extraction_id: "ext-1",
      draft_ingredient_id: `draft-${tempId}`,
      standard_name: standardName,
      category: "양념" as const,
      default_unit: null,
      synonym: null,
    },
  };
}

function createMockRegister() {
  return vi.fn<
    (body: YoutubeIngredientRegistrationBody) => Promise<ApiResponse<YoutubeIngredientRegistrationData>>
  >();
}

describe("registerYoutubeIngredientsBulk", () => {
  it("calls register sequentially for each row", async () => {
    const mockRegister = createMockRegister();
    const callOrder: string[] = [];
    mockRegister.mockImplementation(async (body) => {
      callOrder.push(body.standard_name);
      return makeSuccessResponse(`ing-${body.standard_name}`, body.standard_name);
    });

    const rows = [makeRow("r1", "A"), makeRow("r2", "B")];
    const result = await registerYoutubeIngredientsBulk(
      rows,
      undefined,
      mockRegister,
    );

    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(["A", "B"]);
    expect(result.sessionExpired).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe("success");
    expect(result.results[1].status).toBe("success");
  });

  it("isolates per-row failure without blocking subsequent rows", async () => {
    const mockRegister = createMockRegister();
    mockRegister
      .mockResolvedValueOnce(makeErrorResponse("VALIDATION_ERROR", "이름이 비어있어요"))
      .mockResolvedValueOnce(makeSuccessResponse("ing-2", "B"))
      .mockResolvedValueOnce(makeSuccessResponse("ing-3", "C"));

    const rows = [makeRow("r1", "A"), makeRow("r2", "B"), makeRow("r3", "C")];
    const result = await registerYoutubeIngredientsBulk(
      rows,
      undefined,
      mockRegister,
    );

    expect(result.sessionExpired).toBe(false);
    expect(result.results[0]).toMatchObject({
      tempId: "r1",
      status: "error",
      errorCode: "VALIDATION_ERROR",
    });
    expect(result.results[1]).toMatchObject({
      tempId: "r2",
      status: "success",
      data: expect.objectContaining({
        ingredient: expect.objectContaining({ ingredient_id: "ing-2" }),
      }),
    });
    expect(result.results[2]).toMatchObject({
      tempId: "r3",
      status: "success",
    });
  });

  it("aborts remaining rows on SESSION_EXPIRED (410)", async () => {
    const mockRegister = createMockRegister();
    mockRegister
      .mockResolvedValueOnce(makeSuccessResponse("ing-1", "A"))
      .mockResolvedValueOnce(makeErrorResponse("SESSION_EXPIRED", "세션 만료"));

    const rows = [
      makeRow("r1", "A"),
      makeRow("r2", "B"),
      makeRow("r3", "C"),
      makeRow("r4", "D"),
    ];
    const result = await registerYoutubeIngredientsBulk(
      rows,
      undefined,
      mockRegister,
    );

    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(result.sessionExpired).toBe(true);
    expect(result.results[0]).toMatchObject({ tempId: "r1", status: "success" });
    expect(result.results[1]).toMatchObject({
      tempId: "r2",
      status: "error",
      errorCode: "SESSION_EXPIRED",
    });
    expect(result.results[2]).toMatchObject({
      tempId: "r3",
      status: "skipped",
      errorCode: "SESSION_EXPIRED",
    });
    expect(result.results[3]).toMatchObject({
      tempId: "r4",
      status: "skipped",
      errorCode: "SESSION_EXPIRED",
    });
  });

  it("calls onRowComplete callback for each row in sequence", async () => {
    const mockRegister = createMockRegister();
    mockRegister
      .mockResolvedValueOnce(makeSuccessResponse("ing-1", "A"))
      .mockResolvedValueOnce(makeErrorResponse("CONFLICT", "충돌"))
      .mockResolvedValueOnce(makeSuccessResponse("ing-3", "C"));

    const rows = [makeRow("r1", "A"), makeRow("r2", "B"), makeRow("r3", "C")];
    const callbacks: Array<{ tempId: string; index: number }> = [];

    await registerYoutubeIngredientsBulk(
      rows,
      (result, index) => {
        callbacks.push({ tempId: result.tempId, index });
      },
      mockRegister,
    );

    expect(callbacks).toEqual([
      { tempId: "r1", index: 0 },
      { tempId: "r2", index: 1 },
      { tempId: "r3", index: 2 },
    ]);
  });

  it("preserves partial success after session expiry", async () => {
    const mockRegister = createMockRegister();
    mockRegister
      .mockResolvedValueOnce(makeSuccessResponse("ing-1", "A"))
      .mockResolvedValueOnce(makeSuccessResponse("ing-2", "B"))
      .mockResolvedValueOnce(makeErrorResponse("SESSION_EXPIRED", "만료"));

    const rows = [
      makeRow("r1", "A"),
      makeRow("r2", "B"),
      makeRow("r3", "C"),
      makeRow("r4", "D"),
    ];
    const result = await registerYoutubeIngredientsBulk(
      rows,
      undefined,
      mockRegister,
    );

    const successResults = result.results.filter((r) => r.status === "success");
    expect(successResults).toHaveLength(2);
    expect(successResults[0].data?.ingredient.ingredient_id).toBe("ing-1");
    expect(successResults[1].data?.ingredient.ingredient_id).toBe("ing-2");

    expect(result.results[2].status).toBe("error");
    expect(result.results[3].status).toBe("skipped");
    expect(result.sessionExpired).toBe(true);
  });

  it("handles empty rows array", async () => {
    const mockRegister = createMockRegister();
    const result = await registerYoutubeIngredientsBulk(
      [],
      undefined,
      mockRegister,
    );

    expect(mockRegister).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(0);
    expect(result.sessionExpired).toBe(false);
  });

  it("handles single row", async () => {
    const mockRegister = createMockRegister();
    mockRegister.mockResolvedValueOnce(makeSuccessResponse("ing-1", "감자"));

    const rows = [makeRow("r1", "감자")];
    const result = await registerYoutubeIngredientsBulk(
      rows,
      undefined,
      mockRegister,
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      tempId: "r1",
      status: "success",
      data: expect.objectContaining({
        ingredient: expect.objectContaining({ standard_name: "감자" }),
      }),
    });
  });
});
