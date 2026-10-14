import type {
  FoodProductBasisUnit,
  FoodProductData,
} from "@/types/food-product";
import type { QuantityInputDraft, QuantityInputSnapshot } from "@/types/quantity-input";

export interface ProductPlannerEntryQuantity {
  amount: number;
  unit: FoodProductBasisUnit;
}

export interface ProductPlannerEntryCreateBody {
  product_id: string;
  plan_date: string;
  column_id: string;
  quantity: ProductPlannerEntryQuantity;
  quantity_input?: QuantityInputDraft;
}

export interface ProductPlannerEntryPatchBody {
  quantity: ProductPlannerEntryQuantity;
  quantity_input?: QuantityInputDraft;
}

export interface ProductPlannerEntryData {
  entry_type: "product";
  id: string;
  product_id: string;
  product_name: string;
  product_brand: string | null;
  plan_date: string;
  column_id: string;
  quantity: ProductPlannerEntryQuantity;
  quantity_input?: QuantityInputSnapshot;
  quantity_policy?: "quantity-v4";
  workflow_status: null;
  product_nutrition_version_id: string;
  basis_relations: FoodProductData["basis_relations"];
  nutrition: FoodProductData["nutrition"];
}

export type MealProductPlannerEntryData = Omit<
  ProductPlannerEntryData,
  "plan_date" | "column_id"
>;

export interface ProductPlannerEntryMutationData {
  entry: ProductPlannerEntryData;
}

export interface ProductPlannerEntryDeleteData {
  deleted: true;
  entry_id: string;
}
