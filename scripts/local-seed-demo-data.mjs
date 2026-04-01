#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import { readLocalSupabaseEnv } from "./lib/local-supabase-env.mjs";

const LOCAL_DEMO_ACCOUNTS = [
  {
    id: "main",
    email: "local-tester@homecook.local",
    password: "homecook-local-dev",
    nickname: "로컬 테스트 계정",
    socialId: "local-demo-main",
  },
  {
    id: "other",
    email: "local-other@homecook.local",
    password: "homecook-local-peer",
    nickname: "로컬 다른 유저",
    socialId: "local-demo-other",
  },
];

const EXTRA_DEMO_RECIPES = [
  {
    id: "660e8400-e29b-41d4-a716-446655440101",
    title: "버터 간장 계란밥",
    description: "퇴근 후 10분 안에 만드는 고소한 한 그릇 식사",
    tags: ["한식", "초간단", "점심"],
    baseServings: 1,
    sourceType: "system",
    viewCount: 89,
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440102",
    title: "두부 된장국",
    description: "가볍게 끓여도 감칠맛이 살아나는 집밥 국물",
    tags: ["한식", "국", "저녁"],
    baseServings: 2,
    sourceType: "system",
    viewCount: 64,
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440103",
    title: "간장 제육볶음",
    description: "맵지 않게 볶아 아이와 함께 먹기 좋은 제육 메뉴",
    tags: ["한식", "볶음", "저녁"],
    baseServings: 3,
    sourceType: "system",
    viewCount: 112,
  },
];

const EXTRA_DEMO_MEALS = [
  {
    id: "660e8400-e29b-41d4-a716-446655440201",
    recipeId: EXTRA_DEMO_RECIPES[0].id,
    columnName: "아침",
    dayOffset: 1,
    plannedServings: 1,
    status: "registered",
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440202",
    recipeId: EXTRA_DEMO_RECIPES[1].id,
    columnName: "점심",
    dayOffset: 4,
    plannedServings: 2,
    status: "shopping_done",
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440203",
    recipeId: EXTRA_DEMO_RECIPES[2].id,
    columnName: "저녁",
    dayOffset: 5,
    plannedServings: 3,
    status: "registered",
  },
];

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

function assertNoError(result, message) {
  if (result.error) {
    throw new Error(`${message}: ${result.error.message}`);
  }
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

async function listAuthUsersByEmail(supabase) {
  const usersByEmail = new Map();
  let page = 1;

  while (true) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    assertNoError(result, "auth users 조회 실패");

    const users = result.data?.users ?? [];

    for (const user of users) {
      if (user.email) {
        usersByEmail.set(user.email, user);
      }
    }

    if (users.length < 200) {
      break;
    }

    page += 1;
  }

  return usersByEmail;
}

async function ensureAuthUser(supabase, usersByEmail, account) {
  const existing = usersByEmail.get(account.email);

  if (existing) {
    const result = await supabase.auth.admin.updateUserById(existing.id, {
      password: account.password,
      user_metadata: {
        nickname: account.nickname,
      },
    });
    assertNoError(result, `auth user 갱신 실패 (${account.email})`);

    if (!result.data.user) {
      throw new Error(`auth user 갱신 결과가 비어 있어요. (${account.email})`);
    }

    usersByEmail.set(account.email, result.data.user);
    return result.data.user;
  }

  const result = await supabase.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: {
      nickname: account.nickname,
    },
  });
  assertNoError(result, `auth user 생성 실패 (${account.email})`);

  if (!result.data.user) {
    throw new Error(`auth user 생성 결과가 비어 있어요. (${account.email})`);
  }

  usersByEmail.set(account.email, result.data.user);
  return result.data.user;
}

async function ensurePublicUserRow(supabase, account, authUserId) {
  const existingResult = await supabase
    .from("users")
    .select("id, email, nickname")
    .eq("id", authUserId)
    .maybeSingle();

  assertNoError(existingResult, `public users 조회 실패 (${account.email})`);

  const now = new Date().toISOString();

  if (!existingResult.data) {
    const insertResult = await supabase
      .from("users")
      .insert({
        id: authUserId,
        nickname: account.nickname,
        email: account.email,
        profile_image_url: null,
        social_provider: "google",
        social_id: account.socialId,
        settings_json: {},
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });

    assertNoError(insertResult, `public users 생성 실패 (${account.email})`);
    return authUserId;
  }

  const updateResult = await supabase
    .from("users")
    .update({
      nickname: account.nickname,
      email: account.email,
      updated_at: now,
    })
    .eq("id", authUserId);

  assertNoError(updateResult, `public users 갱신 실패 (${account.email})`);
  return authUserId;
}

