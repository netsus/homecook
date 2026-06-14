import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const CACHE_DIR = path.join(PROJECT_ROOT, "notebooks/recipe_loop_data/cache/semantic-judge");
const DEFAULT_SCHEMA_PATH = path.join(PROJECT_ROOT, "scripts/recipe-loop/semantic-judge.schema.json");

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function cacheKey(parts) {
  return sha256(JSON.stringify(parts)).slice(0, 32);
}

let mockResponses = null;

function nextMockResponse() {
  if (process.env.CODEX_JUDGE_FAIL_IF_CALLED === "1") {
    throw new Error("Codex judge was called while CODEX_JUDGE_FAIL_IF_CALLED=1");
  }
  if (process.env.CODEX_JUDGE_MOCK_RESPONSES) {
    if (!mockResponses) {
      mockResponses = JSON.parse(process.env.CODEX_JUDGE_MOCK_RESPONSES);
      if (!Array.isArray(mockResponses)) throw new Error("CODEX_JUDGE_MOCK_RESPONSES must be a JSON array");
    }
    if (mockResponses.length === 0) throw new Error("CODEX_JUDGE_MOCK_RESPONSES is exhausted");
    return mockResponses.shift();
  }
  if (process.env.CODEX_JUDGE_MOCK_RESPONSE) {
    return JSON.parse(process.env.CODEX_JUDGE_MOCK_RESPONSE);
  }
  return null;
}

async function runCodexExec({ prompt, model, effort, timeoutMs, schemaPath }) {
  const workdir = await mkdtemp(path.join(tmpdir(), "homecook-codex-judge-"));
  const outputPath = path.join(workdir, "semantic-grade.json");
  const resolvedSchemaPath = path.resolve(schemaPath || DEFAULT_SCHEMA_PATH);
  if (!existsSync(resolvedSchemaPath)) {
    throw new Error(`semantic judge schema not found: ${resolvedSchemaPath}`);
  }

  const args = [
    "exec",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--cd",
    workdir,
    "-m",
    model,
    "-c",
    `model_reasoning_effort=${effort}`,
    "--output-schema",
    resolvedSchemaPath,
    "--output-last-message",
    outputPath,
    "-",
  ];

  try {
    const result = await new Promise((resolve, reject) => {
      const proc = spawn("codex", args, {
        cwd: workdir,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 2000).unref();
      }, timeoutMs);

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      proc.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`Codex judge timeout after ${timeoutMs}ms`));
          return;
        }
        if (code !== 0) {
          reject(new Error(`Codex judge exited ${code}: ${(stderr || stdout).slice(0, 400)}`));
          return;
        }
        resolve({ stdout, stderr });
      });
      proc.stdin.end(prompt);
    });

    if (!existsSync(outputPath)) {
      throw new Error(`Codex judge did not write output-last-message: ${result.stdout.slice(0, 200)}`);
    }
    return JSON.parse(await readFile(outputPath, "utf8"));
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

export function createCodexJudgeClient(options = {}) {
  const model = options.model || "gpt-5.4";
  const effort = options.effort || "high";
  const timeoutMs = Number(options.timeoutMs ?? 200000);
  const schemaPath = options.schemaPath || DEFAULT_SCHEMA_PATH;

  return {
    async generate({ prompt, inputText, split, id, outTag, schemaVersion = 1, promptVersion = "semantic-judge-v2" }) {
      const keyParts = {
        provider: "codex",
        model,
        effort,
        prompt_hash: sha256(prompt),
        input_hash: sha256(inputText),
        split,
        id,
        outTag,
        schemaVersion,
        promptVersion,
      };
      const key = cacheKey(keyParts);
      const cachePath = path.join(CACHE_DIR, `${key}.json`);

      if (!options.noCache && existsSync(cachePath)) {
        const cached = JSON.parse(await readFile(cachePath, "utf8"));
        return { json: cached.json, cached: true, model, effort };
      }

      const mock = nextMockResponse();
      const json = mock ?? await runCodexExec({ prompt, model, effort, timeoutMs, schemaPath });
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cachePath, JSON.stringify({ key, keyParts, model, effort, json }, null, 2) + "\n", "utf8");
      return { json, cached: false, model, effort };
    },
  };
}
