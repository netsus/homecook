#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

function readFixtureData() {
  const fixturePath = path.join(process.cwd(), "qa", "fixtures", "slices-01-05.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextValue = argv[index + 1];

    if (!nextValue || nextValue.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = nextValue;
    index += 1;
  }

  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(dateKey, dayDelta) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return formatDateKey(date);
}

function buildSeedWindow(startDateArg) {
  if (startDateArg) {
    return {
      startDate: startDateArg,
      midDate: addUtcDays(startDateArg, 3),
      endDate: addUtcDays(startDateArg, 6),
    };
  }

  const baseDate = new Date();
  baseDate.setUTCHours(0, 0, 0, 0);

  const startDate = formatDateKey(new Date(baseDate.getTime() - 3 * 24 * 60 * 60 * 1000));

  return {
    startDate,
    midDate: addUtcDays(startDate, 3),
    endDate: addUtcDays(startDate, 6),
  };
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    fail("NEXT_PUBLIC_SUPABASE_URL 환경 변수가 필요합니다.");
  }

  if (!serviceRoleKey) {
    fail("SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function assertNoError(result, message) {
  if (result.error) {
    throw new Error(`${message}: ${result.error.message}`);
  }
}

async function ensureUser(supabase, { id, nickname, email, socialId }) {
  const existingResult = await supabase
    .from("users")
    .select("id")
    .eq("id", id)
    .limit(1);

  assertNoError(existingResult, `users 조회 실패 (${id})`);

  if ((existingResult.data ?? []).length > 0) {
    return id;
  }

  const now = new Date().toISOString();
  const insertResult = await supabase
    .from("users")
    .insert({
      id,
      nickname,
      email,
      profile_image_url: null,
      social_provider: "google",
      social_id: socialId,
      settings_json: {},
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });

  assertNoError(insertResult, `users 생성 실패 (${id})`);
  return id;
}

async function findUserIdByEmail(supabase, email) {
  const result = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .limit(1);

  assertNoError(result, `users 이메일 조회 실패 (${email})`);
  return result.data?.[0]?.id ?? null;
}

async function ensureIngredient(supabase, ingredient) {
  const existingResult = await supabase
    .from("ingredients")
    .select("id")
    .eq("standard_name", ingredient.standardName)
    .limit(1);

  assertNoError(existingResult, `ingredients 조회 실패 (${ingredient.standardName})`);

  const existingId = existingResult.data?.[0]?.id;

  if (existingId) {
    return existingId;
  }

  const insertResult = await supabase
    .from("ingredients")
    .insert({
      id: ingredient.id,
      standard_name: ingredient.standardName,
      category: ingredient.category,
      default_unit: ingredient.defaultUnit,
      created_at: new Date().toISOString(),
    });

  assertNoError(insertResult, `ingredients 생성 실패 (${ingredient.standardName})`);
  return ingredient.id;
}

async function ensureCookingMethod(supabase, method) {
  const existingResult = await supabase
    .from("cooking_methods")
    .select("id")
    .eq("code", method.code)
    .limit(1);

  assertNoError(existingResult, `cooking_methods 조회 실패 (${method.code})`);

  const existingId = existingResult.data?.[0]?.id;

  if (existingId) {
    return existingId;
  }

  const insertResult = await supabase
    .from("cooking_methods")
    .insert({
      id: method.id,
      code: method.code,
      label: method.label,
      color_key: method.colorKey,
      is_system: method.isSystem,
      display_order: method.displayOrder,
      created_at: new Date().toISOString(),
    });

  assertNoError(insertResult, `cooking_methods 생성 실패 (${method.code})`);
  return method.id;
}

async function seedIngredientSynonyms(supabase, fixtureData, ingredientIdMap) {
  const rows = fixtureData.ingredientSynonyms.map((synonym) => ({
    id: synonym.id,
    ingredient_id: ingredientIdMap.get(synonym.ingredientId),
    synonym: synonym.synonym,
  }));

  const upsertResult = await supabase
    .from("ingredient_synonyms")
    .upsert(rows, { onConflict: "ingredient_id,synonym" });

  assertNoError(upsertResult, "ingredient_synonyms upsert 실패");
}

async function upsertRecipe(supabase, fixtureData) {
  const now = new Date().toISOString();
  const upsertResult = await supabase
    .from("recipes")
    .upsert({
      id: fixtureData.ids.dbSmokeRecipeId,
      title: fixtureData.recipe.title,
      description: fixtureData.recipe.description,
      thumbnail_url: fixtureData.recipe.thumbnailUrl,
      base_servings: fixtureData.recipe.baseServings,
      tags: fixtureData.recipe.tags,
      source_type: fixtureData.recipe.sourceType,
      created_by: null,
      view_count: fixtureData.fixture.recipe.cardViewCount,
      like_count: 0,
      save_count: 0,
      plan_count: 0,
      cook_count: 0,
      created_at: now,
      updated_at: now,
    }, { onConflict: "id" });

  assertNoError(upsertResult, "recipes upsert 실패");
}

async function upsertRecipeSource(supabase, fixtureData) {
  const existingResult = await supabase
    .from("recipe_sources")
    .select("id")
    .eq("recipe_id", fixtureData.ids.dbSmokeRecipeId)
    .limit(1);

  assertNoError(existingResult, "recipe_sources 조회 실패");

  const upsertResult = await supabase
    .from("recipe_sources")
    .upsert({
      id: existingResult.data?.[0]?.id ?? crypto.randomUUID(),
      recipe_id: fixtureData.ids.dbSmokeRecipeId,
      youtube_url: null,
      youtube_video_id: null,
      extraction_methods: ["manual"],
      extraction_meta_json: {},
      raw_extracted_text: null,
    }, { onConflict: "recipe_id" });

  assertNoError(upsertResult, "recipe_sources upsert 실패");
}

async function replaceRecipeIngredients(supabase, fixtureData, ingredientIdMap) {
  const deleteResult = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", fixtureData.ids.dbSmokeRecipeId);

  assertNoError(deleteResult, "recipe_ingredients 초기화 실패");

  const rows = fixtureData.recipe.ingredients.map((ingredient) => ({
    id: ingredient.id,
    recipe_id: fixtureData.ids.dbSmokeRecipeId,
    ingredient_id: ingredientIdMap.get(ingredient.ingredientId),
    amount: ingredient.amount,
    unit: ingredient.unit,
    ingredient_type: ingredient.ingredientType,
    display_text: ingredient.displayText,
    scalable: ingredient.scalable,
    sort_order: ingredient.sortOrder,
  }));

  const insertResult = await supabase.from("recipe_ingredients").insert(rows);
  assertNoError(insertResult, "recipe_ingredients 생성 실패");
}

async function replaceRecipeSteps(supabase, fixtureData, methodIdMap, ingredientIdMap) {
  const deleteResult = await supabase
    .from("recipe_steps")
    .delete()
    .eq("recipe_id", fixtureData.ids.dbSmokeRecipeId);

  assertNoError(deleteResult, "recipe_steps 초기화 실패");

  const rows = fixtureData.recipe.steps.map((step) => ({
    id: step.id,
    recipe_id: fixtureData.ids.dbSmokeRecipeId,
    step_number: step.stepNumber,
    instruction: step.instruction,
    cooking_method_id: methodIdMap.get(step.cookingMethodId),
    ingredients_used: (step.ingredientsUsed ?? []).map((item) => ({
      ...item,
      ingredient_id: ingredientIdMap.get(item.ingredient_id) ?? item.ingredient_id,
    })),
    heat_level: step.heatLevel,
    duration_seconds: step.durationSeconds,
    duration_text: step.durationText,
  }));

  const insertResult = await supabase.from("recipe_steps").insert(rows);
  assertNoError(insertResult, "recipe_steps 생성 실패");
}

async function listRecipeBooksByUser(supabase, userId) {
  const result = await supabase
    .from("recipe_books")
    .select("id, name, book_type, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  assertNoError(result, `recipe_books 조회 실패 (${userId})`);
  return result.data ?? [];
}

function getNextSortOrder(rows) {
  return rows.reduce((maxValue, row) => Math.max(maxValue, row.sort_order), -1) + 1;
}

async function ensureRecipeBook(supabase, { userId, preferredId, name, bookType }) {
  const currentBooks = await listRecipeBooksByUser(supabase, userId);
  const existing = currentBooks.find((book) => book.book_type === bookType)
    ?? currentBooks.find((book) => book.id === preferredId)
    ?? currentBooks.find((book) => book.name === name);

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  let insertResult = await supabase
    .from("recipe_books")
    .insert({
      id: preferredId,
      user_id: userId,
      name,
      book_type: bookType,
      sort_order: getNextSortOrder(currentBooks),
      created_at: now,
      updated_at: now,
    })
    .select("id, name, book_type, sort_order")
    .single();

  if (insertResult.error?.message?.toLowerCase().includes("duplicate key")) {
    insertResult = await supabase
      .from("recipe_books")
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        name,
        book_type: bookType,
        sort_order: getNextSortOrder(currentBooks),
        created_at: now,
        updated_at: now,
      })
      .select("id, name, book_type, sort_order")
      .single();
  }

  assertNoError(insertResult, `recipe_books 생성 실패 (${name})`);
  return insertResult.data;
}

async function ensurePlannerColumns(supabase, fixtureData, userId) {
  const listResult = await supabase
    .from("meal_plan_columns")
    .select("id, name, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  assertNoError(listResult, `meal_plan_columns 조회 실패 (${userId})`);

  const columns = [...(listResult.data ?? [])];

  for (const fixtureColumn of fixtureData.planner.columns) {
    const existing = columns.find((column) => column.name === fixtureColumn.name);

    if (existing) {
      continue;
    }

    if (columns.length >= 5) {
      throw new Error(
        `사용자 ${userId} 는 이미 5개 컬럼이 있어 QA 플래너 컬럼을 더 만들 수 없습니다.`,
      );
    }

    const insertResult = await supabase
      .from("meal_plan_columns")
      .insert({
        id: fixtureColumn.id,
        user_id: userId,
        name: fixtureColumn.name,
        sort_order: getNextSortOrder(columns),
        created_at: new Date().toISOString(),
      })
      .select("id, name, sort_order")
      .single();

    assertNoError(insertResult, `meal_plan_columns 생성 실패 (${fixtureColumn.name})`);
    columns.push(insertResult.data);
  }

  return columns;
}

async function seedRecipeLikes(supabase, recipeId, mainUserId, otherUserId) {
  const deleteResult = await supabase
    .from("recipe_likes")
    .delete()
    .eq("recipe_id", recipeId)
    .in("user_id", [mainUserId, otherUserId]);

  assertNoError(deleteResult, "recipe_likes 초기화 실패");

  const insertResult = await supabase
    .from("recipe_likes")
    .insert({
      id: crypto.randomUUID(),
      user_id: otherUserId,
      recipe_id: recipeId,
      created_at: new Date().toISOString(),
    });

  assertNoError(insertResult, "recipe_likes 생성 실패");
}

async function seedRecipeBookItems(
  supabase,
  {
    recipeId,
    mainSavedBookId,
    mainCustomBookId,
    otherSavedBookId,
  },
) {
  const deleteMainResult = await supabase
    .from("recipe_book_items")
    .delete()
    .eq("recipe_id", recipeId)
    .in("book_id", [mainSavedBookId, mainCustomBookId]);

  assertNoError(deleteMainResult, "main user recipe_book_items 초기화 실패");

  const deleteOtherResult = await supabase
    .from("recipe_book_items")
    .delete()
    .eq("recipe_id", recipeId)
    .eq("book_id", otherSavedBookId);

  assertNoError(deleteOtherResult, "other user recipe_book_items 초기화 실패");

  const insertOtherResult = await supabase
    .from("recipe_book_items")
    .insert({
      id: crypto.randomUUID(),
      book_id: otherSavedBookId,
      recipe_id: recipeId,
      added_at: new Date().toISOString(),
    });

  assertNoError(insertOtherResult, "recipe_book_items 생성 실패");
}

async function seedPlannerMeals(supabase, fixtureData, recipeId, userId, columnsByName, seedWindow) {
  const deleteResult = await supabase
    .from("meals")
    .delete()
    .in("id", fixtureData.planner.meals.map((meal) => meal.id));

  assertNoError(deleteResult, "meals 초기화 실패");

  const dateByAnchor = {
    start: seedWindow.startDate,
    mid: seedWindow.midDate,
    end: seedWindow.endDate,
  };

  const rows = fixtureData.planner.meals.map((meal) => {
    const columnName = fixtureData.planner.columns.find(
      (column) => column.id === meal.columnId,
    )?.name;
    const column = columnsByName.get(columnName);

    if (!column) {
      throw new Error(`플래너 컬럼을 찾을 수 없습니다: ${columnName ?? meal.columnId}`);
    }

    const planDate = dateByAnchor[meal.dateAnchor];
    const cookedAt =
      meal.status === "cook_done"
        ? `${planDate}T12:00:00.000Z`
        : null;

    return {
      id: meal.id,
      user_id: userId,
      recipe_id: recipeId,
      plan_date: planDate,
      column_id: column.id,
      planned_servings: meal.plannedServings,
      status: meal.status,
      is_leftover: meal.isLeftover,
      leftover_dish_id: null,
      shopping_list_id: null,
      cooked_at: cookedAt,
      created_at: `${planDate}T09:00:00.000Z`,
      updated_at: new Date().toISOString(),
    };
  });

  const insertResult = await supabase.from("meals").insert(rows);
  assertNoError(insertResult, "meals 생성 실패");
}

async function refreshRecipeCounters(supabase, recipeId) {
  const likeCountResult = await supabase
    .from("recipe_likes")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId);
  assertNoError(likeCountResult, "recipe_likes count 실패");

  const saveCountResult = await supabase
    .from("recipe_book_items")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId);
  assertNoError(saveCountResult, "recipe_book_items count 실패");

  const planCountResult = await supabase
    .from("meals")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId);
  assertNoError(planCountResult, "meals count 실패");

  const cookCountResult = await supabase
    .from("meals")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId)
    .eq("status", "cook_done");
  assertNoError(cookCountResult, "cook_done count 실패");

  const updateResult = await supabase
    .from("recipes")
    .update({
      like_count: likeCountResult.count ?? 0,
      save_count: saveCountResult.count ?? 0,
      plan_count: planCountResult.count ?? 0,
      cook_count: cookCountResult.count ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId);

  assertNoError(updateResult, "recipes 카운트 갱신 실패");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help === "true") {
    process.stdout.write(
      [
        "Usage: pnpm qa:seed:01-05 -- (--user-id <uuid> | --user-email <email>) [--other-user-id <uuid>] [--start-date YYYY-MM-DD]",
        "",
        "Seeds real Supabase rows for slices 01-05 smoke testing.",
        "Use a clean QA account for the most deterministic planner results.",
      ].join("\n") + "\n",
    );
    return;
  }

  const fixtureData = readFixtureData();
  const otherUserId = args["other-user-id"] ?? fixtureData.ids.otherFixtureUserId;
  const seedWindow = buildSeedWindow(args["start-date"]);
  const supabase = createSupabaseClient();
  let mainUserId = args["user-id"];

  if (!mainUserId && args["user-email"]) {
    mainUserId = await findUserIdByEmail(supabase, args["user-email"]);

    if (!mainUserId) {
      fail(
        `email ${args["user-email"]} 에 해당하는 users row가 없어요. local 로그인 후 보호 API를 한 번 호출해 bootstrap을 완료해주세요.`,
      );
    }
  }

  if (!mainUserId) {
    fail("--user-id <uuid> 또는 --user-email <email> 이 필요합니다.");
  }

  await ensureUser(supabase, {
    id: mainUserId,
    nickname: "QA 집밥 유저",
    email: null,
    socialId: `qa-main-${mainUserId}`,
  });
  await ensureUser(supabase, {
    id: otherUserId,
    nickname: "QA 다른 유저",
    email: null,
    socialId: `qa-other-${otherUserId}`,
  });

  const ingredientIdMap = new Map();

  for (const ingredient of fixtureData.ingredients) {
    ingredientIdMap.set(ingredient.id, await ensureIngredient(supabase, ingredient));
  }

  await seedIngredientSynonyms(supabase, fixtureData, ingredientIdMap);

  const methodIdMap = new Map();

  for (const method of fixtureData.cookingMethods) {
    methodIdMap.set(method.id, await ensureCookingMethod(supabase, method));
  }

  await upsertRecipe(supabase, fixtureData);
  await upsertRecipeSource(supabase, fixtureData);
  await replaceRecipeIngredients(supabase, fixtureData, ingredientIdMap);
  await replaceRecipeSteps(supabase, fixtureData, methodIdMap, ingredientIdMap);

  const mainMyAddedBook = await ensureRecipeBook(supabase, {
    userId: mainUserId,
    preferredId: crypto.randomUUID(),
    name: "내가 추가한 레시피",
    bookType: "my_added",
  });
  const mainSavedBook = await ensureRecipeBook(supabase, {
    userId: mainUserId,
    preferredId: fixtureData.ids.savedBookId,
    name: "저장한 레시피",
    bookType: "saved",
  });
  const mainLikedBook = await ensureRecipeBook(supabase, {
    userId: mainUserId,
    preferredId: crypto.randomUUID(),
    name: "좋아요한 레시피",
    bookType: "liked",
  });
  const mainCustomBook = await ensureRecipeBook(supabase, {
    userId: mainUserId,
    preferredId: fixtureData.ids.customBookId,
    name: "QA 주말 파티",
    bookType: "custom",
  });
  const otherSavedBook = await ensureRecipeBook(supabase, {
    userId: otherUserId,
    preferredId: fixtureData.ids.otherCustomBookId,
    name: "다른 유저 저장 레시피",
    bookType: "saved",
  });

  const plannerColumns = await ensurePlannerColumns(supabase, fixtureData, mainUserId);
  const columnsByName = new Map(plannerColumns.map((column) => [column.name, column]));

  await seedRecipeLikes(
    supabase,
    fixtureData.ids.dbSmokeRecipeId,
    mainUserId,
    otherUserId,
  );
  await seedRecipeBookItems(supabase, {
    recipeId: fixtureData.ids.dbSmokeRecipeId,
    mainSavedBookId: mainSavedBook.id,
    mainCustomBookId: mainCustomBook.id,
    otherSavedBookId: otherSavedBook.id,
  });
  await seedPlannerMeals(
    supabase,
    fixtureData,
    fixtureData.ids.dbSmokeRecipeId,
    mainUserId,
    columnsByName,
    seedWindow,
  );
  await refreshRecipeCounters(supabase, fixtureData.ids.dbSmokeRecipeId);

  process.stdout.write(
    [
      "Seeded DB smoke data for slices 01-05",
      `- main user: ${mainUserId}`,
      `- other user: ${otherUserId}`,
      `- recipe id: ${fixtureData.ids.dbSmokeRecipeId}`,
      `- recipe path: /recipe/${fixtureData.ids.dbSmokeRecipeId}`,
      `- planner window: ${seedWindow.startDate} ~ ${seedWindow.endDate}`,
      `- main saved book: ${mainSavedBook.id}`,
      `- main custom book: ${mainCustomBook.id}`,
      `- planner columns available: ${plannerColumns.map((column) => column.name).join(", ")}`,
      `- system books checked: ${[mainMyAddedBook.name, mainSavedBook.name, mainLikedBook.name].join(", ")}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