function runCoreQaSeed(env, { mainUserId, otherUserId, startDate }) {
  const args = [
    "scripts/qa-seed-slices-01-05.mjs",
    "--user-id",
    mainUserId,
    "--other-user-id",
    otherUserId,
  ];

  if (startDate) {
    args.push("--start-date", startDate);
  }

  const result = spawnSync("node", args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: env.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function listRecipeBooksByUser(supabase, userId) {
  const result = await supabase
    .from("recipe_books")
    .select("id, name, book_type")
    .eq("user_id", userId);

  assertNoError(result, `recipe_books 조회 실패 (${userId})`);
  return result.data ?? [];
}

async function listPlannerColumnsByUser(supabase, userId) {
  const result = await supabase
    .from("meal_plan_columns")
    .select("id, name")
    .eq("user_id", userId);

  assertNoError(result, `meal_plan_columns 조회 실패 (${userId})`);
  return result.data ?? [];
}

async function upsertExtraRecipes(supabase, recipes) {
  const now = new Date().toISOString();

  const result = await supabase
    .from("recipes")
    .upsert(
      recipes.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        description: recipe.description,
        thumbnail_url: null,
        base_servings: recipe.baseServings,
        tags: recipe.tags,
        source_type: recipe.sourceType,
        created_by: null,
        view_count: recipe.viewCount,
        like_count: 0,
        save_count: 0,
        plan_count: 0,
        cook_count: 0,
        created_at: now,
        updated_at: now,
      })),
      { onConflict: "id" },
    );

  assertNoError(result, "추가 demo recipes upsert 실패");
}

async function seedExtraRecipeLikes(supabase, mainUserId, otherUserId) {
  const recipeIds = EXTRA_DEMO_RECIPES.map((recipe) => recipe.id);
  const deleteResult = await supabase
    .from("recipe_likes")
    .delete()
    .in("recipe_id", recipeIds)
    .in("user_id", [mainUserId, otherUserId]);

  assertNoError(deleteResult, "추가 demo recipe_likes 초기화 실패");

  const insertResult = await supabase
    .from("recipe_likes")
    .insert([
      {
        id: crypto.randomUUID(),
        user_id: mainUserId,
        recipe_id: EXTRA_DEMO_RECIPES[0].id,
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        user_id: otherUserId,
        recipe_id: EXTRA_DEMO_RECIPES[1].id,
        created_at: new Date().toISOString(),
      },
    ]);

  assertNoError(insertResult, "추가 demo recipe_likes 생성 실패");
}

async function seedExtraBookItems(supabase, {
  mainSavedBookId,
  mainCustomBookId,
  otherSavedBookId,
}) {
  const recipeIds = EXTRA_DEMO_RECIPES.map((recipe) => recipe.id);
  const deleteResult = await supabase
    .from("recipe_book_items")
    .delete()
    .in("recipe_id", recipeIds)
    .in("book_id", [mainSavedBookId, mainCustomBookId, otherSavedBookId]);

  assertNoError(deleteResult, "추가 demo recipe_book_items 초기화 실패");

  const insertResult = await supabase
    .from("recipe_book_items")
    .insert([
      {
        id: crypto.randomUUID(),
        book_id: mainCustomBookId,
        recipe_id: EXTRA_DEMO_RECIPES[1].id,
        added_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        book_id: mainSavedBookId,
        recipe_id: EXTRA_DEMO_RECIPES[2].id,
        added_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        book_id: otherSavedBookId,
        recipe_id: EXTRA_DEMO_RECIPES[0].id,
        added_at: new Date().toISOString(),
      },
    ]);

  assertNoError(insertResult, "추가 demo recipe_book_items 생성 실패");
}

async function seedExtraPlannerMeals(supabase, {
  mainUserId,
  columnsByName,
  seedWindow,
}) {
  const deleteResult = await supabase
    .from("meals")
    .delete()
    .in("id", EXTRA_DEMO_MEALS.map((meal) => meal.id));

  assertNoError(deleteResult, "추가 demo meals 초기화 실패");

  const rows = EXTRA_DEMO_MEALS.map((meal) => {
    const column = columnsByName.get(meal.columnName);

    if (!column) {
      throw new Error(`planner column을 찾지 못했어요. (${meal.columnName})`);
    }

    const planDate = addUtcDays(seedWindow.startDate, meal.dayOffset);

    return {
      id: meal.id,
      user_id: mainUserId,
      recipe_id: meal.recipeId,
      plan_date: planDate,
      column_id: column.id,
      planned_servings: meal.plannedServings,
      status: meal.status,
      is_leftover: false,
      leftover_dish_id: null,
      shopping_list_id: null,
      cooked_at: meal.status === "cook_done" ? `${planDate}T12:00:00.000Z` : null,
      created_at: `${planDate}T08:00:00.000Z`,
      updated_at: new Date().toISOString(),
    };
  });

  const insertResult = await supabase.from("meals").insert(rows);
  assertNoError(insertResult, "추가 demo meals 생성 실패");
}

