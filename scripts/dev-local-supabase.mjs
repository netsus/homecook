import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import {
  buildLocalSupabaseNextDevArgs,
  getLocalSupabaseNextArtifactsToReset,
  toLocalSupabaseNextEnvFileContent,
} from "./lib/dev-local-supabase-runtime.mjs";
import { createLocalSupabaseNextEnv } from "./lib/local-supabase-env.mjs";

const envFilePath = path.join(process.cwd(), ".env.development.local");
const envEntries = createLocalSupabaseNextEnv(process.env);

fs.writeFileSync(envFilePath, toLocalSupabaseNextEnvFileContent(envEntries), "utf8");

for (const artifactPath of getLocalSupabaseNextArtifactsToReset(process.cwd())) {
  fs.rmSync(artifactPath, {
    force: true,
    recursive: true,
  });
}

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
  buildLocalSupabaseNextDevArgs(process.argv.slice(2)),
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
