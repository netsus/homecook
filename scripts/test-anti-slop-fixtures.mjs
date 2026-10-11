import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary = path.join(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "oxlint.cmd" : "oxlint",
);
const expectedInvalidCounts = {
  "anti-slop(no-array-filter-map)": 1,
  "anti-slop(no-chained-type-assertions)": 1,
  "anti-slop(no-conditional-empty-object-spread)": 1,
  "anti-slop(no-reduce-accumulator-copy)": 1,
  "oxc(no-accumulating-spread)": 1,
};

function runFixture(name) {
  const result = spawnSync(
    binary,
    [
      "-A",
      "all",
      "-D",
      "oxc/no-accumulating-spread",
      "-c",
      ".oxlintrc.json",
      "--no-ignore",
      "--format",
      "json",
      `tests/fixtures/anti-slop/${name}.ts`,
    ],
    { cwd: repositoryRoot, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
  );
  if (result.error) throw result.error;
  return { status: result.status, report: JSON.parse(result.stdout) };
}

const valid = runFixture("valid");
if (valid.status !== 0 || valid.report.diagnostics.length !== 0) {
  throw new Error(`valid fixture produced diagnostics: ${JSON.stringify(valid.report.diagnostics)}`);
}

const invalid = runFixture("invalid");
const actualInvalidCounts = {};
for (const diagnostic of invalid.report.diagnostics) {
  actualInvalidCounts[diagnostic.code] = (actualInvalidCounts[diagnostic.code] ?? 0) + 1;
}
const sortedCounts = (counts) => Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
if (
  invalid.status !== 1 ||
  JSON.stringify(sortedCounts(actualInvalidCounts)) !== JSON.stringify(sortedCounts(expectedInvalidCounts))
) {
  throw new Error(
    `invalid fixture did not exercise the exact rule set: ${JSON.stringify({ status: invalid.status, actualInvalidCounts })}`,
  );
}

const probePath = path.join(repositoryRoot, "lib", `anti-slop-fixture-probe-${randomUUID()}.generated.ts`);
let baselineProbe;
let probeCreated = false;
try {
  writeFileSync(
    probePath,
    `// UTF-8 바이트 위치 회귀 검사: ${"한글".repeat(200)}\ndeclare const value: unknown;\nexport const probe = value as unknown as { id: string };\n`,
    { encoding: "utf8", flag: "wx" },
  );
  probeCreated = true;
  baselineProbe = spawnSync(process.execPath, ["scripts/run-anti-slop.mjs"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
} finally {
  if (probeCreated) unlinkSync(probePath);
}
if (
  baselineProbe.status !== 1 ||
  !baselineProbe.stderr.includes("1 finding(s) exceed the checked-in baseline")
) {
  throw new Error(
    `baseline gate did not reject the new finding: ${JSON.stringify({ status: baselineProbe.status, stderr: baselineProbe.stderr })}`,
  );
}

process.stdout.write(
  `${JSON.stringify({ ok: true, validDiagnostics: 0, blockedDiagnostics: actualInvalidCounts, baselineRejectedNewFinding: true }, null, 2)}\n`,
);