async function refreshRecipeCounters(supabase, recipeId) {
  const recipeResult = await supabase
    .from("recipes")
    .select("view_count")
    .eq("id", recipeId)
    .maybeSingle();
  assertNoError(recipeResult, `recipes 조회 실패 (${recipeId})`);

  const likeCountResult = await supabase
    .from("recipe_likes")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId);
  assertNoError(likeCountResult, `recipe_likes count 실패 (${recipeId})`);

  const saveCountResult = await supabase
    .from("recipe_book_items")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId);
  assertNoError(saveCountResult, `recipe_book_items count 실패 (${recipeId})`);

  const planCountResult = await supabase
    .from("meals")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId);
  assertNoError(planCountResult, `meals count 실패 (${recipeId})`);

  const cookCountResult = await supabase
    .from("meals")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId)
    .eq("status", "cook_done");
  assertNoError(cookCountResult, `cook_done count 실패 (${recipeId})`);

  const updateResult = await supabase
    .from("recipes")
    .update({
      view_count: recipeResult.data?.view_count ?? 0,
      like_count: likeCountResult.count ?? 0,
      save_count: saveCountResult.count ?? 0,
      plan_count: planCountResult.count ?? 0,
      cook_count: cookCountResult.count ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId);

  assertNoError(updateResult, `recipes 카운트 갱신 실패 (${recipeId})`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localEnv = readLocalSupabaseEnv();
  const seedWindow = buildSeedWindow(args["start-date"]);
  const supabase = createClient(localEnv.API_URL, localEnv.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const usersByEmail = await listAuthUsersByEmail(supabase);
  const authUsers = {};

  for (const account of LOCAL_DEMO_ACCOUNTS) {
    const authUser = await ensureAuthUser(supabase, usersByEmail, account);

    await ensurePublicUserRow(supabase, account, authUser.id);
    authUsers[account.id] = authUser;
  }

  runCoreQaSeed(localEnv, {
    mainUserId: authUsers.main.id,
    otherUserId: authUsers.other.id,
    startDate: args["start-date"],
  });

  await upsertExtraRecipes(supabase, EXTRA_DEMO_RECIPES);

  const mainBooks = await listRecipeBooksByUser(supabase, authUsers.main.id);
  const otherBooks = await listRecipeBooksByUser(supabase, authUsers.other.id);
  const plannerColumns = await listPlannerColumnsByUser(supabase, authUsers.main.id);
  const columnsByName = new Map(plannerColumns.map((column) => [column.name, column]));

  const mainSavedBook = mainBooks.find((book) => book.book_type === "saved");
  const mainCustomBook = mainBooks.find((book) => book.book_type === "custom");
  const otherSavedBook = otherBooks.find((book) => book.book_type === "saved");

  if (!mainSavedBook || !mainCustomBook || !otherSavedBook) {
    fail("demo dataset용 recipe book을 찾지 못했어요. core QA seed 결과를 확인해주세요.");
  }

  await seedExtraRecipeLikes(supabase, authUsers.main.id, authUsers.other.id);
  await seedExtraBookItems(supabase, {
    mainSavedBookId: mainSavedBook.id,
    mainCustomBookId: mainCustomBook.id,
    otherSavedBookId: otherSavedBook.id,
  });
  await seedExtraPlannerMeals(supabase, {
    mainUserId: authUsers.main.id,
    columnsByName,
    seedWindow,
  });

  for (const recipe of EXTRA_DEMO_RECIPES) {
    await refreshRecipeCounters(supabase, recipe.id);
  }

  process.stdout.write(
    [
      "Seeded local demo dataset for slices 01-05",
      `- main account: ${LOCAL_DEMO_ACCOUNTS[0].email} / ${LOCAL_DEMO_ACCOUNTS[0].password}`,
      `- other account: ${LOCAL_DEMO_ACCOUNTS[1].email} / ${LOCAL_DEMO_ACCOUNTS[1].password}`,
      "- detail recipe: /recipe/550e8400-e29b-41d4-a716-446655440022",
      `- extra discovery recipes: ${EXTRA_DEMO_RECIPES.map((recipe) => recipe.title).join(", ")}`,
      `- planner window: ${seedWindow.startDate} ~ ${seedWindow.endDate}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
