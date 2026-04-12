import type { PlannerColumnData, PlannerFixedSlotName } from "@/types/planner";
import { PLANNER_FIXED_SLOT_NAMES } from "@/types/planner";

interface PlannerColumnLike {
  id: string;
  name: string;
  sort_order: number;
}

const PLANNER_FIXED_SLOT_FALLBACK_IDS = [
  "planner-slot-breakfast",
  "planner-slot-lunch",
  "planner-slot-snack",
  "planner-slot-dinner",
] as const;

function normalizeSlotName(value: string) {
  return value.trim();
}

export function sortPlannerColumns<T extends PlannerColumnLike>(columns: T[]) {
  return [...columns].sort((left, right) => {
    if (left.sort_order === right.sort_order) {
      return left.id.localeCompare(right.id);
    }

    return left.sort_order - right.sort_order;
  });
}

export function buildFixedPlannerColumns<T extends PlannerColumnLike>(input: T[]) {
  const sortedColumns = sortPlannerColumns(input);
  const matchedIds = new Set<string>();
  const columnIds = new Set(sortedColumns.map((column) => column.id));
  const mappedColumnIds = new Map<string, string>();

  const columns: PlannerColumnData[] = PLANNER_FIXED_SLOT_NAMES.map((slotName, index) => {
    const exactMatch = sortedColumns.find((column) => {
      return normalizeSlotName(column.name) === slotName && !matchedIds.has(column.id);
    });

    if (exactMatch) {
      matchedIds.add(exactMatch.id);
      mappedColumnIds.set(exactMatch.id, exactMatch.id);
    }

    return {
      id: exactMatch?.id ?? PLANNER_FIXED_SLOT_FALLBACK_IDS[index],
      name: slotName,
      sort_order: index,
    };
  });

  const openSlots = columns.filter((column) => !columnIds.has(column.id));
  const unmatchedColumns = sortedColumns.filter((column) => !matchedIds.has(column.id));

  unmatchedColumns.forEach((column, index) => {
    const targetColumn = openSlots[index] ?? columns[columns.length - 1]!;
    mappedColumnIds.set(column.id, targetColumn.id);
  });

  return {
    columns,
    getFixedColumnId(columnId: string) {
      return mappedColumnIds.get(columnId) ?? columns[columns.length - 1]!.id;
    },
    getFixedColumnByName(name: PlannerFixedSlotName) {
      return columns.find((column) => column.name === name) ?? null;
    },
  };
}
