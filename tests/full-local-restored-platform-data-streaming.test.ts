import type { SpawnSyncOptions } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { restoredPlatformDataSnapshot } from "@/scripts/full-local-production-runtime.mjs";
import {
  hashPlatformFile,
  PLATFORM_DATA_SEMANTIC_FORMAT,
  sanitizePlatformDataFile,
} from "@/scripts/lib/full-local-platform-data-file.mjs";

const capture = vi.hoisted(() => ({
  dump: "",
  fail: false,
  calls: 0,
  expectedArgs: [] as string[],
  temporaryRoot: "",
  stagingPaths: [] as string[],
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const { join } = await import("node:path");
  return {
    ...actual,
    mkdtempSync: (...args: Parameters<typeof actual.mkdtempSync>) => {
      const path = actual.mkdtempSync(...args);
      if (args[0] === join(capture.temporaryRoot, "homecook-restored-data-")) {
        if (typeof path !== "string") throw new Error("Expected a string staging path");
        capture.stagingPaths.push(path);
      }
      return path;
    },
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { writeSync } = await import("node:fs");
  const { dirname, sep } = await import("node:path");
  return {
    ...actual,
    spawnSync: (command: string, args: string[], options: SpawnSyncOptions) => {
      if (command === "/usr/bin/sort") {
        expect(args.slice(0, 3)).toEqual(["-S", "16M", "-T"]);
        expect(args).toHaveLength(5);
        expect(args[3].startsWith(`${capture.temporaryRoot}${sep}`)).toBe(true);
        expect(dirname(args[4])).toBe(args[3]);
        expect(options.env?.LC_ALL).toBe("C");
        return actual.spawnSync(command, args, options);
      }
      if (command !== "docker") throw new Error(`Unexpected fixture command: ${command}`);
      expect(args).toEqual(capture.expectedArgs);
      if (!Array.isArray(options.stdio) || typeof options.stdio[1] !== "number") {
        throw new Error("The dump fixture requires an open output file descriptor");
      }
      expect(options.stdio[0]).toBe("ignore");
      capture.calls += 1;
      if (!capture.fail) writeSync(options.stdio[1], capture.dump);
      return {
        pid: 0, status: capture.fail ? 1 : 0, signal: null,
        output: [null, Buffer.alloc(0), Buffer.alloc(0)],
        stdout: Buffer.alloc(0), stderr: Buffer.alloc(0),
      };
    },
  };
});

// Cross the 64 KiB read boundary with UTF-8, using synthetic values only.
const durable = `COPY public.users (id, nickname) FROM stdin;\nfixture-a\t${"가".repeat(30_000)}\nfixture-b\tsecond\n\\.\n`;
const transient = "COPY auth.sessions (id, user_id) FROM stdin;\ntransient-only\tfixture-a\n\\.\n";
const dump = (nonce: string, rows = durable) => `\\restrict ${nonce}\n${rows}${transient}\\unrestrict ${nonce}\n`;
const runtime = {
  configPath: "/synthetic/restore.env",
  composeFile: "/synthetic/compose.yml",
  config: { FULL_LOCAL_COMPOSE_PROJECT_NAME: "synthetic-streaming-restore" },
  rootDir: "/synthetic",
  env: {},
};

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "restored-platform-data-fixture-"));
  capture.dump = dump("Beta456");
  capture.fail = false;
  capture.calls = 0;
  capture.temporaryRoot = tmpdir();
  capture.stagingPaths = [];
  capture.expectedArgs = [
    "compose", "--env-file", runtime.configPath,
    "--project-name", runtime.config.FULL_LOCAL_COMPOSE_PROJECT_NAME,
    "-f", runtime.composeFile, "exec", "-T", "postgres", "pg_dump", "--data-only",
    "--username", "supabase_admin", "--dbname", "postgres",
  ];
});
afterEach(() => {
  try {
    expect(capture.calls).toBe(1);
    expect(capture.stagingPaths).toHaveLength(1);
    expect(existsSync(capture.stagingPaths[0])).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.each([
  { name: "legacy ordered", format: undefined },
  { name: "COPY row multiset", format: PLATFORM_DATA_SEMANTIC_FORMAT },
])("restored platform streaming evidence: $name", ({ format }) => {
  function metadata(rows = durable) {
    const source = join(directory, "source.sql");
    const sanitized = join(directory, "source.sanitized.sql");
    writeFileSync(source, dump("Alpha123", rows), { mode: 0o600 });
    const manifest = sanitizePlatformDataFile(source, sanitized, format);
    if (typeof manifest === "string" || !("relation_classification_digest" in manifest)) {
      throw new Error("Sanitizing to a file must return a classified restore manifest");
    }
    expect(readFileSync(sanitized, "utf8")).not.toContain("transient-only");
    return { components: { data_sha256: hashPlatformFile(sanitized) }, manifest };
  }

  it("keeps the restored raw SHA while verifying matching semantic and classification digests", () => {
    const source = metadata();
    const result = restoredPlatformDataSnapshot(runtime, source);
    const restoredSanitized = `\\restrict Beta456\n${durable}\\unrestrict Beta456\n`;
    expect(result).toEqual({
      restored_data_sha256: createHash("sha256").update(restoredSanitized).digest("hex"),
      restored_data_semantic_sha256: source.manifest.data_semantic_sha256,
      restored_relation_classification_digest: source.manifest.relation_classification_digest,
    });
    expect(result.restored_data_sha256).not.toBe(source.components.data_sha256);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects a malformed authenticated source raw SHA", () => {
    const source = metadata();
    source.components.data_sha256 = "not-a-sha";
    expect(() => restoredPlatformDataSnapshot(runtime, source)).toThrow("authenticated archive");
  });

  it("rejects a different authenticated semantic digest", () => {
    const source = metadata();
    source.manifest.data_semantic_sha256 = "0".repeat(64);
    expect(() => restoredPlatformDataSnapshot(runtime, source)).toThrow("authenticated archive");
  });

  it("rejects a different authenticated relation classification digest", () => {
    const source = metadata();
    source.manifest.relation_classification_digest = "0".repeat(64);
    expect(() => restoredPlatformDataSnapshot(runtime, source)).toThrow("authenticated archive");
  });

  it("rejects changed restored row content", () => {
    const source = metadata();
    capture.dump = dump("Beta456", durable.replace("fixture-b\tsecond", "fixture-b\tchanged"));
    expect(() => restoredPlatformDataSnapshot(runtime, source)).toThrow("authenticated archive");
  });

  it.each([false, true])("checks personal confirmation, retraction and write control through streaming restore (altered=%s)", (altered) => {
    const personalRows = "COPY private.cooked_weight_user_attestations (id, event_kind, prior_assertion_id) FROM stdin;\nassertion\tattested\t\\N\nretraction\tretracted\tassertion\n\\.\n"
      + "COPY private.cooked_weight_user_attestation_control (singleton, enabled) FROM stdin;\nt\tf\n\\.\n";
    const source = metadata(durable + personalRows);
    capture.dump = dump("Beta456", durable + (altered
      ? personalRows.replace("retraction\tretracted\tassertion\n", "")
      : personalRows));
    if (altered) {
      expect(() => restoredPlatformDataSnapshot(runtime, source)).toThrow("authenticated archive");
    } else {
      expect(restoredPlatformDataSnapshot(runtime, source).restored_data_semantic_sha256)
        .toBe(source.manifest.data_semantic_sha256);
    }
  });

  it("rejects a failed dump capture before producing restore evidence", () => {
    const source = metadata();
    capture.fail = true;
    expect(() => restoredPlatformDataSnapshot(runtime, source)).toThrow("database capture failed");
  });
});
