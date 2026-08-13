import type { SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  RCLONE_IMAGE,
  buildRcloneConfig,
  buildStorageCopyRuntime,
  compareStorageObjectCatalogs,
  main,
  normalizeHostedSupabaseS3Endpoint,
  normalizeLoopbackSupabaseS3Endpoint,
  parseStorageCopyCliArgs,
  readMacOsKeychainSecret,
  redactSecrets,
  runStorageCopyOperation,
  writeVerificationManifest,
  writeEphemeralRcloneConfig,
} from "@/scripts/local-supabase-storage-copy.mjs";

describe("historical hosted Storage copy tombstone", () => {
  it("fails before reading any remote credential or starting a copy", () => {
    const runCommand = vi.fn();

    expect(() => main(["plan"], {
      env: baseEnv(),
      repositoryRoot: process.cwd(),
      runCommand,
    })).toThrow(/FORBIDDEN|local-only/iu);
    expect(runCommand).not.toHaveBeenCalled();
  });
});

function baseEnv() {
  return {
    HOMECOOK_HOSTED_SUPABASE_S3_ACCESS_KEY_ID: "hosted-access",
    HOMECOOK_HOSTED_SUPABASE_S3_ENDPOINT: "https://project-ref.supabase.co/storage/v1/s3",
    HOMECOOK_HOSTED_SUPABASE_S3_REGION: "ap-northeast-2",
    HOMECOOK_HOSTED_SUPABASE_S3_SECRET_ACCESS_KEY: "hosted-secret+value=",
    HOMECOOK_LOCAL_SUPABASE_S3_ENDPOINT:
      "http://127.0.0.1:54321/storage/v1/s3",
    FULL_LOCAL_INTERNAL_GATEWAY_PORT: "54321",
    REGION: "homecook-local-1",
    S3_PROTOCOL_ACCESS_KEY_ID: "local-access",
    S3_PROTOCOL_ACCESS_KEY_SECRET: "local-secret+value=",
  } as unknown as NodeJS.ProcessEnv;
}

function dockerResult({
  status,
  stderr = "",
  stdout = "",
}: {
  status: number;
  stderr?: string;
  stdout?: string;
}): SpawnSyncReturns<string> {
  return {
    error: undefined,
    output: [null, stdout, stderr],
    pid: 1,
    signal: null,
    status,
    stderr,
    stdout,
  };
}

function objectMeta(overrides: Partial<{
  bytes: number;
  md5: string | null;
  mime_type: string;
  path: string;
  sha256: string | null;
}> = {}) {
  return {
    bytes: 128,
    md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    mime_type: "image/png",
    path: "bucket-a/file.png",
    sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ...overrides,
  };
}

describe("local Supabase storage copy endpoint guards", () => {
  it("accepts only the exact hosted HTTPS S3 endpoint", () => {
    expect(normalizeHostedSupabaseS3Endpoint(
      "https://project-ref.supabase.co/storage/v1/s3",
    )).toBe("https://project-ref.supabase.co/storage/v1/s3");

    expect(() => normalizeHostedSupabaseS3Endpoint(
      "http://project-ref.supabase.co/storage/v1/s3",
    )).toThrow("must use HTTPS");
    expect(() => normalizeHostedSupabaseS3Endpoint(
      "https://project-ref.supabase.co/storage/v1/s3/",
    )).toThrow("exact /storage/v1/s3 path");
    expect(normalizeHostedSupabaseS3Endpoint(
      "https://project-ref.storage.supabase.co/storage/v1/s3",
    )).toBe("https://project-ref.storage.supabase.co/storage/v1/s3");
    expect(() => normalizeHostedSupabaseS3Endpoint(
      "https://storage.supabase.co/storage/v1/s3",
    )).toThrow("exact project Supabase hostname");
  });

  it("accepts only the exact loopback destination endpoint", () => {
    expect(normalizeLoopbackSupabaseS3Endpoint(
      "http://127.0.0.1:54321/storage/v1/s3",
    )).toBe("http://127.0.0.1:54321/storage/v1/s3");

    expect(() => normalizeLoopbackSupabaseS3Endpoint(
      "http://localhost:54321/storage/v1/s3",
    )).toThrow("127.0.0.1");
    expect(() => normalizeLoopbackSupabaseS3Endpoint(
      "https://127.0.0.1:54321/storage/v1/s3",
    )).toThrow("must use HTTP");
    expect(() => normalizeLoopbackSupabaseS3Endpoint(
      "http://127.0.0.1:54321/storage/v1/s3/",
    )).toThrow("exact /storage/v1/s3 path");
  });

  it("requires the destination endpoint to match the configured gateway port", () => {
    expect(() => buildStorageCopyRuntime({
      env: {
        ...baseEnv(),
        FULL_LOCAL_INTERNAL_GATEWAY_PORT: "54481",
      },
    })).toThrow("must match FULL_LOCAL_INTERNAL_GATEWAY_PORT");
  });

  it("pins the rclone container to the exact digest", () => {
    expect(RCLONE_IMAGE).toBe(
      "docker.io/rclone/rclone:1.69.3@sha256:1f497a86a6466395e62a5886613a14b7b18809543566ef9fa35fa1371a7ecc0f",
    );
  });
});

