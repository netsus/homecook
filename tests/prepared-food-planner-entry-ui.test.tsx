// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FoodProductPicker } from "@/components/planner/food-product-picker";
import { FoodProductCreateForm } from "@/components/planner/food-product-create-form";
import { ProductPlannerEntryCard } from "@/components/planner/product-planner-entry-card";
import { PRODUCT_PLANNER_RETURN_CONTEXT_KEY } from "@/lib/planner/product-planner-return-context";
import {
  buildCompatibleFoodProductUnits,
  formatProductExpectedEnergy,
  mergeMealScreenEntries,
  mergePlannerEntries,
} from "@/lib/planner/product-planner-entry-presentation";
import type { FoodProductData } from "@/types/food-product";
import type { MealProductPlannerEntryData, ProductPlannerEntryData } from "@/types/product-planner-entry";

const fetchFoodProducts = vi.fn();
const createFoodProduct = vi.fn();
const createProductPlannerEntry = vi.fn();

vi.mock("@/lib/api/food-product", () => ({
  fetchFoodProducts: (...args: unknown[]) => fetchFoodProducts(...args),
  createFoodProduct: (...args: unknown[]) => createFoodProduct(...args),
  isFoodProductApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as object),
}));

vi.mock("@/lib/api/product-planner-entry", () => ({
  createProductPlannerEntry: (...args: unknown[]) => createProductPlannerEntry(...args),
  isProductPlannerEntryApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as object),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function createProduct(overrides: Partial<FoodProductData> = {}): FoodProductData {
  return {
    id: "product-1",
    name: "플레인 요거트",
    brand: "무먹 식품",
    visibility: "private",
    source_type: "manual",
    editable: true,
    nutrition_version_id: "version-1",
    basis_relations: [],
    nutrition: {
      basis: { amount: 1, unit: "serving" },
      values: {
        energy_kcal: {
          amount: 105,
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

function createEntry(
  overrides: Partial<MealProductPlannerEntryData> = {},
): MealProductPlannerEntryData {
  const product = createProduct();
  return {
    entry_type: "product",
    id: "entry-1",
    product_id: product.id,
    product_name: product.name,
    product_brand: product.brand,
    quantity: { amount: 1, unit: "serving" },
    workflow_status: null,
    product_nutrition_version_id: product.nutrition_version_id,
    basis_relations: product.basis_relations,
    nutrition: product.nutrition,
    ...overrides,
  };
}

describe("prepared food planner presentation", () => {
  afterEach(() => cleanup());

  it.each([
    [
      { amount: 0, known_amount: null, status: "complete", display_mode: "total" },
      "예상 열량 0 kcal",
    ],
    [
      { amount: null, known_amount: 87, status: "partial", display_mode: "minimum" },
      "예상 열량 최소 87 kcal",
    ],
    [
      { amount: null, known_amount: null, status: "unavailable", display_mode: null },
      "예상 열량 정보 준비 중",
    ],
  ] as const)("keeps complete, partial, unavailable, and observed zero distinct", (value, expected) => {
    expect(formatProductExpectedEnergy(value)).toBe(expected);
  });

  it("allows only the label unit and exactly-one direct related units", () => {
    const product = createProduct({
      basis_relations: [
        { from: { amount: 1, unit: "serving" }, to: { amount: 150, unit: "g" } },
        { from: { amount: 1, unit: "serving" }, to: { amount: 200, unit: "g" } },
        { from: { amount: 1, unit: "package" }, to: { amount: 500, unit: "ml" } },
      ],
    });

    expect(buildCompatibleFoodProductUnits(product)).toEqual(["serving"]);
  });

  it("merges recipe and product arrays once with type-prefixed stable keys and dedupe", () => {
    const productEntry = {
      ...createEntry(),
      plan_date: "2026-07-17",
      column_id: "column-1",
    } satisfies ProductPlannerEntryData;
    const plannerEntries = mergePlannerEntries(
      [
        {
          id: "same-id",
          recipe_id: "recipe-1",
          recipe_title: "김치찌개",
          recipe_thumbnail_url: null,
          plan_date: "2026-07-17",
          column_id: "column-1",
          planned_servings: 2,
          status: "registered",
          is_leftover: false,
        },
      ],
      [{ ...productEntry, id: "same-id" }, { ...productEntry, id: "same-id" }],
    );
    const mealEntries = mergeMealScreenEntries(
      [
        {
          id: "same-id",
          recipe_id: "recipe-1",
          recipe_title: "김치찌개",
          recipe_thumbnail_url: null,
          planned_servings: 2,
          status: "registered",
          is_leftover: false,
        },
      ],
      [{ ...createEntry(), id: "same-id" }, { ...createEntry(), id: "same-id" }],
    );

    expect(plannerEntries.map((entry) => entry.key)).toEqual([
      "recipe:same-id",
      "product:same-id",
    ]);
    expect(mealEntries.map((entry) => entry.key)).toEqual([
      "recipe:same-id",
      "product:same-id",
    ]);
  });

  it("renders a product card without Recipe Meal workflow actions or a false zero", () => {
    render(
      <ProductPlannerEntryCard
        entry={createEntry({
          nutrition: {
            ...createProduct().nutrition,
            calculation_status: "unavailable",
            values: {
              energy_kcal: {
                amount: null,
                known_amount: null,
                status: "unavailable",
                display_mode: null,
              },
            },
          },
        })}
        isPending={false}
        onDelete={() => undefined}
        onEditQuantity={() => undefined}
      />,
    );

    expect(screen.getByText("완제품")).toBeTruthy();
    expect(screen.getByText("예상 열량 정보 준비 중")).toBeTruthy();
    expect(screen.queryByText("예상 열량 0 kcal")).toBeNull();
    expect(screen.queryByRole("button", { name: "장보기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "요리하기" })).toBeNull();
    expect(screen.queryByText("등록")).toBeNull();
  });
});

describe("FOOD_PRODUCT_PICKER cursor and latest-query behavior", () => {
  beforeEach(() => {
    fetchFoodProducts.mockReset();
    createFoodProduct.mockReset();
    createProductPlannerEntry.mockReset();
    window.sessionStorage.clear();
  });

  afterEach(() => cleanup());

  it("moves a product list 401 into the existing login return flow with a safe picker context", async () => {
    fetchFoodProducts.mockRejectedValue(Object.assign(new Error("로그인이 필요해요."), {
      status: 401,
      code: "UNAUTHORIZED",
      fields: [],
    }));

    render(
      <FoodProductPicker
        columnId="column-1"
        initialQuery="간식"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-17"
        slotName="아침"
      />,
    );

    await waitFor(() => expect(window.sessionStorage.getItem(
      PRODUCT_PLANNER_RETURN_CONTEXT_KEY,
    )).not.toBeNull());
    expect(JSON.parse(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY)!)).toEqual({
      version: 1,
      kind: "picker",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      query: "간식",
      productId: null,
      quantityAmount: "1",
      quantityUnit: null,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("appends opaque-cursor pages, dedupes by product id, and stops on the last page", async () => {
    fetchFoodProducts
      .mockResolvedValueOnce({
        items: [createProduct()],
        next_cursor: "opaque-next+/=",
        has_next: true,
      })
      .mockResolvedValueOnce({
        items: [createProduct(), createProduct({ id: "product-2", name: "두부 스낵" })],
        next_cursor: null,
        has_next: false,
      });

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-17"
        slotName="아침"
      />,
    );

    expect(await screen.findByText("플레인 요거트")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "완제품 더 불러오기" }));
    expect(await screen.findByText("두부 스낵")).toBeTruthy();
    expect(screen.getAllByText("플레인 요거트")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "완제품 더 불러오기" })).toBeNull();
    expect(fetchFoodProducts).toHaveBeenNthCalledWith(2, {
      q: "",
      cursor: "opaque-next+/=",
      limit: 20,
    });
  });

  it("moves an opaque-cursor page 401 into login with the selected product context", async () => {
    fetchFoodProducts
      .mockResolvedValueOnce({
        items: [createProduct()],
        next_cursor: "opaque-next+/=",
        has_next: true,
      })
      .mockRejectedValueOnce(Object.assign(new Error("로그인이 필요해요."), {
        status: 401,
        code: "UNAUTHORIZED",
        fields: [],
      }));

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-17"
        slotName="아침"
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: /플레인 요거트/ }));
    await userEvent.click(screen.getByRole("button", { name: "완제품 더 불러오기" }));

    await waitFor(() => expect(fetchFoodProducts).toHaveBeenCalledTimes(2));
    expect(fetchFoodProducts).toHaveBeenNthCalledWith(2, {
      q: "",
      cursor: "opaque-next+/=",
      limit: 20,
    });
    expect(JSON.parse(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY)!)).toMatchObject({
      kind: "picker",
      query: "",
      productId: "product-1",
      quantityAmount: "1",
      quantityUnit: "serving",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears old results immediately and ignores a slower previous query", async () => {
    const slow = createDeferred<{ items: FoodProductData[]; next_cursor: null; has_next: false }>();
    fetchFoodProducts
      .mockResolvedValueOnce({ items: [createProduct()], next_cursor: null, has_next: false })
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce({
        items: [createProduct({ id: "latest", name: "최신 두부" })],
        next_cursor: null,
        has_next: false,
      });

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-17"
        slotName="아침"
      />,
    );
    expect(await screen.findByText("플레인 요거트")).toBeTruthy();

    const input = screen.getByRole("searchbox", { name: "완제품 검색" });
    fireEvent.change(input, { target: { value: "느린" } });
    await waitFor(() => expect(screen.queryByText("플레인 요거트")).toBeNull());
    fireEvent.change(input, { target: { value: "최신" } });
    expect(await screen.findByText("최신 두부")).toBeTruthy();

    slow.resolve({
      items: [createProduct({ id: "stale", name: "느린 요거트" })],
      next_cursor: null,
      has_next: false,
    });
    await waitFor(() => expect(screen.queryByText("느린 요거트")).toBeNull());
  });

  it("restores search, later-page selection, amount, unit, nutrition, and focus from safe session context", async () => {
    const laterProduct = createProduct({
      id: "product-later",
      name: "두 번째 페이지 요거트",
      nutrition_version_id: "version-later",
      nutrition: {
        ...createProduct().nutrition,
        basis: { amount: 1, unit: "package" },
        values: {
          energy_kcal: { amount: 210, known_amount: null, status: "complete", display_mode: "total" },
          carbohydrate_g: { amount: 18, known_amount: null, status: "complete", display_mode: "total" },
          protein_g: { amount: null, known_amount: 7, status: "partial", display_mode: "minimum" },
          fat_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
          sodium_mg: { amount: 90, known_amount: null, status: "complete", display_mode: "total" },
        },
      },
    });
    window.sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify({
      version: 1,
      kind: "picker",
      planDate: "2026-07-17",
      columnId: "column-1",
      slotName: "아침",
      query: "요거트",
      productId: laterProduct.id,
      quantityAmount: "2.5",
      quantityUnit: "package",
    }));
    fetchFoodProducts
      .mockResolvedValueOnce({ items: [createProduct()], next_cursor: "opaque-2", has_next: true })
      .mockResolvedValueOnce({ items: [laterProduct], next_cursor: null, has_next: false });

    render(
      <FoodProductPicker
        columnId="column-1"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-17"
        slotName="아침"
      />,
    );

    expect((screen.getByRole("searchbox", { name: "완제품 검색" }) as HTMLInputElement).value).toBe("요거트");
    expect(await screen.findByText("두 번째 페이지 요거트")).toBeTruthy();
    const amount = screen.getByRole("spinbutton", { name: "완제품 수량" });
    expect((amount as HTMLInputElement).value).toBe("2.5");
    expect(document.activeElement).toBe(amount);
    expect(screen.getByText("예상 열량 525 kcal")).toBeTruthy();
    expect(screen.getAllByText(/단백질 최소 7 g/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/지방 정보 준비 중/).length).toBeGreaterThan(0);
  });

  it("shows core nutrition and basis expected energy on each result card", async () => {
    fetchFoodProducts.mockResolvedValue({
      items: [createProduct({
        nutrition: {
          ...createProduct().nutrition,
          values: {
            energy_kcal: { amount: 105, known_amount: null, status: "complete", display_mode: "total" },
            carbohydrate_g: { amount: 12, known_amount: null, status: "complete", display_mode: "total" },
            protein_g: { amount: 6, known_amount: null, status: "complete", display_mode: "total" },
            fat_g: { amount: 3, known_amount: null, status: "complete", display_mode: "total" },
            sodium_mg: { amount: 80, known_amount: null, status: "complete", display_mode: "total" },
          },
        },
      })],
      next_cursor: null,
      has_next: false,
    });

    render(<FoodProductPicker columnId="column-1" onClose={() => undefined} onComplete={() => undefined} planDate="2026-07-17" slotName="아침" />);

    expect(await screen.findByText("예상 열량 105 kcal")).toBeTruthy();
    expect(screen.getByText(/탄수화물 12 g/)).toBeTruthy();
    expect(screen.getByText(/단백질 6 g/)).toBeTruthy();
    expect(screen.getByText(/지방 3 g/)).toBeTruthy();
    expect(screen.getByText(/나트륨 80 mg/)).toBeTruthy();
  });

  it("keeps selection on nutrition version conflict and refreshes it only after an explicit action", async () => {
    const current = createProduct();
    const refreshed = createProduct({
      nutrition_version_id: "version-2",
      nutrition: {
        ...current.nutrition,
        values: {
          energy_kcal: { amount: 120, known_amount: null, status: "complete", display_mode: "total" },
        },
      },
    });
    fetchFoodProducts
      .mockResolvedValueOnce({ items: [current], next_cursor: null, has_next: false })
      .mockResolvedValueOnce({ items: [refreshed], next_cursor: null, has_next: false });
    createProductPlannerEntry.mockRejectedValue(Object.assign(new Error("영양 정보가 먼저 변경됐어요."), {
      status: 409,
      code: "NUTRITION_VERSION_CONFLICT",
      fields: [],
    }));

    render(<FoodProductPicker columnId="column-1" onClose={() => undefined} onComplete={() => undefined} planDate="2026-07-17" slotName="아침" />);
    await userEvent.click(await screen.findByRole("button", { name: /플레인 요거트/ }));
    await userEvent.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));

    expect(screen.getByTestId("food-product-quantity-step")).toBeTruthy();
    expect(screen.getByText("영양 정보가 먼저 변경됐어요.")).toBeTruthy();
    expect(screen.getByTestId("food-product-quantity-step").textContent).toContain("예상 열량 105 kcal");
    await userEvent.click(screen.getByRole("button", { name: "최신 영양정보로 새로고침" }));
    await waitFor(() => expect(screen.getByTestId("food-product-quantity-step").textContent).toContain("예상 열량 120 kcal"));
  });

  it("moves a nutrition refresh 401 into login with the current quantity context", async () => {
    fetchFoodProducts
      .mockResolvedValueOnce({ items: [createProduct()], next_cursor: null, has_next: false })
      .mockRejectedValueOnce(Object.assign(new Error("로그인이 필요해요."), {
        status: 401,
        code: "UNAUTHORIZED",
        fields: [],
      }));
    createProductPlannerEntry.mockRejectedValue(Object.assign(
      new Error("영양 정보가 먼저 변경됐어요."),
      { status: 409, code: "NUTRITION_VERSION_CONFLICT", fields: [] },
    ));

    render(
      <FoodProductPicker
        columnId="column-1"
        initialQuery="요거트"
        onClose={() => undefined}
        onComplete={() => undefined}
        planDate="2026-07-17"
        slotName="아침"
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: /플레인 요거트/ }));
    const quantityInput = screen.getByRole("spinbutton", { name: "완제품 수량" });
    await userEvent.clear(quantityInput);
    await userEvent.type(quantityInput, "2.5");
    await userEvent.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));
    await userEvent.click(await screen.findByRole("button", { name: "최신 영양정보로 새로고침" }));

    await waitFor(() => expect(fetchFoodProducts).toHaveBeenCalledTimes(2));
    expect(fetchFoodProducts).toHaveBeenNthCalledWith(2, { q: "요거트", limit: 20 });
    expect(createProductPlannerEntry).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY)!)).toMatchObject({
      kind: "picker",
      query: "요거트",
      productId: "product-1",
      quantityAmount: "2.5",
      quantityUnit: "serving",
    });
    expect(screen.getByTestId("food-product-quantity-step")).toBeTruthy();
  });

  it("discards a stale refresh success after the query and selection generation change", async () => {
    const current = createProduct();
    const staleRefresh = createDeferred<{ items: FoodProductData[]; next_cursor: null; has_next: false }>();
    const latest = createProduct({ id: "latest", name: "최신 두부" });
    fetchFoodProducts
      .mockResolvedValueOnce({ items: [current], next_cursor: null, has_next: false })
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockResolvedValueOnce({ items: [latest], next_cursor: null, has_next: false });
    createProductPlannerEntry.mockRejectedValue(Object.assign(new Error("영양 정보가 먼저 변경됐어요."), {
      status: 409,
      code: "NUTRITION_VERSION_CONFLICT",
      fields: [],
    }));

    render(<FoodProductPicker columnId="column-1" onClose={() => undefined} onComplete={() => undefined} planDate="2026-07-17" slotName="아침" />);
    await userEvent.click(await screen.findByRole("button", { name: /플레인 요거트/ }));
    await userEvent.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));
    await userEvent.click(screen.getByRole("button", { name: "최신 영양정보로 새로고침" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "완제품 검색" }), { target: { value: "최신" } });
    expect(await screen.findByText("최신 두부")).toBeTruthy();

    staleRefresh.resolve({
      items: [createProduct({ nutrition_version_id: "stale-version", name: "오래된 요거트" })],
      next_cursor: null,
      has_next: false,
    });

    await waitFor(() => expect(screen.queryByText("오래된 요거트")).toBeNull());
    expect(screen.getByText("최신 두부")).toBeTruthy();
    expect(screen.queryByTestId("food-product-quantity-step")).toBeNull();
  });

  it("discards a stale refresh error after a newer query succeeds", async () => {
    const current = createProduct();
    const staleRefresh = createDeferred<{ items: FoodProductData[]; next_cursor: null; has_next: false }>();
    const latest = createProduct({ id: "latest", name: "최신 두부" });
    fetchFoodProducts
      .mockResolvedValueOnce({ items: [current], next_cursor: null, has_next: false })
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockResolvedValueOnce({ items: [latest], next_cursor: null, has_next: false });
    createProductPlannerEntry.mockRejectedValue(Object.assign(new Error("영양 정보가 먼저 변경됐어요."), {
      status: 409,
      code: "NUTRITION_VERSION_CONFLICT",
      fields: [],
    }));

    render(<FoodProductPicker columnId="column-1" onClose={() => undefined} onComplete={() => undefined} planDate="2026-07-17" slotName="아침" />);
    await userEvent.click(await screen.findByRole("button", { name: /플레인 요거트/ }));
    await userEvent.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));
    await userEvent.click(screen.getByRole("button", { name: "최신 영양정보로 새로고침" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "완제품 검색" }), { target: { value: "최신" } });
    expect(await screen.findByText("최신 두부")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /최신 두부/ }));

    staleRefresh.reject(Object.assign(new Error("오래된 새로고침 오류"), { status: 500 }));

    await waitFor(() => expect(screen.queryByText("오래된 새로고침 오류")).toBeNull());
    expect(screen.getByText("최신 두부")).toBeTruthy();
    expect(screen.getByTestId("food-product-quantity-step").textContent).toContain("최신 두부 수량");
  });

  it("maps picker basis mismatch to the official UI copy without exposing the API message", async () => {
    fetchFoodProducts.mockResolvedValue({ items: [createProduct()], next_cursor: null, has_next: false });
    createProductPlannerEntry.mockRejectedValue(Object.assign(
      new Error("이 수량 단위로 영양을 계산할 수 없어요."),
      { status: 422, code: "NUTRITION_BASIS_MISMATCH", fields: [] },
    ));

    render(<FoodProductPicker columnId="column-1" onClose={() => undefined} onComplete={() => undefined} planDate="2026-07-17" slotName="아침" />);
    await userEvent.click(await screen.findByRole("button", { name: /플레인 요거트/ }));
    await userEvent.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));

    expect(await screen.findByText("이 기준으로는 수량을 바꿀 수 없어요")).toBeTruthy();
    expect(screen.queryByText("이 수량 단위로 영양을 계산할 수 없어요.")).toBeNull();
    expect(screen.getByTestId("food-product-quantity-step")).toBeTruthy();
  });
});

