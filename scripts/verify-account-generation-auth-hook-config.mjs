#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { assertAccountGenerationMergedExactSource } from "./lib/account-session-generation-remote-verifier.mjs";
import { resolveSecurityFunctionLinkedRoot } from "./security-function-linked-root.mjs";
import {
  resolveAccountGenerationProjectRef,
  resolveSupabaseManagementAccessToken,
  verifyAccountGenerationAuthHookConfig,
} from "./lib/account-generation-auth-hook-config-verifier.mjs";

/**
 * @typedef {Record<string, string | undefined>} LooseEnvironment
 * @typedef {(filePath: string, encoding: string) => string} ReadTextFile
 * @typedef {() => string} ReadKeychainSecret
 * @typedef {{ status: number, stdout: string, stderr: string }} SpawnResult
 * @typedef {(command: string, args: string[], options: { cwd: string, encoding: string }) => SpawnResult} SpawnSyncLike
 * @typedef {(options: { cwd: string, environment: LooseEnvironment, requireEnvironment: boolean }) => string} ResolveLinkedRoot
 * @typedef {{ write: (chunk: string) => unknown }} LooseWriter
 * @typedef {(url: string, init: RequestInit) => Promise<{ status: number, json: () => Promise<unknown> }>} MinimalFetch
 */

/**
 * @param {string[]} commandArgs
 * @param {{ cwd: string, spawnSyncImpl: SpawnSyncLike }} options
 */
function runGit(commandArgs, { cwd, spawnSyncImpl }) {
  const result = spawnSyncImpl("git", commandArgs, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${commandArgs[0]} failed`);
  }
  return result.stdout.trim();
}

/**
 * @param {{ cwd: string, spawnSyncImpl: SpawnSyncLike }} options
 */
function assertMergedOriginMaster({ cwd, spawnSyncImpl }) {
  runGit(["fetch", "--quiet", "origin", "master"], { cwd, spawnSyncImpl });
  const head = runGit(["rev-parse", "HEAD"], { cwd, spawnSyncImpl });
  const originMaster = runGit(["rev-parse", "origin/master"], { cwd, spawnSyncImpl });
  const trackedStatus = runGit(["status", "--porcelain"], { cwd, spawnSyncImpl });
  return assertAccountGenerationMergedExactSource({
    head,
    originMaster,
    trackedStatus,
  });
}

/**
 * @param {{ execFileSyncImpl: (command: string, args: string[], options: { encoding: string }) => string }} options
 */
export function readSupabaseCliKeychainSecret({ execFileSyncImpl }) {
  try {
    return execFileSyncImpl(
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", "Supabase CLI", "-a", "supabase"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    throw new Error("SUPABASE_ACCESS_TOKEN is required");
  }
}

/**
 * @param {{
 *   cwd?: string,
 *   env?: LooseEnvironment,
 *   platform?: string,
 *   fetchImpl?: MinimalFetch,
 *   readFile?: ReadTextFile,
 *   readKeychainSecret?: ReadKeychainSecret,
 *   execFileSyncImpl?: (command: string, args: string[], options: { encoding: string }) => string,
 *   spawnSyncImpl?: SpawnSyncLike,
 *   resolveLinkedRoot?: ResolveLinkedRoot,
 *   stdout?: LooseWriter,
 *   stderr?: LooseWriter,
 * }} [options]
 */
export async function runAccountGenerationAuthHookConfigVerification({
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform,
  fetchImpl = globalThis.fetch,
  readFile = readFileSync,
  execFileSyncImpl = execFileSync,
  readKeychainSecret = () =>
    readSupabaseCliKeychainSecret({ execFileSyncImpl }),
  spawnSyncImpl = spawnSync,
  resolveLinkedRoot = (options) => resolveSecurityFunctionLinkedRoot(options),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const mergeSha = assertMergedOriginMaster({ cwd, spawnSyncImpl });
    const linkedRoot = resolveLinkedRoot({
      cwd,
      environment: env,
      requireEnvironment: false,
    });
    const projectRef = resolveAccountGenerationProjectRef({
      cwd: linkedRoot,
      readFile,
    });
    const accessToken = resolveSupabaseManagementAccessToken({
      env,
      platform,
      readKeychainSecret,
    });
    const summary = await verifyAccountGenerationAuthHookConfig({
      projectRef,
      accessToken,
      fetchImpl,
    });

    stdout.write(`${JSON.stringify({ ...summary, mergeSha })}\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `account generation auth hook config verification failed: ${
        error instanceof Error ? error.message : "unexpected failure"
      }\n`,
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runAccountGenerationAuthHookConfigVerification();
  process.exit(exitCode);
}
