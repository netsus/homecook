import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalizeJcs, sha256Jcs } from "../scripts/lib/rfc8785-jcs.mjs";
import {
  buildRepeatabilityReceipt,
  buildRunReceipt,
  parseAndValidateRepeatabilityReceipt,
  parseAndValidateRunReceipt,
  readCanonicalReceiptFile,
  readPrivateCanonicalJsonFile,
  validateRunReceipt,
} from "../scripts/lib/local-mac-production-rehearsal-receipts.mjs";

const temporaryDirectories: string[] = [];
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const RELEASE_SHA = "1".repeat(40);
const RELEASE_TREE = "2".repeat(40);
const NOW = new Date("2026-08-29T10:30:00.000Z");

function buildTestRunReceipt(input: Record<string, unknown>) {
  return buildRunReceipt(input, { now: NOW });
}

function tempDirectory(prefix: string) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  const canonicalPath = realpathSync(path);
  temporaryDirectories.push(canonicalPath);
  chmodSync(path, 0o700);
  return canonicalPath;
}

function toolIdentity(name: string) {
  return {
    version: `${name}-1.0.0`,
    realpath: `/opt/homecook/tools/${name}`,
    device: 1,
    inode: name.length + 10,
    mode: 0o755,
    ctime: "2026-08-29T08:00:00.000Z",
    size: 4096,
    sha256: SHA_A,
  };
}

function runtimeIdentity(component: string) {
  return {
    pid: component.length + 100,
    container_id: `${component}-container`,
    reported_release_sha: RELEASE_SHA,
    reported_release_tree: RELEASE_TREE,
    reported_build_id: "build-001",
    reported_sealed_bundle_digest: SHA_B,
  };
}

function runInput(index: 1 | 2, overrides: Record<string, unknown> = {}) {
  const issuedHour = String(index + 7).padStart(2, "0");
  const completedHour = String(index + 8).padStart(2, "0");
  return {
    schema: "homecook.local-mac-production-rehearsal-run-receipt.v1",
    canonicalization: "RFC8785-JCS+SHA256",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    release_sha: RELEASE_SHA,
    release_tree: RELEASE_TREE,
    ci_head_sha: RELEASE_SHA,
    ci_check_summary_digest: SHA_A,
    build_id: "build-001",
    sealed_bundle_digest: SHA_B,
    bundle_manifest_digest: SHA_C,
    run_id: `run-00000000-0000-4000-8000-00000000000${index}`,
    issued_at: `2026-08-29T${issuedHour}:00:00.000Z`,
    completed_at: `2026-08-29T${completedHour}:00:00.000Z`,
    toolchain: {
      node: toolIdentity("node"),
      pnpm: toolIdentity("pnpm"),
      supabase_cli: toolIdentity("supabase"),
      git: toolIdentity("git"),
      docker_client: toolIdentity("docker-client"),
      docker_daemon: toolIdentity("docker-daemon"),
      candidate_builder: toolIdentity("candidate-builder"),
      rehearsal_runner: toolIdentity("rehearsal-runner"),
    },
    images: [{
      digest: `sha256:${SHA_A}`,
      platform: "linux/arm64",
      local_cache_provenance_digest: SHA_C,
    }],
    migration: {
      ordered_migration_files_digest: SHA_A,
      applied_global_ledger_digest: SHA_B,
      migration_head: "20260829000100_release",
      catalog_head: "20260829000100_release",
      schema_identity_digest: SHA_C,
    },
    fixtures: {
      fixture_set_id: "synthetic-release-v1",
      fixture_set_digest: SHA_A,
      production_derived_row_count: 0,
    },
    isolation: {
      resource_identity_digest: index === 1 ? SHA_A : SHA_C,
      root_identity_digest: index === 1 ? SHA_C : SHA_A,
      docker_project_id: `homecook-rehearsal-${index}`,
      network_ids: [`network-${index}`],
      container_ids: [`container-${index}`],
      volume_ids: [`volume-${index}`],
      db_identity: `database-${index}`,
      ports: [46000 + index],
      collision_preflight_digest: SHA_B,
    },
    runtime: {
      app: runtimeIdentity("app"),
      full_local: runtimeIdentity("full-local"),
      worker: runtimeIdentity("worker"),
      foreground_supervisor: runtimeIdentity("supervisor"),
    },
    canaries: [{
      canary_id: "identity",
      started_at: `2026-08-29T${issuedHour}:10:00.000Z`,
      completed_at: `2026-08-29T${issuedHour}:11:00.000Z`,
      exit_code: 0,
      normalized_result_digest: SHA_A,
    }],
    network: {
      default_deny_policy_digest: SHA_A,
      allowed_endpoints: ["loopback:app", "unix:docker"],
      denied_attempt_count: 1,
      unexpected_successful_egress_count: 0,
    },
    cleanup: {
      completed: true,
      owned_resource_ids: [`container-${index}`, `network-${index}`, `volume-${index}`],
      removed_resource_ids: [`container-${index}`, `network-${index}`, `volume-${index}`],
      residue_resource_ids: [],
      cleanup_errors: [],
    },
    production_guard: {
      surface_allowlist_version: "production-surface-v1",
      production_snapshot_pre_digest: SHA_A,
      production_snapshot_post_digest: SHA_A,
      equal: true,
      mutation_attempt_count: 0,
      production_db_connection_count: 0,
      production_db_write_count: 0,
    },
    environment_snapshot: {
      source_allowlist_id: "release-env-v1",
      opaque_source_identity_digest: SHA_A,
      override_policy_digest: SHA_B,
      exposed_value_count: 0,
    },
    threat_controls: {
      symlink_toctou: "pass",
      namespace_collision: "pass",
      digest_substitution: "pass",
      stale_receipt: "pass",
      cleanup_ownership: "pass",
    },
    issuer_task_id: "019ff-rehearsal-author",
    ...overrides,
  };
}