describe("local Supabase storage copy input safety", () => {
  it("reads existing chunked full-local Keychain secrets without duplicating them", () => {
    const values = new Map([
      ["storage_s3_access_key_id__count", "2"],
      ["storage_s3_access_key_id__000", "local-"],
      ["storage_s3_access_key_id__001", "access"],
    ]);
    const read = vi.fn((_command: string, args: string[]) => {
      const account = args[args.indexOf("-a") + 1];
      if (!values.has(account)) throw new Error("not found");
      return values.get(account);
    });
    expect(readMacOsKeychainSecret({
      account: "storage_s3_access_key_id",
      execFileSyncImpl: read as never,
      service: "homecook-full-local-production-v1",
    })).toBe("local-access");
  });

  it("rejects CLI credential arguments and direct file copy arguments", () => {
    expect(() => parseStorageCopyCliArgs([
      "copy",
      "--source-access-key-id",
      "secret",
    ])).toThrow("CLI credentials are forbidden");

    expect(() => parseStorageCopyCliArgs([
      "copy",
      "/tmp/source",
      "/tmp/destination",
    ])).toThrow("Direct source/destination arguments are not allowed");
  });

  it("requires verify manifests and keeps them off other commands", () => {
    expect(() => parseStorageCopyCliArgs([
      "verify",
    ])).toThrow("verify requires --manifest");

    expect(() => parseStorageCopyCliArgs([
      "copy",
      "--manifest",
      "/tmp/result.json",
    ])).toThrow("--manifest is only allowed with the verify command");
  });

  it("builds a provider=Other rclone config without exposing secrets in the plan", () => {
    const runtime = buildStorageCopyRuntime({ env: baseEnv() });
    const config = buildRcloneConfig(runtime);

    expect(config).toContain("[source]");
    expect(config).toContain("[destination]");
    expect(config).toContain("provider = Other");
    expect(config).toContain("endpoint = https://project-ref.supabase.co/storage/v1/s3");
    expect(config).toContain("endpoint = http://127.0.0.1:54321/storage/v1/s3");
    expect(config).toContain("list_version = 2");
  });

  it("redacts raw, base64, and URL-encoded secrets", () => {
    const secret = "hosted-secret+value=";
    const encoded = encodeURIComponent(secret);
    const base64 = Buffer.from(secret, "utf8").toString("base64");
    const redacted = redactSecrets(
      `raw=${secret}\nbase64=${base64}\nencoded=${encoded}`,
      [secret],
    );

    expect(redacted).not.toContain(secret);
    expect(redacted).not.toContain(base64);
    expect(redacted).not.toContain(encoded);
    expect(redacted).toContain("[redacted]");
  });
});

describe("local Supabase storage copy config cleanup", () => {
  it("writes the ephemeral rclone.conf outside the repo with mode 0600", () => {
    const directory = mkdtempSync(join(tmpdir(), "homecook-rclone-config-"));
    const { cleanup, configPath } = writeEphemeralRcloneConfig({
      configDirectory: directory,
      configText: "test = value\n",
      repositoryRoot: "/Users/cwj/01_vibe_coding/homecook-full-local-restore",
    });

    const mode = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
    expect(mode).toBe("test = value\n");
    expect(existsSync(configPath)).toBe(true);

    cleanup();
    expect(existsSync(configPath)).toBe(false);
  });

  it("guarantees config deletion on success and failure", () => {
    const directory = mkdtempSync(join(tmpdir(), "homecook-rclone-run-"));
    const successRun = vi.fn((command: string, args: string[]): SpawnSyncReturns<string> => {
      expect(command).toBe("docker");
      if (args.includes("lsf")) {
        return dockerResult({ status: 0, stdout: "bucket-a/\n" });
      }
      return dockerResult({ status: 0 });
    });

    const successCli = parseStorageCopyCliArgs(["copy", "--bucket", "bucket-a"]);
    runStorageCopyOperation({
      cli: successCli,
      configDirectory: directory,
      env: baseEnv(),
      repositoryRoot: "/Users/cwj/01_vibe_coding/homecook-full-local-restore",
      runCommand: successRun,
    });
    expect(existsSync(join(directory, "rclone.conf"))).toBe(false);
    expect(successRun).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["run", "--rm", "--network", "host"]),
    );

    const failureDirectory = mkdtempSync(join(tmpdir(), "homecook-rclone-fail-"));
    const failureRun = vi.fn((command: string, args: string[]): SpawnSyncReturns<string> => {
      expect(command).toBe("docker");
      if (args.includes("copy")) {
        return dockerResult({
          status: 1,
          stderr: "copy failed for hosted-secret+value=",
        });
      }
      return dockerResult({ status: 0 });
    });

    expect(() => runStorageCopyOperation({
      cli: successCli,
      configDirectory: failureDirectory,
      env: baseEnv(),
      repositoryRoot: "/Users/cwj/01_vibe_coding/homecook-full-local-restore",
      runCommand: failureRun,
    })).toThrow("rclone command failed");
    expect(existsSync(join(failureDirectory, "rclone.conf"))).toBe(false);
  });
});

