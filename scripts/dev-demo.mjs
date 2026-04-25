#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import { ensureDockerRunning } from "./lib/local-docker.mjs";
import { buildDevDemoPlan } from "./lib/dev-demo-runtime.mjs";
import { withLocalGoogleOAuthEnv } from "./lib/local-google-oauth-env.mjs";
import { readLocalSupabaseEnv } from "./lib/local-supabase-env.mjs";

const DEMO_MAIN_EMAIL = "local-tester@homecook.local";
const DEMO_OTHER_EMAIL = "local-other@homecook.local";
const DEMO_DETAIL_RECIPE_ID = "550e8400-e29b-41d4-a716-446655440022";

function parseArgs(argv) {
  const seedArgs = [];
  const nextArgs = [];
  let reset = false;
  let seed = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      nextArgs.push(...argv.slice(index + 1));
      break;
    }

    if (token === "--reset") {
      reset = true;
      continue;
    }

    if (token === "--seed") {
      seed = true;
      continue;
    }

    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }

    if (token === "--start-date") {
      const nextValue = argv[index + 1];

      if (nextValue && !nextValue.startsWith("-")) {
        seedArgs.push(token, nextValue);
        index += 1;
        continue;
      }
    }

    nextArgs.push(token);
  }

  return {
    help,
    nextArgs,
    reset,
    seed,
    seedArgs,
  };
}

function runStep(command, args, label) {
  process.stdout.write(`${label}\n`);

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: withLocalGoogleOAuthEnv(process.env),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function isDemoDatasetReady() {
  const env = readLocalSupabaseEnv();
  const supabase = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const usersResult = await supabase
    .from("users")
    .select("id, email")
    .in("email", [DEMO_MAIN_EMAIL, DEMO_OTHER_EMAIL]);

  if (usersResult.error) {
    return false;
  }

  if ((usersResult.data ?? []).length < 2) {
    return false;
  }

  const mainUser = usersResult.data?.find((user) => user.email === DEMO_MAIN_EMAIL);

  if (!mainUser) {
    return false;
  }

  const [booksResult, columnsResult, recipeResult, pantryResult] = await Promise.all([
    supabase
      .from("recipe_books")
      .select("book_type")
      .eq("user_id", mainUser.id)
      .in("book_type", ["saved", "custom"]),
    supabase
      .from("meal_plan_columns")
      .select("id")
      .eq("user_id", mainUser.id),
    supabase
      .from("recipes")
      .select("id")
      .eq("id", DEMO_DETAIL_RECIPE_ID)
      .maybeSingle(),
    supabase
      .from("pantry_items")
      .select("id")
      .eq("user_id", mainUser.id)
      .limit(1),
  ]);

  if (booksResult.error || columnsResult.error || recipeResult.error || pantryResult.error) {
    return false;
  }

  return (booksResult.data?.length ?? 0) >= 2
    && (columnsResult.data?.length ?? 0) >= 3
    && Boolean(recipeResult.data?.id)
    && (pantryResult.data?.length ?? 0) >= 1;
}

function startNextDev(nextArgs) {
  const child = spawn(
    "node",
    ["scripts/dev-local-supabase.mjs", ...nextArgs],
    {
      cwd: process.cwd(),
      env: withLocalGoogleOAuthEnv(process.env),
      stdio: "inherit",
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(
      [
        "Usage:",
        "  pnpm dev:demo",
        "  pnpm dev:demo:reset",
        "  pnpm dev:demo -- --seed",
        "  pnpm dev:demo -- -p 3001",
        "",
        "Options:",
        "  --reset      local Supabase reset + demo dataset 재구성 후 앱 실행",
        "  --seed       reset 없이 demo dataset만 다시 주입 후 앱 실행",
        "  --start-date YYYY-MM-DD  planner demo window anchor 조정",
      ].join("\n") + "\n",
    );
    return;
  }

  await ensureDockerRunning();

  const isReady = args.reset || args.seed ? false : await isDemoDatasetReady();
  const plan = buildDevDemoPlan({
    isReady,
    nextArgs: args.nextArgs,
    reset: args.reset,
    seed: args.seed,
    seedArgs: args.seedArgs,
  });

  for (const step of plan) {
    if (step.kind === "command") {
      runStep(step.command, step.args, step.label);
      continue;
    }

    if (step.kind === "message") {
      process.stdout.write(`${step.label}\n`);
      continue;
    }

    if (step.kind === "start-app") {
      process.stdout.write(`${step.label}\n`);
      startNextDev(step.args);
      return;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
