// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FoodProductCreateForm } from "@/components/planner/food-product-create-form";
import { FoodProductPicker } from "@/components/planner/food-product-picker";
import { PRODUCT_PLANNER_RETURN_CONTEXT_KEY } from "@/lib/planner/product-planner-return-context";
import type { FoodProductData, FoodProductListSource } from "@/types/food-product";

const fetchFoodProducts = vi.fn();
const createFoodProduct = vi.fn();
const updateFoodProduct = vi.fn();
const deleteFoodProduct = vi.fn();
const reportFoodProduct = vi.fn();

vi.mock("@/lib/api/food-product", () => ({
  fetchFoodProducts: (...args: unknown[]) => fetchFoodProducts(...args),
  createFoodProduct: (...args: unknown[]) => createFoodProduct(...args),
  updateFoodProduct: (...args: unknown[]) => updateFoodProduct(...args),
  deleteFoodProduct: (...args: unknown[]) => deleteFoodProduct(...args),
  reportFoodProduct: (...args: unknown[]) => reportFoodProduct(...args),
  isFoodProductApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as object),
}));

vi.mock("@/lib/api/product-planner-entry", () => ({
  createProductPlannerEntry: vi.fn(),
  isProductPlannerEntryApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as object),
}));

function createProduct(
  overrides: Partial<FoodProductData> = {},
): FoodProductData {
  return {
    id: "product-1",
    name: "플레인 요거트",
    brand: "무먹 식품",
    visibility: "public",
    source_type: "public_dataset",
    editable: false,
    nutrition_version_id: "version-1",
    basis_relations: [],
    nutrition: {
      basis: { amount: 100, unit: "g" },
      label_basis_text: null,
      values: {
        energy_kcal: {
          amount: 70,
          known_amount: null,
          status: "complete",
          display_mode: "total",
        },
        carbohydrate_g: {
          amount: 6,
          known_amount: null,
          status: "complete",
          display_mode: "total",
        },
        protein_g: {
          amount: 5,
          known_amount: null,
          status: "complete",
          display_mode: "total",
        },
        fat_g: {
          amount: 2,
          known_amount: null,
          status: "complete",
          display_mode: "total",
        },
        sodium_mg: {
          amount: 45,
          known_amount: null,
          status: "complete",
          display_mode: "total",
        },
      },
      calculation_status: "complete",
      calculation_quality: "direct",
      warnings: [],
      sources: [],
    },
    ...overrides,
  };
}

