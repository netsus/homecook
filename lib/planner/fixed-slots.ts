interface PlannerColumnLike {
  id: string;
  name: string;
  sort_order: number;
}

export function sortPlannerColumns<T extends PlannerColumnLike>(columns: T[]) {
  return [...columns].sort((left, right) => {
    if (left.sort_order === right.sort_order) {
      return left.id.localeCompare(right.id);
    }

    return left.sort_order - right.sort_order;
  });
}
