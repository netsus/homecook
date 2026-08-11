import { describe, expect, it } from "vitest";

import {
  EXACT_OBSERVATION_SQL,
  readFullLocalSessionObservation,
  resolveTrustedDockerBinary,
} from "../scripts/lib/full-local-session-observation-reader.mjs";

const CONTAINER_ID = "a".repeat(64);

function successfulExecutionFixture() {
  const calls: Array<{
    args: string[];
    command: string;
    options: Record<string, unknown>;
  }> = [];
  const execute = (command: string, args: string[], options: Record<string, unknown>) => {
    calls.push({ args, command, options });
    if (args[0] === "ps") {
      return { status: 0, stderr: "", stdout: `${CONTAINER_ID}\n` };
    }
    if (args[0] === "inspect") {
      return {
        status: 0,
        stderr: "",
        stdout: `${JSON.stringify({
          health: "healthy",
          id: CONTAINER_ID,
          project: "homecook-full-local-isolated",
          running: true,
          service: "postgres",
          status: "running",
        })}\n`,
      };
    }
    return {
      status: 0,
      stderr: "",
      stdout: `${JSON.stringify({
        account_session_stale_count: 0,
        counter_scope: "SINCE_DEPLOY",
        first_stale_at: null,
        observation_started_at: "2026-08-09T00:00:00.000Z",
        stale_token_mutation_count: 0,
      })}\n`,
    };
  };
  return { calls, execute };
}

describe("full-local session observation reader", () => {
  it("accepts the exact root symlink to a root/current-user owned non-world-writable Docker app", () => {
    const lstat = (candidate: string) => ({
      isDirectory: () => candidate !== "/usr/local/bin/docker"
        && candidate !== "/Applications/Docker.app/Contents/Resources/bin/docker",
      isFile: () => candidate === "/Applications/Docker.app/Contents/Resources/bin/docker",
      isSymbolicLink: () => candidate === "/usr/local/bin/docker",
      mode: candidate === "/Applications" ? 0o40775 : 0o40755,
      uid: candidate === "/usr/local/bin/docker" || candidate === "/Applications" ? 0 : 501,
    });
    expect(resolveTrustedDockerBinary({
      currentUid: 501,
      lstat,
      realpath: () => "/Applications/Docker.app/Contents/Resources/bin/docker",
    })).toBe("/Applications/Docker.app/Contents/Resources/bin/docker");

    expect(() => resolveTrustedDockerBinary({
      currentUid: 501,
      lstat: (candidate: string) => ({
        ...lstat(candidate),
        mode: candidate === "/Applications/Docker.app" ? 0o40757 : lstat(candidate).mode,
      }),
      realpath: () => "/Applications/Docker.app/Contents/Resources/bin/docker",
    })).toThrow(/Docker binary trust/u);
  });

  it("verifies the exact healthy compose container and runs only the fixed aggregate SQL", () => {
    const { calls, execute } = successfulExecutionFixture();

    expect(readFullLocalSessionObservation({
      dockerBin: "/fixture/docker",
      execute,
    })).toEqual({
      accountSessionStaleCount: 0,
      counterScope: "SINCE_DEPLOY",
      firstStaleAt: null,
      observationStartedAt: "2026-08-09T00:00:00.000Z",
      staleTokenMutationCount: 0,
    });

    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.command === "/fixture/docker")).toBe(true);
    expect(calls[0]?.args).toEqual(expect.arrayContaining([
      "label=com.docker.compose.project=homecook-full-local-isolated",
      "label=com.docker.compose.service=postgres",
    ]));
    expect(calls[1]?.args.at(-1)).toBe(CONTAINER_ID);
    expect(calls[2]?.args).toEqual([
      "exec",
      "--interactive",
      CONTAINER_ID,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--quiet",
      "--username=supabase_admin",
      "--dbname=postgres",
      `--command=${EXACT_OBSERVATION_SQL}`,
    ]);
    expect(calls[2]?.options).toEqual(expect.objectContaining({
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin" },
    }));
  });

  it("fails closed for ambiguous or unhealthy container identity", () => {
    const multiple = successfulExecutionFixture();
    const multipleExecute = (...args: Parameters<typeof multiple.execute>) => {
      const result = multiple.execute(...args);
      return multiple.calls.length === 1
        ? { ...result, stdout: `${CONTAINER_ID}\n${"b".repeat(64)}\n` }
        : result;
    };
    expect(() => readFullLocalSessionObservation({
      dockerBin: "/fixture/docker",
      execute: multipleExecute,
    })).toThrow(/container/u);

    const unhealthy = successfulExecutionFixture();
    const unhealthyExecute = (...args: Parameters<typeof unhealthy.execute>) => {
      const result = unhealthy.execute(...args);
      return unhealthy.calls.length === 2
        ? { ...result, stdout: result.stdout.replace('"healthy"', '"unhealthy"') }
        : result;
    };
    expect(() => readFullLocalSessionObservation({
      dockerBin: "/fixture/docker",
      execute: unhealthyExecute,
    })).toThrow(/container/u);
  });

  it("rejects unsafe, multiline, or schema-drifted SQL output without exposing it", () => {
    for (const stdout of [
      '{"counter_scope":"SINCE_DEPLOY"}\n{"unexpected":true}\n',
      '{"counter_scope":"SINCE_DEPLOY","observation_started_at":"2026-08-09T00:00:00.000Z","account_session_stale_count":0,"stale_token_mutation_count":0,"first_stale_at":null,"access_token":"unsafe"}\n',
      '{"counter_scope":"SINCE_DEPLOY","observation_started_at":"2026-08-09T00:00:00.000Z","account_session_stale_count":"0","stale_token_mutation_count":0,"first_stale_at":null}\n',
    ]) {
      const fixture = successfulExecutionFixture();
      const execute = (...args: Parameters<typeof fixture.execute>) => {
        const result = fixture.execute(...args);
        return fixture.calls.length === 3 ? { ...result, stdout } : result;
      };
      expect(() => readFullLocalSessionObservation({
        dockerBin: "/fixture/docker",
        execute,
      })).toThrow(/observation/u);
    }
  });
});