describe("community prepared food catalog picker", () => {
  beforeEach(() => {
    fetchFoodProducts.mockReset();
    createFoodProduct.mockReset();
    updateFoodProduct.mockReset();
    deleteFoodProduct.mockReset();
    reportFoodProduct.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("shows the official source filters and localized badges, and refetches with the selected source", async () => {
    fetchFoodProducts.mockImplementation(
      async ({ source = "all" }: { source?: FoodProductListSource }) => {
        if (source === "manual") {
          return {
            items: [
              createProduct({
                id: "manual-public",
                name: "공유 두유",
                source_type: "manual",
                visibility: "public",
              }),
              createProduct({
                id: "manual-private",
                name: "비공개 그래놀라",
                source_type: "manual",
                visibility: "private",
                editable: true,
              }),
            ],
            next_cursor: null,
            has_next: false,
          };
        }

        return {
          items: [
            createProduct({
              id: "public-dataset",
              name: "공공 요거트",
              source_type: "public_dataset",
              visibility: "public",
            }),
            createProduct({
              id: "manual-public",
              name: "공유 두유",
              source_type: "manual",
              visibility: "public",
            }),
            createProduct({
              id: "manual-private",
              name: "비공개 그래놀라",
              source_type: "manual",
              visibility: "private",
              editable: true,
            }),
          ],
          next_cursor: null,
          has_next: false,
        };
      },
    );

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    expect(await screen.findByRole("button", { name: "전체" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "공공 영양DB" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "사용자 등록" })).toBeTruthy();

    expect(screen.getAllByText("공공 영양DB").length).toBeGreaterThan(0);
    expect(screen.getAllByText("사용자 등록").length).toBeGreaterThan(0);
    expect(screen.getByText("비공개 보관")).toBeTruthy();

    const resultGrid = screen.getByRole("button", { name: "공공 요거트 선택" }).parentElement?.parentElement;
    expect(resultGrid?.className).toContain("grid-cols-1");
    expect(resultGrid?.className).toContain("sm:grid-cols-2");

    await userEvent.click(screen.getByRole("button", { name: "사용자 등록" }));

    await waitFor(() =>
      expect(fetchFoodProducts).toHaveBeenLastCalledWith({
        q: "",
        source: "manual",
        limit: 20,
      }),
    );
    expect(screen.queryByText("공공 요거트")).toBeNull();
    expect(screen.getByText("공유 두유")).toBeTruthy();
    expect(screen.getByText("비공개 그래놀라")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "목록에 없나요? 새 완제품 등록" })).toBeNull();
  });

  it("shows 100g or 100mL comparison first when the product has a direct comparable basis, and keeps legacy serving/package as not comparable otherwise", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [
        createProduct({
          id: "label-40g",
          name: "라벨 40g 시리얼",
          nutrition: {
            ...createProduct().nutrition,
            basis: { amount: 40, unit: "g" },
            label_basis_text: "1회(40g)",
            values: {
              ...createProduct().nutrition.values,
              energy_kcal: { amount: 180, known_amount: null, status: "complete", display_mode: "total" },
            },
          },
        }),
        createProduct({
          id: "label-190ml",
          name: "라벨 190mL 두유",
          nutrition: {
            ...createProduct().nutrition,
            basis: { amount: 190, unit: "ml" },
            label_basis_text: "1팩(190mL)",
            values: {
              ...createProduct().nutrition.values,
              energy_kcal: { amount: 99, known_amount: null, status: "complete", display_mode: "total" },
            },
          },
        }),
        createProduct({
          id: "relation-serving",
          name: "직접 관계 견과",
          visibility: "private",
          source_type: "manual",
          editable: true,
          basis_relations: [
            { from: { amount: 1, unit: "serving" }, to: { amount: 30, unit: "g" } },
          ],
          nutrition: {
            ...createProduct().nutrition,
            basis: { amount: 1, unit: "serving" },
            label_basis_text: "1회(30g)",
            values: {
              ...createProduct().nutrition.values,
              energy_kcal: { amount: 150, known_amount: null, status: "complete", display_mode: "total" },
            },
          },
        }),
        createProduct({
          id: "legacy-no-relation",
          name: "관계 없는 기존 간식",
          visibility: "private",
          source_type: "manual",
          editable: true,
          basis_relations: [],
          nutrition: {
            ...createProduct().nutrition,
            basis: { amount: 1, unit: "serving" },
            label_basis_text: "1회(1개)",
          },
        }),
      ],
      next_cursor: null,
      has_next: false,
    });

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    expect((await screen.findAllByText("100g 기준")).length).toBeGreaterThan(0);
    expect(screen.getByText("100mL 기준")).toBeTruthy();
    expect(screen.getByText("100g/100mL 비교 불가")).toBeTruthy();
    expect(screen.getByText("기준 1회")).toBeTruthy();
    expect(screen.getByText("라벨 1회(40g)")).toBeTruthy();
    expect(screen.getByText("라벨 1팩(190mL)")).toBeTruthy();
  });

  it("shows owner edit/delete actions with product-specific names and closes the delete dialog on escape back to the trigger", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [
        createProduct({
          id: "owner-manual",
          name: "내 그래놀라",
          source_type: "manual",
          visibility: "public",
          editable: true,
        }),
      ],
      next_cursor: null,
      has_next: false,
    });

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    const deleteButton = await screen.findByRole("button", { name: "내 그래놀라 삭제" });
    expect(screen.getByRole("button", { name: "내 그래놀라 수정" })).toBeTruthy();
    await userEvent.click(deleteButton);
    expect(screen.getByText('"내 그래놀라" 제품을 삭제할까요?')).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText('"내 그래놀라" 제품을 삭제할까요?')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(deleteButton));
  });

  it("stores a safe edit auth return and reopens the same product edit after login restore", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [
        createProduct({
          id: "owner-manual",
          name: "내 그래놀라",
          brand: "집밥 공방",
          source_type: "manual",
          visibility: "public",
          editable: true,
        }),
      ],
      next_cursor: null,
      has_next: false,
    });
    updateFoodProduct.mockRejectedValue(
      Object.assign(new Error("로그인이 필요해요."), {
        status: 401,
        code: "UNAUTHORIZED",
        fields: [],
      }),
    );

    const user = userEvent.setup();
    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "내 그래놀라 수정" }));
    const nameInput = screen.getByRole("textbox", { name: /제품명/ });
    await user.clear(nameInput);
    await user.type(nameInput, "로그인 복원 그래놀라");
    await user.click(screen.getByRole("button", { name: "변경 내용 저장" }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY)).not.toBeNull(),
    );
    expect(
      JSON.parse(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY) ?? "null"),
    ).toMatchObject({
      version: 1,
      kind: "create",
      planDate: "2026-07-18",
      columnId: "column-1",
      slotName: "아침",
      query: "",
      source: "all",
      productId: "owner-manual",
      action: "edit",
      draft: {
        name: "로그인 복원 그래놀라",
        brand: "집밥 공방",
      },
    });

    cleanup();

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    expect(await screen.findByRole("heading", { name: "사용자 등록 제품 수정" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /제품명/ }) as HTMLInputElement).value).toBe(
      "로그인 복원 그래놀라",
    );
    expect(screen.queryByRole("button", { name: "등록하고 선택" })).toBeNull();
    expect(screen.getByRole("button", { name: "변경 내용 저장" })).toBeTruthy();
  });

  it("continues pagination until a restored edit product is found and reopens that edit draft", async () => {
    window.sessionStorage.setItem(
      PRODUCT_PLANNER_RETURN_CONTEXT_KEY,
      JSON.stringify({
        version: 1,
        kind: "create",
        planDate: "2026-07-18",
        columnId: "column-1",
        slotName: "아침",
        query: "",
        source: "manual",
        productId: "later-manual",
        action: "edit",
        draft: {
          name: "후속 페이지 그래놀라",
          brand: "집밥 공방",
          basisAmount: "100",
          basisUnit: "g",
          labelBasisText: "",
          energy: "180",
          nutrients: {},
        },
      }),
    );
    fetchFoodProducts
      .mockResolvedValueOnce({
        items: [
          createProduct({
            id: "first-page-manual",
            name: "첫 페이지 제품",
            source_type: "manual",
            visibility: "public",
            editable: true,
          }),
        ],
        next_cursor: "manual-next",
        has_next: true,
      })
      .mockResolvedValueOnce({
        items: [
          createProduct({
            id: "later-manual",
            name: "후속 페이지 원본",
            source_type: "manual",
            visibility: "public",
            editable: true,
          }),
        ],
        next_cursor: null,
        has_next: false,
      });

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    await waitFor(() => expect(fetchFoodProducts).toHaveBeenCalledTimes(2));
    expect(fetchFoodProducts).toHaveBeenNthCalledWith(1, {
      q: "",
      source: "manual",
      limit: 20,
    });
    expect(fetchFoodProducts).toHaveBeenNthCalledWith(2, {
      q: "",
      source: "manual",
      cursor: "manual-next",
      limit: 20,
    });
    expect(await screen.findByRole("heading", { name: "사용자 등록 제품 수정" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /제품명/ }) as HTMLInputElement).value).toBe(
      "후속 페이지 그래놀라",
    );
  });

  it("shows report only for other shared manual products with six reasons and maps duplicate to the official copy", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [
        createProduct({
          id: "other-public",
          name: "공유 두유",
          source_type: "manual",
          visibility: "public",
          editable: false,
        }),
        createProduct({
          id: "dataset",
          name: "공공 제품",
          source_type: "public_dataset",
          visibility: "public",
          editable: false,
        }),
      ],
      next_cursor: null,
      has_next: false,
    });
    reportFoodProduct.mockRejectedValue(
      Object.assign(new Error("이미 신고한 제품이에요."), {
        status: 409,
        code: "PRODUCT_ALREADY_REPORTED",
        fields: [],
      }),
    );

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    expect(await screen.findByRole("button", { name: "공유 두유 신고" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "공공 제품 신고" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "공유 두유 신고" }));
    expect(screen.getByText('"공유 두유" 제품 신고')).toBeTruthy();
    expect(screen.getByLabelText("스팸·광고예요")).toBeTruthy();
    expect(screen.getByLabelText("영양 정보가 달라요")).toBeTruthy();
    expect(screen.getByLabelText("중복 제품이에요")).toBeTruthy();
    expect(screen.getByLabelText("권리 침해가 있어요")).toBeTruthy();
    expect(screen.getByLabelText("안전 문제가 있어요")).toBeTruthy();
    expect(screen.getByLabelText("기타")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "신고 보내기" }));
    expect(await screen.findByText("이미 신고한 제품이에요.")).toBeTruthy();
  });

  it("submits shared create with default 100g, optional label_basis_text, and omits blank optional nutrients", async () => {
    createFoodProduct.mockResolvedValue(createProduct({ id: "created-shared", source_type: "manual", visibility: "public" }));

    render(<FoodProductCreateForm onCancel={() => undefined} onCreated={() => undefined} />);

    expect((screen.getByRole("spinbutton", { name: "기준량" }) as HTMLInputElement).value).toBe("100");
    await userEvent.type(screen.getByRole("textbox", { name: /제품명/ }), "공유 시리얼");
    await userEvent.type(screen.getByRole("textbox", { name: /원 라벨 기준량/ }), "1회(40g)");
    await userEvent.type(screen.getByRole("spinbutton", { name: /열량/ }), "180");
    await userEvent.click(screen.getByRole("button", { name: "등록하고 선택" }));

    await waitFor(() => expect(createFoodProduct).toHaveBeenCalledWith({
      name: "공유 시리얼",
      brand: null,
      nutrition: {
        basis: { amount: 100, unit: "g" },
        label_basis_text: "1회(40g)",
        values: { energy_kcal: 180 },
      },
    }));
  });

  it("switches from the public dataset filter to manual and syncs query to the created product after a shared create succeeds", async () => {
    fetchFoodProducts.mockImplementation(
      async ({ q = "", source = "all" }: { q?: string; source?: FoodProductListSource }) => {
        if (source === "manual") {
          return {
            items: [
              createProduct({
                id: "created-manual",
                name: "공유 시리얼",
                source_type: "manual",
                visibility: "public",
                editable: true,
              }),
            ],
            next_cursor: null,
            has_next: false,
          };
        }

        if (source === "public_dataset" && q === "없는 제품") {
          return {
            items: [],
            next_cursor: null,
            has_next: false,
          };
        }
        return {
          items: [createProduct({ id: "public-dataset", name: "공공 요거트" })],
          next_cursor: null,
          has_next: false,
        };
      },
    );
    createFoodProduct.mockResolvedValue(
      createProduct({
        id: "created-manual",
        name: "공유 시리얼",
        source_type: "manual",
        visibility: "public",
        editable: true,
      }),
    );

    const user = userEvent.setup();
    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "공공 영양DB" }));
    await waitFor(() =>
      expect(fetchFoodProducts).toHaveBeenLastCalledWith({
        q: "",
        source: "public_dataset",
        limit: 20,
      }),
    );
    await user.type(screen.getByRole("searchbox", { name: "완제품 검색" }), "없는 제품");
    await waitFor(() => expect(screen.getByText("검색 결과가 없어요")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "새 완제품 등록" }));
    await user.type(screen.getByRole("textbox", { name: /제품명/ }), "공유 시리얼");
    await user.type(screen.getByRole("spinbutton", { name: /열량/ }), "180");
    await user.click(screen.getByRole("button", { name: "등록하고 선택" }));

    await waitFor(() =>
      expect(fetchFoodProducts).toHaveBeenLastCalledWith({
        q: "공유 시리얼",
        source: "manual",
        limit: 20,
      }),
    );
    expect(screen.getByRole("button", { name: "사용자 등록" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("searchbox", { name: "완제품 검색" }) as HTMLInputElement).value).toBe("공유 시리얼");
    expect(screen.getByRole("button", { name: "공유 시리얼 선택" })).toBeTruthy();
  });

  it("uses 100g for direct relation selection with step 1, but keeps non-related legacy serving as 1회", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [
        createProduct({
          id: "direct-relation",
          name: "직접 관계 견과",
          visibility: "private",
          source_type: "manual",
          editable: true,
          basis_relations: [
            { from: { amount: 1, unit: "serving" }, to: { amount: 30, unit: "g" } },
          ],
          nutrition: {
            ...createProduct().nutrition,
            basis: { amount: 1, unit: "serving" },
          },
        }),
        createProduct({
          id: "legacy-serving",
          name: "기존 간식",
          visibility: "private",
          source_type: "manual",
          editable: true,
          basis_relations: [],
          nutrition: {
            ...createProduct().nutrition,
            basis: { amount: 1, unit: "serving" },
          },
        }),
      ],
      next_cursor: null,
      has_next: false,
    });

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "직접 관계 견과 선택" }));
    const quantityInput = screen.getByRole("spinbutton", { name: "완제품 수량" }) as HTMLInputElement;
    expect(quantityInput.value).toBe("100");
    expect(quantityInput.step).toBe("1");

    await userEvent.click(screen.getByRole("button", { name: "기존 간식 선택" }));
    expect((screen.getByRole("spinbutton", { name: "완제품 수량" }) as HTMLInputElement).value).toBe("1");
  });

  it("sends metadata-only PATCH without nutrition for legacy private edit even when nutrition fields are unavailable", async () => {
    updateFoodProduct.mockResolvedValue(
      createProduct({
        id: "legacy-private",
        name: "새 이름",
        brand: "새 브랜드",
        visibility: "private",
        source_type: "manual",
        editable: true,
        nutrition: {
          ...createProduct().nutrition,
          basis: { amount: 1, unit: "serving" },
          values: {
            energy_kcal: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
          },
        },
      }),
    );

    render(
      <FoodProductCreateForm
        onCancel={() => undefined}
        onUpdated={() => undefined}
        product={createProduct({
          id: "legacy-private",
          name: "기존 이름",
          brand: "기존 브랜드",
          visibility: "private",
          source_type: "manual",
          editable: true,
          nutrition: {
            ...createProduct().nutrition,
            basis: { amount: 1, unit: "serving" },
            values: {
              energy_kcal: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
            },
          },
        })}
      />,
    );

    await userEvent.clear(screen.getByRole("textbox", { name: /제품명/ }));
    await userEvent.type(screen.getByRole("textbox", { name: /제품명/ }), "새 이름");
    await userEvent.clear(screen.getByRole("textbox", { name: /업체\/브랜드/ }));
    await userEvent.type(screen.getByRole("textbox", { name: /업체\/브랜드/ }), "새 브랜드");
    await userEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));

    await waitFor(() => expect(updateFoodProduct).toHaveBeenCalledWith("legacy-private", {
      name: "새 이름",
      brand: "새 브랜드",
    }));
  });

  it("keeps the delete dialog open after a generic failure and retries the same delete request", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [
        createProduct({
          id: "owner-delete",
          name: "삭제 대상",
          source_type: "manual",
          visibility: "public",
          editable: true,
        }),
      ],
      next_cursor: null,
      has_next: false,
    });
    deleteFoodProduct
      .mockRejectedValueOnce(Object.assign(new Error("네트워크 오류"), { status: 500, code: "INTERNAL_ERROR", fields: [] }))
      .mockResolvedValueOnce({ deleted: true });

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "삭제 대상 삭제" }));
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("네트워크 오류")).toBeTruthy();
    expect(screen.getByText('"삭제 대상" 제품을 삭제할까요?')).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(deleteFoodProduct).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('"삭제 대상" 제품을 삭제할까요?')).toBeNull();
  });

  it("uses dialog boundary semantics for the delete confirmation dialog", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [
        createProduct({
          id: "owner-delete",
          name: "삭제 대상",
          source_type: "manual",
          visibility: "public",
          editable: true,
        }),
      ],
      next_cursor: null,
      has_next: false,
    });

    const user = userEvent.setup();
    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    const deleteTrigger = await screen.findByRole("button", { name: "삭제 대상 삭제" });
    await user.click(deleteTrigger);

    const dialog = screen.getByRole("alertdialog");
    const cancel = screen.getByRole("button", { name: "취소" });
    const confirm = screen.getByRole("button", { name: "삭제" });
    expect(dialog.getAttribute("aria-labelledby")).toBe("food-product-delete-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("food-product-delete-description");
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    confirm.focus();
    await user.tab();
    expect(document.activeElement).toBe(cancel);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(deleteTrigger));
  });

  it("retries a generic report failure with the same code and detail draft", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [
        createProduct({
          id: "retry-report",
          name: "신고 대상",
          source_type: "manual",
          visibility: "public",
          editable: false,
        }),
      ],
      next_cursor: null,
      has_next: false,
    });
    reportFoodProduct
      .mockRejectedValueOnce(Object.assign(new Error("신고를 보내지 못했어요."), { status: 500, code: "INTERNAL_ERROR", fields: [] }))
      .mockResolvedValueOnce({ reported: true });

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "신고 대상 신고" }));
    await userEvent.click(screen.getByLabelText("권리 침해가 있어요"));
    await userEvent.type(screen.getByRole("textbox", { name: /상세 설명/ }), "상세 신고 메모");
    await userEvent.click(screen.getByRole("button", { name: "신고 보내기" }));
    expect(await screen.findByText("신고를 보내지 못했어요.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "신고 보내기" }));

    await waitFor(() => expect(reportFoodProduct).toHaveBeenNthCalledWith(2, "retry-report", {
      reason_code: "rights",
      detail_text: "상세 신고 메모",
    }));
  });

  it("uses dialog boundary semantics for the report dialog", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [
        createProduct({
          id: "report-target",
          name: "신고 대상",
          source_type: "manual",
          visibility: "public",
          editable: false,
        }),
      ],
      next_cursor: null,
      has_next: false,
    });

    const user = userEvent.setup();
    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-18"
        slotName="아침"
      />,
    );

    const reportTrigger = await screen.findByRole("button", { name: "신고 대상 신고" });
    await user.click(reportTrigger);

    const dialog = screen.getByRole("dialog");
    const firstReason = screen.getByLabelText("스팸·광고예요");
    const submit = screen.getByRole("button", { name: "신고 보내기" });
    expect(dialog.getAttribute("aria-labelledby")).toBe("food-product-report-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("food-product-report-description");
    await waitFor(() => expect(document.activeElement).toBe(firstReason));

    submit.focus();
    await user.tab();
    expect(document.activeElement).toBe(firstReason);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(submit);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(reportTrigger));
  });
});
