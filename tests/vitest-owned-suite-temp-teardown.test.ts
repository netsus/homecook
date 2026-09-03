import { existsSync, lstatSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const fixture = join(process.cwd(), "tests", "vitest-owned-suite-temp-subprocess.test.ts");
const signals = ["SIGHUP", "SIGINT", "SIGTERM"] as const;
const signalExitCodes = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 } as const;

function fixtureEnv(mode: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOMECOOK_VITEST_TEARDOWN_FIXTURE_MODE: mode };
  delete env.HOMECOOK_VITEST_SUITE_TEMP_ROOT;
  delete env.HOMECOOK_VITEST_WORKER_TEMP_ROOT;
  delete env.VITEST_POOL_ID;
  return env;
}

function extract(output: string, name: string) {
  const match = new RegExp(`^${name}=(.+)$`, "mu").exec(output);
  expect(match?.[1]).toBeTypeOf("string");
  return match![1];
}

function removeExactDirectory(path: string) {
  if (existsSync(path)) rmdirSync(path);
}

describe("independent Vitest suite teardown", () => {
  for (const mode of ["success", "failure", "replacement"] as const) {
    it(`removes the exact suite root after ${mode}`, () => {
      const result = spawnSync(process.execPath, [
        "node_modules/vitest/vitest.mjs", "run", fixture,
      ], { cwd: process.cwd(), env: fixtureEnv(mode), encoding: "utf8", timeout: 30_000 });
      const output = `${result.stdout}\n${result.stderr}`;
      const root = extract(output, "VITEST_SUITE_TEMP_ROOT");
      const worker = extract(output, "VITEST_TEARDOWN_WORKER");
      const sibling = extract(output, "VITEST_TEARDOWN_SIBLING");
      try {
        expect(result.status === 0).toBe(mode !== "failure");
        if (mode === "replacement") {
          const [replacementPath, device, inode] = extract(output, "VITEST_TEARDOWN_REPLACEMENT").split(":");
          const replacement = lstatSync(replacementPath, { bigint: true });
          expect(String(replacement.dev)).toBe(device);
          expect(String(replacement.ino)).toBe(inode);
          expect(() => lstatSync(extract(output, "VITEST_TEARDOWN_RELOCATED")))
            .toThrowError(expect.objectContaining({ code: "ENOENT" }));
          removeExactDirectory(replacementPath);
        } else {
          expect(() => lstatSync(root)).toThrowError(expect.objectContaining({ code: "ENOENT" }));
        }
        expect(() => lstatSync(worker)).toThrowError(expect.objectContaining({ code: "ENOENT" }));
        expect(existsSync(sibling)).toBe(true);
      } finally {
        removeExactDirectory(sibling);
      }
    }, 35_000);
  }

  for (const signal of signals) {
    it(`removes the exact suite root after ${signal}`, async () => {
      const env = fixtureEnv("signal");
      const otherHandlerMarker = join(
        process.env.HOMECOOK_VITEST_WORKER_TEMP_ROOT!,
        `other-signal-handler-${signal}-${process.pid}`,
      );
      env.HOMECOOK_VITEST_TEARDOWN_SIGNAL = signal;
      env.HOMECOOK_VITEST_TEARDOWN_OTHER_HANDLER_MARKER = otherHandlerMarker;
      env.NODE_OPTIONS = [
        env.NODE_OPTIONS,
        `--require=${join(process.cwd(), "tests", "fixtures", "vitest-other-signal-handler.cjs")}`,
      ].filter(Boolean).join(" ");
      const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", fixture], {
        cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("teardown fixture did not become ready")), 15_000);
        const inspect = () => {
          if (!output.includes("VITEST_TEARDOWN_READY=1")) return;
          clearTimeout(timeout);
          child.stdout.off("data", inspect);
          resolve();
        };
        child.stdout.on("data", inspect);
      });
      const root = extract(output, "VITEST_SUITE_TEMP_ROOT");
      const worker = extract(output, "VITEST_TEARDOWN_WORKER");
      const sibling = extract(output, "VITEST_TEARDOWN_SIBLING");
      child.kill(signal);
      const [exitCode, exitSignal] = await once(child, "exit");
      try {
        expect(exitSignal).toBeNull();
        expect(exitCode).toBe(signalExitCodes[signal]);
        expect(readFileSync(otherHandlerMarker, "utf8")).toBe(`${signal}:true\n`);
        expect(() => lstatSync(root)).toThrowError(expect.objectContaining({ code: "ENOENT" }));
        expect(() => lstatSync(worker)).toThrowError(expect.objectContaining({ code: "ENOENT" }));
        expect(existsSync(sibling)).toBe(true);
      } finally {
        if (existsSync(otherHandlerMarker)) unlinkSync(otherHandlerMarker);
        removeExactDirectory(sibling);
      }
    }, 35_000);
  }
});
