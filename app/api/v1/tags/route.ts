import { NextRequest } from "next/server";

import { ok } from "@/lib/api/response";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { RecipeTagItem, RecipeTagKind, RecipeTagListData } from "@/types/recipe";

const TAG_LIMIT_DEFAULT = 30;
const TAG_LIMIT_MAX = 100;
const TAG_KIND_VALUES = [
  "semantic",
  "ingredient",
  "method",
  "source",
  "user",
] as const satisfies readonly RecipeTagKind[];
const TAG_KINDS: ReadonlySet<string> = new Set(TAG_KIND_VALUES);

interface PublicRecipeTagRow {
  normalized_key: string;
  label: string;
  slug: string | null;
  kind: RecipeTagKind;
  is_system: boolean;
  theme_eligible: boolean;
  usage_count: number;
}

interface TagsDbClient {
  rpc(
    functionName: "list_public_recipe_tags",
    args: {
      p_q: string | null;
      p_kind: RecipeTagKind | null;
      p_theme_eligible: boolean | null;
      p_limit: number;
    },
  ): PromiseLike<{
    data: PublicRecipeTagRow[] | null;
    error: { message: string } | null;
  }>;
}

function isRecipeTagKind(value: string): value is RecipeTagKind {
  return TAG_KINDS.has(value);
}

function clampTagLimit(value: string | null) {
  if (!value) {
    return TAG_LIMIT_DEFAULT;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return TAG_LIMIT_DEFAULT;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), TAG_LIMIT_MAX);
}

function parseBoolean(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function parseKind(value: string | null) {
  if (!value) {
    return { kind: null, valid: true };
  }

  if (!isRecipeTagKind(value)) {
    return { kind: null, valid: false };
  }

  return { kind: value, valid: true };
}

function createEmptyTagList(): RecipeTagListData {
  return { items: [] };
}

function mapTagRow(row: PublicRecipeTagRow): RecipeTagItem {
  return {
    normalized_key: row.normalized_key,
    label: row.label,
    slug: row.slug ?? null,
    kind: row.kind,
    is_system: row.is_system,
    theme_eligible: row.theme_eligible,
    usage_count: row.usage_count,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim() || null;
  const kindResult = parseKind(searchParams.get("kind"));
  const themeEligible = parseBoolean(searchParams.get("theme_eligible"));
  const limit = clampTagLimit(searchParams.get("limit"));

  if (!kindResult.valid) {
    return ok(createEmptyTagList());
  }

  try {
    const routeClient = await createRouteHandlerClient({
      anonymousPublicReadScope: "tags",
    });
    const dbClient: TagsDbClient = routeClient;
    const { data, error } = await dbClient.rpc("list_public_recipe_tags", {
      p_q: q,
      p_kind: kindResult.kind,
      p_theme_eligible: themeEligible,
      p_limit: limit,
    });

    if (error || !data) {
      return ok(createEmptyTagList());
    }

    return ok({
      items: data.map(mapTagRow),
    } satisfies RecipeTagListData);
  } catch {
    return ok(createEmptyTagList());
  }
}
