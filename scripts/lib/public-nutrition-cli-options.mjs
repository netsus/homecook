import { NutritionPipelineError } from "./public-nutrition-pipeline.mjs";

const MFDS_FILTER_KEYS = Object.freeze([
  "FOOD_NM_KR",
  "RESEARCH_YMD",
  "MAKER_NM",
  "FOOD_CAT1_NM",
  "ITEM_REPORT_NO",
  "UPDATE_DATE",
  "DB_CLASS_NM",
]);
const MFDS_GENERAL_KEYS = new Set([
  "live",
  "output-dir",
  "fetched-at",
  "num-of-rows",
  "max-pages",
]);

function positiveIntegerArg(args, key, fallback) {
  if (args[key] === undefined) return fallback;
  const value = Number(args[key]);
  if (!Number.isInteger(value) || value < 1) {
    throw new NutritionPipelineError("CLI_ARGUMENT_INVALID", { argument: key });
  }
  return value;
}

export function mfdsLiveOptions(args) {
  const unsupported = Object.keys(args).filter((key) =>
    !MFDS_GENERAL_KEYS.has(key) && !MFDS_FILTER_KEYS.includes(key),
  );
  if (unsupported.length > 0) {
    throw new NutritionPipelineError("MFDS_FILTER_INVALID");
  }
  const filters = Object.fromEntries(
    MFDS_FILTER_KEYS
      .filter((key) => typeof args[key] === "string")
      .map((key) => [key, args[key]]),
  );
  if (Object.keys(filters).length === 0) {
    throw new NutritionPipelineError("MFDS_FILTER_REQUIRED");
  }
  if (Object.values(filters).some((value) => value.trim().length === 0)) {
    throw new NutritionPipelineError("MFDS_FILTER_INVALID");
  }
  return {
    filters,
    pageSize: positiveIntegerArg(args, "num-of-rows", 100),
    maxPages: positiveIntegerArg(args, "max-pages", 10),
  };
}
