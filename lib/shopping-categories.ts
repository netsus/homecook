import type { ShoppingListItemSummary } from "@/types/shopping";

export interface ShoppingItemCategoryGroup<T extends { display_text: string; category?: string | null }> {
  category: string;
  items: T[];
  sortIndex: number;
}

const SHOPPING_CATEGORY_ORDER = [
  "채소",
  "과일",
  "육류",
  "해산물",
  "유제품",
  "곡류",
  "양념",
  "기타",
] as const;

const SHOPPING_CATEGORY_INDEX: Map<string, number> = new Map(
  SHOPPING_CATEGORY_ORDER.map((category, index) => [category, index]),
);

export function normalizeShoppingCategory(rawCategory: string | null | undefined) {
  const category = rawCategory?.trim() ?? "";

  if (/채소|버섯|나물/.test(category)) return "채소";
  if (/과일/.test(category)) return "과일";
  if (/육류|축산|닭|돼지|소고기|쇠고기|계란|달걀/.test(category)) return "육류";
  if (/해산|수산|생선|어패|해조/.test(category)) return "해산물";
  if (/유제품|유가공|우유|치즈|버터|크림/.test(category)) return "유제품";
  if (/곡류|쌀|밀|두류|서류|전분|견과|종실|콩류/.test(category)) return "곡류";
  if (/조미|양념|소스|장류|유지|식용유|소금|설탕|식초/.test(category)) {
    return "양념";
  }

  return category || "기타";
}

export function inferShoppingCategoryFromName(displayText: string) {
  if (/양파|대파|파|마늘|고추|배추|무|당근|감자|버섯|상추|깻잎|호박|오이|토마토/.test(displayText)) {
    return "채소";
  }
  if (/사과|배|딸기|바나나|레몬|라임|오렌지|귤/.test(displayText)) return "과일";
  if (/소고기|쇠고기|돼지고기|닭고기|베이컨|햄|계란|달걀/.test(displayText)) return "육류";
  if (/새우|오징어|조개|멸치|다시마|미역|김|생선/.test(displayText)) return "해산물";
  if (/우유|치즈|버터|크림|요거트|요구르트/.test(displayText)) return "유제품";
  if (/쌀|밥|면|밀가루|전분|빵|콩|두부|땅콩/.test(displayText)) return "곡류";
  if (/간장|된장|고추장|소금|설탕|식초|고춧가루|후추|기름|오일|소스|참기름/.test(displayText)) {
    return "양념";
  }
  return "기타";
}

export function getShoppingItemCategory(
  item: Pick<ShoppingListItemSummary, "category" | "display_text">,
) {
  const normalized = normalizeShoppingCategory(item.category);
  return normalized === "기타"
    ? inferShoppingCategoryFromName(item.display_text)
    : normalized;
}

export function groupShoppingItemsByCategory<T extends { display_text: string; category?: string | null }>(
  items: T[],
) {
  const groups = new Map<string, ShoppingItemCategoryGroup<T>>();

  items.forEach((item) => {
    const category = getShoppingItemCategory(item);
    const existing = groups.get(category);
    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.set(category, {
      category,
      items: [item],
      sortIndex: SHOPPING_CATEGORY_INDEX.get(category) ?? SHOPPING_CATEGORY_ORDER.length,
    });
  });

  return [...groups.values()].sort((left, right) => {
    const byIndex = left.sortIndex - right.sortIndex;
    if (byIndex !== 0) return byIndex;
    return left.category.localeCompare(right.category, "ko");
  });
}
