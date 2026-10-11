import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(repositoryRoot, "tools/oxlint/anti-slop-baseline.json");
const sourceCommit = "c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b";
const scope = ["app", "components", "lib", "stores", "types", "ui"];
const rules = [
  "anti-slop(no-array-filter-map)",
  "anti-slop(no-chained-type-assertions)",
  "anti-slop(no-conditional-empty-object-spread)",
  "anti-slop(no-reduce-accumulator-copy)",
  "oxc(no-accumulating-spread)",
];
const updateBaseline = process.argv.includes("--update-baseline");

function fail(message) {
  process.stderr.write(`Anti Slop verification failed: ${message}\n`);
  process.exit(1);
}

function oxlintBinary() {
  return path.join(
    repositoryRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "oxlint.cmd" : "oxlint",
  );
}

function runOxlint() {
  const result = spawnSync(
    oxlintBinary(),
    [
      "-A",
      "all",
      "-D",
      "oxc/no-accumulating-spread",
      "-c",
      ".oxlintrc.json",
      "--format",
      "json",
      ...scope,
    ],
    { cwd: repositoryRoot, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
  );

  if (result.error) fail(`could not start Oxlint (${result.error.message})`);
  if (result.status !== 0 && result.status !== 1) {
    fail(`Oxlint exited ${result.status ?? "without a status"}: ${result.stderr.trim()}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`Oxlint did not return JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

function snippetHash(diagnostic) {
  const label = diagnostic.labels?.[0];
  if (!label?.span || typeof label.span.offset !== "number" || typeof label.span.length !== "number") {
    fail(`diagnostic ${diagnostic.code} in ${diagnostic.filename} has no source span`);
  }
  const source = readFileSync(path.join(repositoryRoot, diagnostic.filename));
  const snippet = source
    .subarray(label.span.offset, label.span.offset + label.span.length)
    .toString("utf8")
    .replaceAll(/\s+/gu, " ")
    .trim();
  if (!snippet) fail(`diagnostic ${diagnostic.code} in ${diagnostic.filename} resolved to an empty source span`);
  return createHash("sha256").update(snippet).digest("hex");
}

function findingKey(diagnostic) {
  return `${diagnostic.filename}\0${diagnostic.code}\0${snippetHash(diagnostic)}`;
}

function summarize(findings) {
  const counts = Object.fromEntries(rules.map((rule) => [rule, 0]));
  for (const finding of findings) counts[finding.code] += 1;
  return counts;
}

const report = runOxlint();
const diagnostics = report.diagnostics ?? [];
for (const diagnostic of diagnostics) {
  if (!rules.includes(diagnostic.code)) fail(`unexpected enabled rule ${diagnostic.code}`);
}

const grouped = new Map();
for (const diagnostic of diagnostics) {
  const key = findingKey(diagnostic);
  const existing = grouped.get(key);
  if (existing) existing.count += 1;
  else {
    grouped.set(key, {
      file: diagnostic.filename,
      rule: diagnostic.code,
      snippetSha256: key.slice(key.lastIndexOf("\0") + 1),
      count: 1,
    });
  }
}
const findings = [...grouped.values()].sort((left, right) =>
  `${left.file}\0${left.rule}\0${left.snippetSha256}`.localeCompare(
    `${right.file}\0${right.rule}\0${right.snippetSha256}`,
  ),
);

if (updateBaseline) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ schema: 1, sourceCommit, scope, rules, findings }, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ ok: true, mode: "baseline-updated", total: diagnostics.length, counts: summarize(diagnostics) }, null, 2)}\n`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
if (
  baseline.schema !== 1 ||
  baseline.sourceCommit !== sourceCommit ||
  JSON.stringify(baseline.scope) !== JSON.stringify(scope) ||
  JSON.stringify(baseline.rules) !== JSON.stringify(rules)
) {
  fail("baseline metadata does not match the active source commit, scope, and rules");
}

const allowed = new Map(
  baseline.findings.map((finding) => [
    `${finding.file}\0${finding.rule}\0${finding.snippetSha256}`,
    finding.count,
  ]),
);
const seen = new Map();
const newFindings = [];
for (const diagnostic of diagnostics) {
  const key = findingKey(diagnostic);
  const count = (seen.get(key) ?? 0) + 1;
  seen.set(key, count);
  if (count > (allowed.get(key) ?? 0)) newFindings.push(diagnostic);
}

if (newFindings.length > 0) {
  for (const diagnostic of newFindings.slice(0, 20)) {
    const span = diagnostic.labels?.[0]?.span;
    process.stderr.write(
      `${diagnostic.filename}:${span?.line ?? "?"}:${span?.column ?? "?"} ${diagnostic.code} ${diagnostic.message}\n`,
    );
  }
  if (newFindings.length > 20) process.stderr.write(`... and ${newFindings.length - 20} more\n`);
  fail(`${newFindings.length} finding(s) exceed the checked-in baseline`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      mode: "baseline-check",
      files: report.number_of_files,
      rules: report.number_of_rules,
      currentTotal: diagnostics.length,
      baselineTotal: baseline.findings.reduce((total, finding) => total + finding.count, 0),
      newFindings: 0,
      counts: summarize(diagnostics),
    },
    null,
    2,
  )}\n`,
);
