import { createHash } from "node:crypto";
const PLANNER_STATUSES = ["registered", "shopping_done", "cook_done"];

export const SLICE_05_PERFORMANCE_DEFAULTS = {
  columnNames: ["아침", "점심", "저녁", "간식", "야식"],
  daysAfter: 28,
  daysBefore: 28,
  loginButtonLabel: "다른 테스트 계정으로 시작",
  performanceUserEmail: "local-other@homecook.local",
  rangeShiftDays: 7,
  recipeCount: 72,
  recipeTitlePrefix: "성능 플래너 레시피",
  shiftDirections: ["next", "next", "next", "prev", "prev", "prev"],
};

/**
 * @typedef {Object} Slice05PerformanceOptions
 * @property {Date | string | undefined} [baseDate]
 * @property {string[]} [columnNames]
 * @property {number} [daysAfter]
 * @property {number} [daysBefore]
 * @property {number} [recipeCount]
 * @property {string} [recipeTitlePrefix]
 * @property {number} [rangeShiftDays]
 * @property {string[]} [shiftDirections]
 */

function createDeterministicUuid(scope, value) {
  const hex = createHash("sha1")
    .update(`slice-05-performance:${scope}:${value}`)
    .digest("hex")
    .slice(0, 32)
    .split("");

  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];

  return [
    hex.slice(0, 8).join(""),
    hex.slice(8, 12).join(""),
    hex.slice(12, 16).join(""),
    hex.slice(16, 20).join(""),
    hex.slice(20, 32).join(""),
  ].join("-");
}

function padIndex(index) {
  return String(index).padStart(3, "0");
}

function normalizeBaseDate(input) {
  if (input instanceof Date) {
    return new Date(Date.UTC(
      input.getUTCFullYear(),
      input.getUTCMonth(),
      input.getUTCDate(),
    ));
  }

  const value = typeof input === "string" ? input : new Date().toISOString().slice(0, 10);
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDateKey(dateKey, dayDelta) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return formatDateKey(date);
}

function buildMealRows({
  columns,
  dayOffsets,
  recipeCount,
  recipeIds,
  baseDateKey,
}) {
  const meals = [];

  dayOffsets.forEach((dayOffset, dayIndex) => {
    const planDate = shiftDateKey(baseDateKey, dayOffset);

    columns.forEach((column, columnIndex) => {
      const primaryRecipeIndex = ((dayIndex * columns.length) + columnIndex) % recipeCount;
      const primaryStatus = PLANNER_STATUSES[(dayIndex + columnIndex) % PLANNER_STATUSES.length];

      meals.push({
        id: createDeterministicUuid("meal-primary", `${planDate}:${column.id}`),
        user_id: null,
        recipe_id: recipeIds[primaryRecipeIndex],
        plan_date: planDate,
        column_id: column.id,
        planned_servings: 1 + ((dayIndex + columnIndex) % 3),
        status: primaryStatus,
        is_leftover: false,
        leftover_dish_id: null,
        shopping_list_id: null,
        cooked_at:
          primaryStatus === "cook_done"
            ? `${planDate}T12:00:00.000Z`
            : null,
        created_at: `${planDate}T08:${String(columnIndex).padStart(2, "0")}:00.000Z`,
        updated_at: `${planDate}T08:${String(columnIndex).padStart(2, "0")}:00.000Z`,
      });

      if (dayIndex % 2 !== 0 || columnIndex >= 2) {
        return;
      }

      const secondaryRecipeIndex = (primaryRecipeIndex + 17) % recipeCount;
      const secondaryStatus =
        PLANNER_STATUSES[(dayIndex + columnIndex + 1) % PLANNER_STATUSES.length];

      meals.push({
        id: createDeterministicUuid("meal-secondary", `${planDate}:${column.id}`),
        user_id: null,
        recipe_id: recipeIds[secondaryRecipeIndex],
        plan_date: planDate,
        column_id: column.id,
        planned_servings: 1 + ((dayIndex + columnIndex + 1) % 3),
        status: secondaryStatus,
        is_leftover: false,
        leftover_dish_id: null,
        shopping_list_id: null,
        cooked_at:
          secondaryStatus === "cook_done"
            ? `${planDate}T18:00:00.000Z`
            : null,
        created_at: `${planDate}T18:${String(columnIndex).padStart(2, "0")}:00.000Z`,
        updated_at: `${planDate}T18:${String(columnIndex).padStart(2, "0")}:00.000Z`,
      });
    });
  });

  return meals;
}