describe("local Supabase storage compare helper", () => {
  it("reports success when source and destination metadata match exactly", () => {
    const comparison = compareStorageObjectCatalogs({
      destinationObjects: [objectMeta()],
      sourceObjects: [objectMeta()],
    });

    expect(comparison.matches).toBe(true);
    expect(comparison.source_count).toBe(1);
    expect(comparison.destination_count).toBe(1);
    expect(comparison.path_mismatches).toHaveLength(0);
    expect(comparison.missing_objects).toHaveLength(0);
    expect(comparison.extra_objects).toHaveLength(0);
    expect(comparison.metadata_mismatches).toHaveLength(0);
  });

  it("reports missing objects", () => {
    const comparison = compareStorageObjectCatalogs({
      destinationObjects: [],
      sourceObjects: [objectMeta()],
    });

    expect(comparison.matches).toBe(false);
    expect(comparison.missing_objects).toEqual([objectMeta()]);
  });

  it("reports extra objects", () => {
    const comparison = compareStorageObjectCatalogs({
      destinationObjects: [objectMeta()],
      sourceObjects: [],
    });

    expect(comparison.matches).toBe(false);
    expect(comparison.extra_objects).toEqual([objectMeta()]);
  });

  it("reports path mismatches when object ordering no longer aligns by path", () => {
    const comparison = compareStorageObjectCatalogs({
      destinationObjects: [objectMeta({ path: "bucket-a/other.png" })],
      sourceObjects: [objectMeta()],
    });

    expect(comparison.matches).toBe(false);
    expect(comparison.path_mismatches).toEqual([
      {
        destination_path: "bucket-a/other.png",
        source_path: "bucket-a/file.png",
      },
    ]);
  });

  it("reports size mismatches", () => {
    const comparison = compareStorageObjectCatalogs({
      destinationObjects: [objectMeta({ bytes: 256 })],
      sourceObjects: [objectMeta()],
    });

    expect(comparison.matches).toBe(false);
    expect(comparison.metadata_mismatches[0]?.fields).toEqual(["bytes"]);
  });

  it("reports MIME mismatches", () => {
    const comparison = compareStorageObjectCatalogs({
      destinationObjects: [objectMeta({ mime_type: "image/jpeg" })],
      sourceObjects: [objectMeta()],
    });

    expect(comparison.matches).toBe(false);
    expect(comparison.metadata_mismatches[0]?.fields).toEqual(["mime_type"]);
  });

  it("reports hash mismatches", () => {
    const comparison = compareStorageObjectCatalogs({
      destinationObjects: [objectMeta({
        md5: "cccccccccccccccccccccccccccccccc",
        sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      })],
      sourceObjects: [objectMeta()],
    });

    expect(comparison.matches).toBe(false);
    expect(comparison.metadata_mismatches[0]?.fields).toEqual(["md5", "sha256"]);
  });
});