describe("FOOD_PRODUCT_CREATE validation and privacy", () => {
  beforeEach(() => {
    createFoodProduct.mockReset();
  });

  afterEach(() => cleanup());

  it("announces owner-only privacy and focuses the invalid field with described error", async () => {
    render(<FoodProductCreateForm onCancel={() => undefined} onCreated={() => undefined} />);
    expect(screen.getByText(/나만 볼 수 있고 나만 수정할 수 있어요/)).toBeTruthy();

    fireEvent.submit(screen.getByTestId("food-product-create-form"));
    const name = screen.getByRole("textbox", { name: /완제품 이름/ });
    await waitFor(() => expect(document.activeElement).toBe(name));
    const describedBy = name.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe("완제품 이름을 입력해 주세요.");
  });

  it("hands a safe official-field draft to the auth return flow on create 401", async () => {
    const onUnauthorized = vi.fn();
    createFoodProduct.mockRejectedValue(Object.assign(new Error("로그인이 필요해요."), {
      status: 401,
      code: "UNAUTHORIZED",
      fields: [],
    }));
    render(<FoodProductCreateForm onCancel={() => undefined} onCreated={() => undefined} onUnauthorized={onUnauthorized} />);

    await userEvent.type(screen.getByRole("textbox", { name: /완제품 이름/ }), "내 두유");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "단위" }), "g");
    await userEvent.type(screen.getByRole("spinbutton", { name: /열량/ }), "0");
    await userEvent.click(screen.getByRole("button", { name: "등록하고 선택" }));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledWith(expect.objectContaining({
      name: "내 두유",
      energy: "0",
      basisUnit: "g",
    })));
  });
});