function redigestRepeatability(receipt: Record<string, unknown>) {
  const unsigned = { ...receipt };
  delete unsigned.repeatability_receipt_digest;
  return {
    ...unsigned,
    repeatability_receipt_digest: sha256Jcs(unsigned),
  };
}

function redigestRun(receipt: Record<string, unknown>) {
  const unsigned = { ...receipt };
  delete unsigned.receipt_digest;
  return { ...unsigned, receipt_digest: sha256Jcs(unsigned) };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("rehearsal run receipt", () => {
  it("builds and parses an exact canonical self-digested receipt", () => {
    const receipt = buildTestRunReceipt(runInput(1));
    const parsed = parseAndValidateRunReceipt(canonicalizeJcs(receipt), { now: NOW });

    expect(parsed).toEqual(receipt);
    expect(receipt.receipt_digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects missing, unknown, duplicate, noncanonical, and altered digest input", () => {
    const receipt = buildTestRunReceipt(runInput(1));
    const canonical = canonicalizeJcs(receipt);
    const missing = { ...receipt } as Record<string, unknown>;
    delete missing.repository;
    const unknown = { ...receipt, secret: "must-not-appear" };
    const altered = { ...receipt, issuer_task_id: "altered-task" };
    const duplicate = canonical.replace(
      "{",
      `{"schema":"${receipt.schema}",`,
    );

    expect(() => parseAndValidateRunReceipt(canonicalizeJcs(missing))).toThrow(/missing|required|repository/iu);
    expect(() => parseAndValidateRunReceipt(canonicalizeJcs(unknown))).toThrow(/unknown|secret/iu);
    expect(() => parseAndValidateRunReceipt(duplicate)).toThrow(/duplicate/iu);
    expect(() => parseAndValidateRunReceipt(`${canonical}\n`)).toThrow(/canonical/iu);
    expect(() => parseAndValidateRunReceipt(canonicalizeJcs(altered))).toThrow(/digest/iu);
  });

  it("fails closed on unsafe cleanup, production mutation, secret exposure, and identity drift", () => {
    const cases = [
      runInput(1, { cleanup: { ...runInput(1).cleanup, residue_resource_ids: ["leftover"] } }),
      runInput(1, { production_guard: { ...runInput(1).production_guard, mutation_attempt_count: 1 } }),
      runInput(1, { environment_snapshot: { ...runInput(1).environment_snapshot, exposed_value_count: 1 } }),
      runInput(1, { ci_head_sha: "f".repeat(40) }),
      runInput(1, { runtime: { ...runInput(1).runtime, worker: { ...runtimeIdentity("worker"), reported_build_id: "wrong" } } }),
    ];

    for (const input of cases) {
      expect(() => buildTestRunReceipt(input)).toThrow(/cleanup|residue|mutation|exposed|identity|release|build/iu);
    }
  });

  it("preserves wide tool device and inode identities as exact decimal strings", () => {
    const base = runInput(1);
    const input = {
      ...base,
      toolchain: {
        ...base.toolchain,
        node: {
          ...base.toolchain.node,
          device: "16777229",
          inode: "1152921500311885470",
        },
      },
    };

    expect(buildTestRunReceipt(input).toolchain.node.inode).toBe("1152921500311885470");
  });
});

describe("repeatability receipt", () => {
  it("aligns two distinct members by digest and enforces exact 24-hour expiry", () => {
    const members = [buildTestRunReceipt(runInput(2)), buildTestRunReceipt(runInput(1))];
    const receipt = buildRepeatabilityReceipt({
      memberReceipts: members,
      issuerTaskId: "019ff-rehearsal-author",
      now: NOW,
    });
    const parsed = parseAndValidateRepeatabilityReceipt(canonicalizeJcs(receipt), {
      memberReceipts: members,
      now: NOW,
    });

    expect(parsed.member_receipt_digests).toEqual([...parsed.member_receipt_digests].sort());
    expect(parsed.valid_until).toBe("2026-08-30T09:00:00.000Z");
    expect(parsed.status).toBe("repeatable");
  });

  it("rejects expired, extended, misaligned, and self-corrupted repeatability receipts", () => {
    const members = [buildTestRunReceipt(runInput(1)), buildTestRunReceipt(runInput(2))];
    const valid = buildRepeatabilityReceipt({ memberReceipts: members, issuerTaskId: "task", now: NOW });
    const expiredNow = new Date("2026-08-30T09:00:00.000Z");
    const extended = redigestRepeatability({
      ...valid,
      valid_until: "2026-08-30T09:00:00.001Z",
    });
    const misaligned = redigestRepeatability({
      ...valid,
      member_run_ids: [...valid.member_run_ids].reverse(),
    });

    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(valid), { memberReceipts: members, now: expiredNow })).toThrow(/expired|valid_until/iu);
    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(extended), { memberReceipts: members, now: NOW })).toThrow(/24|valid_until/iu);
    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(misaligned), { memberReceipts: members, now: NOW })).toThrow(/align|member|order/iu);
    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs({ ...valid, status: "altered" }), { memberReceipts: members, now: NOW })).toThrow(/digest|status/iu);
  });

  it("rejects identical run/resource IDs and bundle/tool/image/migration/canary mismatch", () => {
    const first = buildTestRunReceipt(runInput(1));
    const mutations = [
      { run_id: first.run_id },
      { isolation: { ...runInput(2).isolation, resource_identity_digest: first.isolation.resource_identity_digest } },
      {
        sealed_bundle_digest: "d".repeat(64),
        runtime: Object.fromEntries(
          Object.entries(runInput(2).runtime).map(([key, value]) => [
            key,
            { ...value, reported_sealed_bundle_digest: "d".repeat(64) },
          ]),
        ),
      },
      { toolchain: { ...runInput(2).toolchain, node: toolIdentity("node-other") } },
      { images: [{ ...runInput(2).images[0], digest: `sha256:${"d".repeat(64)}` }] },
      { migration: { ...runInput(2).migration, applied_global_ledger_digest: "d".repeat(64) } },
      { canaries: [{ ...runInput(2).canaries[0], normalized_result_digest: "d".repeat(64) }] },
    ];

    for (const override of mutations) {
      const second = buildTestRunReceipt(runInput(2, override));
      expect(() => buildRepeatabilityReceipt({ memberReceipts: [first, second], issuerTaskId: "task", now: NOW }))
        .toThrow(/run|resource|bundle|toolchain|image|migration|canary|distinct|match/iu);
    }
  });
});