describe("local Supabase storage verify manifest guard", () => {
  it("writes verification manifests outside the repo with mode 0600", () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), "homecook-verify-manifest-"));
    const manifestPath = join(manifestDirectory, "storage-verify.json");
    const writtenPath = writeVerificationManifest({
      manifest: {
        comparison: { matches: true },
        created_at: "2026-08-01T00:00:00.000Z",
        format: "homecook-local-supabase-storage-verify-v1",
      },
      manifestPath,
      repositoryRoot: "/Users/cwj/01_vibe_coding/homecook-full-local-restore",
    });

    expect(writtenPath).toBe(manifestPath);
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toMatchObject({
      comparison: { matches: true },
      format: "homecook-local-supabase-storage-verify-v1",
    });
    expect(statSync(manifestPath).mode & 0o777).toBe(0o600);
  });

  it("rejects manifest paths inside the repo", () => {
    expect(() => writeVerificationManifest({
      manifest: { format: "homecook-local-supabase-storage-verify-v1" },
      manifestPath:
        "/Users/cwj/01_vibe_coding/homecook-full-local-restore/tmp/storage-verify.json",
      repositoryRoot: "/Users/cwj/01_vibe_coding/homecook-full-local-restore",
    })).toThrow("absolute external .json path");
  });

  it("rejects overwriting an existing manifest", () => {
    const manifestDirectory = mkdtempSync(join(tmpdir(), "homecook-verify-existing-"));
    const manifestPath = join(manifestDirectory, "storage-verify.json");
    writeFileSync(manifestPath, "{}\n", "utf8");

    expect(() => writeVerificationManifest({
      manifest: { format: "homecook-local-supabase-storage-verify-v1" },
      manifestPath,
      repositoryRoot: "/Users/cwj/01_vibe_coding/homecook-full-local-restore",
    })).toThrow("Verification manifest output already exists");
  });
});

describe("local Supabase storage verify command", () => {
  it("fails closed when source and destination bucket sets differ", () => {
    const configDirectory = mkdtempSync(join(tmpdir(), "homecook-rclone-bucket-mismatch-"));
    const manifestDirectory = mkdtempSync(join(tmpdir(), "homecook-verify-bucket-mismatch-"));
    const runVerify = vi.fn((_command: string, args: string[]): SpawnSyncReturns<string> => {
      const remoteTarget = args[args.indexOf("--config") + 3];
      return dockerResult({
        status: 0,
        stdout: remoteTarget === "source:" ? "bucket-a/\n" : "",
      });
    });

    expect(() => runStorageCopyOperation({
      cli: parseStorageCopyCliArgs([
        "verify",
        "--manifest",
        join(manifestDirectory, "storage-verify.json"),
      ]),
      configDirectory,
      env: baseEnv(),
      repositoryRoot: "/Users/cwj/01_vibe_coding/homecook-full-local-restore",
      runCommand: runVerify,
    })).toThrow("bucket sets do not match");
    expect(existsSync(join(configDirectory, "rclone.conf"))).toBe(false);
  });

  it("writes an object-only manifest and returns success when metadata matches", () => {
    const configDirectory = mkdtempSync(join(tmpdir(), "homecook-rclone-verify-"));
    const manifestDirectory = mkdtempSync(join(tmpdir(), "homecook-verify-output-"));
    const manifestPath = join(manifestDirectory, "storage-verify.json");
    const runVerify = vi.fn((_command: string, args: string[]): SpawnSyncReturns<string> => {
      const subcommand = args[args.indexOf("--config") + 2];
      const remoteTarget = args[args.indexOf("--config") + (subcommand === "hashsum" ? 4 : 3)];

      if (subcommand === "lsf" && remoteTarget === "source:") {
        return dockerResult({ status: 0, stdout: "bucket-a/\n" });
      }
      if (subcommand === "lsf" && remoteTarget === "destination:") {
        return dockerResult({ status: 0, stdout: "bucket-a/\n" });
      }
      if (subcommand === "lsjson") {
        return dockerResult({
          status: 0,
          stdout: JSON.stringify([
            {
              Hashes: { MD5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
              MimeType: "image/png",
              Path: "file.png",
              Size: 128,
            },
          ]),
        });
      }
      if (subcommand === "hashsum") {
        return dockerResult({
          status: 0,
          stdout:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  file.png\n",
        });
      }
      throw new Error(`Unexpected rclone command: ${subcommand}`);
    });

    const result = runStorageCopyOperation({
      cli: parseStorageCopyCliArgs([
        "verify",
        "--manifest",
        manifestPath,
      ]),
      configDirectory,
      env: baseEnv(),
      repositoryRoot: "/Users/cwj/01_vibe_coding/homecook-full-local-restore",
      runCommand: runVerify,
    });

    expect(result.mode).toBe("verify");
    expect(result.manifest_path).toBe(manifestPath);
    expect(result.comparison.matches).toBe(true);
    expect(existsSync(join(configDirectory, "rclone.conf"))).toBe(false);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.source.objects).toEqual([{ ...objectMeta(), bucket: "bucket-a" }]);
    expect(manifest.destination.objects).toEqual([{ ...objectMeta(), bucket: "bucket-a" }]);
    expect(manifest.comparison.matches).toBe(true);
  });
});