function countMealsInRange(meals, startDate, endDate) {
  return meals.filter((meal) => meal.plan_date >= startDate && meal.plan_date <= endDate).length;
}

/**
 * @param {Slice05PerformanceOptions} [options]
 */
export function buildSlice05PerformanceDataset({
  baseDate,
  columnNames = SLICE_05_PERFORMANCE_DEFAULTS.columnNames,
  daysAfter = SLICE_05_PERFORMANCE_DEFAULTS.daysAfter,
  daysBefore = SLICE_05_PERFORMANCE_DEFAULTS.daysBefore,
  recipeCount = SLICE_05_PERFORMANCE_DEFAULTS.recipeCount,
  recipeTitlePrefix = SLICE_05_PERFORMANCE_DEFAULTS.recipeTitlePrefix,
  rangeShiftDays = SLICE_05_PERFORMANCE_DEFAULTS.rangeShiftDays,
  shiftDirections = SLICE_05_PERFORMANCE_DEFAULTS.shiftDirections,
} = {}) {
  if (recipeCount < 12) {
    throw new Error("recipeCount는 최소 12 이상이어야 합니다.");
  }

  const normalizedBaseDate = normalizeBaseDate(baseDate);
  const baseDateKey = formatDateKey(normalizedBaseDate);
  const columns = columnNames.map((name, index) => ({
    id: createDeterministicUuid("column", name),
    name,
    sort_order: index,
  }));
  const recipes = Array.from({ length: recipeCount }, (_, zeroBasedIndex) => {
    const index = zeroBasedIndex + 1;

    return {
      id: createDeterministicUuid("recipe", index),
      title: `${recipeTitlePrefix} ${padIndex(index)}`,
      description: `플래너 장시간 성능 검증용 레시피 ${padIndex(index)}`,
      thumbnail_url: null,
      tags: ["성능", "플래너", zeroBasedIndex % 2 === 0 ? "장기" : "테스트"],
      base_servings: 1 + (zeroBasedIndex % 4),
      source_type: "system",
      view_count: 200 + index,
      like_count: zeroBasedIndex % 9,
      save_count: zeroBasedIndex % 7,
      plan_count: 0,
      cook_count: 0,
    };
  });
  const dayOffsets = Array.from(
    { length: daysBefore + daysAfter + 1 },
    (_, index) => index - daysBefore,
  );
  const meals = buildMealRows({
    columns,
    dayOffsets,
    recipeCount,
    recipeIds: recipes.map((recipe) => recipe.id),
    baseDateKey,
  });

  const initialRangeStartDate = shiftDateKey(baseDateKey, -rangeShiftDays);
  const initialRangeEndDate = shiftDateKey(baseDateKey, rangeShiftDays);
  let currentStartDate = initialRangeStartDate;
  let currentEndDate = initialRangeEndDate;

  const shifts = shiftDirections.map((direction) => {
    const delta = direction === "next" ? rangeShiftDays : -rangeShiftDays;
    currentStartDate = shiftDateKey(currentStartDate, delta);
    currentEndDate = shiftDateKey(currentEndDate, delta);

    return {
      direction,
      buttonLabel: direction === "next" ? "다음 범위" : "이전 범위",
      startDate: currentStartDate,
      endDate: currentEndDate,
      expectedMealCount: countMealsInRange(meals, currentStartDate, currentEndDate),
    };
  });

  return {
    columns,
    recipes,
    meals,
    scenario: {
      baseDateKey,
      initialRangeEndDate,
      initialRangeStartDate,
      initialMealCount: countMealsInRange(meals, initialRangeStartDate, initialRangeEndDate),
      lastColumnName: columns.at(-1)?.name ?? "",
      loginButtonLabel: SLICE_05_PERFORMANCE_DEFAULTS.loginButtonLabel,
      performanceUserEmail: SLICE_05_PERFORMANCE_DEFAULTS.performanceUserEmail,
      rangeShiftDays,
      shifts,
      totalMealCount: meals.length,
      totalRecipeCount: recipes.length,
    },
  };
}