describe("receipt schemas and artifact path boundary", () => {
  it("keeps JSON schemas closed and in agreement with runtime validators", () => {
    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const runSchema = JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-run-receipt.schema.json", "utf8"));
    const repeatSchema = JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-repeatability-receipt.schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validateRun = ajv.compile(runSchema);
    const validateRepeat = ajv.compile(repeatSchema);
    const members = [buildTestRunReceipt(runInput(1)), buildTestRunReceipt(runInput(2))];
    const repeat = buildRepeatabilityReceipt({ memberReceipts: members, issuerTaskId: "task", now: NOW });

    expect(validateRun(members[0]), JSON.stringify(validateRun.errors)).toBe(true);
    expect(validateRepeat(repeat), JSON.stringify(validateRepeat.errors)).toBe(true);
    expect(validateRun({ ...members[0], unknown: true })).toBe(false);
    expect(validateRepeat({ ...repeat, member_run_ids: [repeat.member_run_ids[0]] })).toBe(false);
  });

  it("rejects the same receipt attack table in runtime and JSON Schema", () => {
    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const schema = JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-run-receipt.schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addFormat("date-time", (value: string) => {
      const milliseconds = Date.parse(value);
      return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
    });
    const validateSchema = ajv.compile(schema);
    const valid = buildTestRunReceipt(runInput(1));
    const attacks = [
      redigestRun({ ...valid, isolation: { ...valid.isolation, ports: [70_000] } }),
      redigestRun({ ...valid, toolchain: { ...valid.toolchain, node: { ...valid.toolchain.node, mode: "0755" } } }),
      redigestRun({ ...valid, runtime: { ...valid.runtime, app: { ...valid.runtime.app, unexpected: true } } }),
      redigestRun({ ...valid, images: [{ ...valid.images[0], local_cache_provenance_digest: "bad" }] }),
      redigestRun({ ...valid, issued_at: "2026-02-30T08:00:00.000Z" }),
      redigestRun({ ...valid, toolchain: { ...valid.toolchain, node: { ...valid.toolchain.node, mode: Number.MAX_SAFE_INTEGER + 1 } } }),
    ];

    for (const attack of attacks) {
      let runtimeAccepted = true;
      try {
        validateRunReceipt(attack);
      } catch {
        runtimeAccepted = false;
      }
      const schemaAccepted = validateSchema(attack);
      expect({ runtimeAccepted, schemaAccepted }, JSON.stringify(attack)).toEqual({
        runtimeAccepted: false,
        schemaAccepted: false,
      });
    }
  });

  it("accepts only absolute, canonical, private, current-owner, outside-repository regular files", () => {
    const artifactRoot = tempDirectory("homecook-receipt-");
    const repoRoot = tempDirectory("homecook-repo-");
    const receipt = buildTestRunReceipt(runInput(1));
    const receiptPath = join(artifactRoot, "receipt.json");
    writeFileSync(receiptPath, canonicalizeJcs(receipt), { mode: 0o600 });

    expect(readCanonicalReceiptFile(receiptPath, { repoRoot, expectedUid: process.getuid!(), now: NOW }).receipt_digest)
      .toBe(receipt.receipt_digest);
    expect(() => readCanonicalReceiptFile("relative.json", { repoRoot, expectedUid: process.getuid!() })).toThrow(/absolute/iu);
    expect(() => readCanonicalReceiptFile(receiptPath, { repoRoot, expectedUid: process.getuid!() + 1 })).toThrow(/owner/iu);

    chmodSync(receiptPath, 0o644);
    expect(() => readCanonicalReceiptFile(receiptPath, { repoRoot, expectedUid: process.getuid!() })).toThrow(/0600|mode|private/iu);
    chmodSync(receiptPath, 0o600);

    const symlinkPath = join(artifactRoot, "receipt-link.json");
    symlinkSync(receiptPath, symlinkPath);
    expect(() => readCanonicalReceiptFile(symlinkPath, { repoRoot, expectedUid: process.getuid!() })).toThrow(/symlink|regular|canonical/iu);

    const nested = join(repoRoot, "evidence");
    mkdirSync(nested, { mode: 0o700 });
    const insideRepo = join(nested, "receipt.json");
    writeFileSync(insideRepo, canonicalizeJcs(receipt), { mode: 0o600 });
    expect(() => readCanonicalReceiptFile(insideRepo, { repoRoot, expectedUid: process.getuid!() })).toThrow(/repository|outside|escape/iu);
  });

  it("does not include raw secret material in path or parse errors", () => {
    const artifactRoot = tempDirectory("homecook-receipt-secret-");
    const repoRoot = tempDirectory("homecook-repo-secret-");
    const receiptPath = join(artifactRoot, "receipt.json");
    const marker = "TOP_SECRET_PROVIDER_PAYLOAD";
    writeFileSync(receiptPath, `{\"schema\":\"${marker}\"}`, { mode: 0o600 });

    let message = "";
    try {
      readCanonicalReceiptFile(receiptPath, { repoRoot, expectedUid: process.getuid!() });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(marker);
  });

  it("rejects invalid UTF-8 bytes before JSON decoding or canonical hashing", () => {
    const artifactRoot = tempDirectory("homecook-receipt-invalid-utf8-");
    const repoRoot = tempDirectory("homecook-repo-invalid-utf8-");
    const receiptPath = join(artifactRoot, "receipt.json");
    writeFileSync(receiptPath, Buffer.from([0x22, 0xff, 0x22]), { mode: 0o600 });

    expect(() => readPrivateCanonicalJsonFile(receiptPath, {
      repoRoot,
      expectedUid: process.getuid!(),
    })).toThrow(/UTF-8|canonical|invalid/iu);
  });
});

describe("strict receipt time authority", () => {
  it("rejects calendar-invalid RFC3339 instants instead of Date.parse normalization", () => {
    expect(() => buildRunReceipt(runInput(1, {
      issued_at: "2026-02-30T08:00:00.000Z",
    }), { now: NOW })).toThrow(/RFC3339|instant|calendar|issued_at/iu);
  });

  it("expires authority when now equals valid_until", () => {
    const members = [buildTestRunReceipt(runInput(1)), buildTestRunReceipt(runInput(2))];
    const repeatability = buildRepeatabilityReceipt({
      memberReceipts: members,
      issuerTaskId: "task",
      now: new Date("2026-08-29T10:30:00.000Z"),
    });

    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(repeatability), {
      memberReceipts: members,
      now: new Date(repeatability.valid_until),
    })).toThrow(/expired|valid_until/iu);
  });

  it("rejects stale members and binds authority to the earlier member expiry", () => {
    const stale = buildRunReceipt(runInput(1, {
      issued_at: "2020-01-01T08:00:00.000Z",
      completed_at: "2020-01-01T09:00:00.000Z",
    }), { now: NOW });
    const current = buildTestRunReceipt(runInput(2));

    expect(() => buildRepeatabilityReceipt({
      memberReceipts: [stale, current],
      issuerTaskId: "task",
      now: NOW,
    })).toThrow(/member|stale|fresh|24|interval|expired/iu);

    const valid = buildRepeatabilityReceipt({
      memberReceipts: [buildTestRunReceipt(runInput(1)), current],
      issuerTaskId: "task",
      now: NOW,
    });
    expect(valid.valid_until).toBe("2026-08-30T09:00:00.000Z");
  });

  it("rejects future run and repeatability authority at build and validation time", () => {
    const futureNow = new Date("2030-01-01T12:00:00.000Z");
    const futureRuns = [1, 2].map((index) => {
      const issuedHour = String(index + 7).padStart(2, "0");
      const completedHour = String(index + 8).padStart(2, "0");
      return buildRunReceipt(runInput(index as 1 | 2, {
      issued_at: `2030-01-01T${issuedHour}:00:00.000Z`,
      completed_at: `2030-01-01T${completedHour}:00:00.000Z`,
      canaries: [{
        ...runInput(index as 1 | 2).canaries[0],
        started_at: `2030-01-01T${issuedHour}:10:00.000Z`,
        completed_at: `2030-01-01T${issuedHour}:11:00.000Z`,
      }],
      }), { now: futureNow });
    });

    expect(() => buildRunReceipt(runInput(1, {
      issued_at: "2099-01-01T08:00:00.000Z",
      completed_at: "2099-01-01T09:00:00.000Z",
    }), { now: NOW })).toThrow(/future|completed_at|now/iu);
    expect(() => buildRepeatabilityReceipt({ memberReceipts: futureRuns, issuerTaskId: "task", now: NOW }))
      .toThrow(/future|member|completed_at|now/iu);

    const futureRepeatability = buildRepeatabilityReceipt({
      memberReceipts: futureRuns,
      issuerTaskId: "task",
      now: futureNow,
    });
    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(futureRepeatability), {
      memberReceipts: futureRuns,
      now: NOW,
    })).toThrow(/future|member|completed_at|now/iu);
  });
});
