import {
  normalizeExpectedRecipeImageStorageOrigin,
} from "./recipe-image-read";
import { getDataSupabaseUrl } from "@/lib/supabase/data-env";

export function readExpectedRecipeImageStorageOrigin() {
  return normalizeExpectedRecipeImageStorageOrigin(
    getDataSupabaseUrl(),
  );
}
