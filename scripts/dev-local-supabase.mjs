import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import { createLocalSupabaseNextEnv } from "./lib/local-supabase-env.mjs";

const envFilePath = path.join(process.cwd(), ".env.development.local");
const envEntries = createLocalSupabaseNextEnv(process.env);

function toEnvFileContent(env) {
  return [
    `NEXT_PUBLIC_SUPABASE_URL=${env.NEXT_PUBLIC_SUPABASE_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${env.SUPABASE_SERVICE_ROLE_KEY}`,
    `NEXT_PUBLIC_APP_URL=${env.NEXT_PUBLIC_APP_URL}`,
    "HOMECOOK_ENABLE_LOCAL_DEV_AUTH=1",
    "NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH=1",
    `NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH=${env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH ?? "0"}`,
    "",
  ].join("\n");
}

fs.writeFileSync(envFilePath, toEnvFileContent(envEntries), "utf8");

let cleanedUp = false;

function cleanupEnvFile() {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;

  if (fs.existsSync(envFilePath)) {
    fs.unlinkSync(envFilePath);
  }
}

const child = spawn(
  "pnpm",
  ["exec", "next", "dev", ...process.argv.slice(2)],
  {
    env: envEntries,
    stdio: "inherit",
  },
);

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    cleanupEnvFile();
  });
});

child.on("exit", (code, signal) => {
  cleanupEnvFile();

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
