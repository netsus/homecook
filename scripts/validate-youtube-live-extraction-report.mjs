#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const REPORT_MODES = new Set(["fixture_replay", "live_smoke", "ui_capture"]);
const EVIDENCE_ORIGINS = new Set(["test_fixture", "live_provider", "browser_ui"]);
const FORBIDDEN_PROVIDER_PATTERN = /fixture|mock|parity|test/iu;
const FORBIDDEN_SOURCE_PATH_PATTERN = /(^|[/\\])tests([/\\]|$)|(^|[/\\])\.omx([/\\])artifacts([/\\]|$)|fixture|parity|recipio-reference|expected|\.test\./iu;
const FORBIDDEN_RESULT_REFERENCE_KEYS = [
  "expected_ingredients",
  "expected_steps",
  "historical_local_score",
  "public_score",
  "recipio_link",
  "recipio_score",
  "recipio_url",
  "reference_ingredients",
  "reference_score",
  "reference_steps",
];
const SOURCE_IMPORT_PATTERN =
  /(?:import\s+(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/gu;

function addError(errors, pathName, message) {
  errors.push({ path: pathName, message });
}

function getManifest(report) {
  return report.report_validation ?? report.manifest ?? report.validation ?? report;
}

function getManifestValue(report, key) {
  const manifest = getManifest(report);
  return manifest?.[key] ?? report?.[key] ?? null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value) {
  return asArray(value).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

function normalizePathForReport(value) {
  return String(value ?? "").replace(/\\/gu, "/");
}

function isForbiddenSourcePath(value) {
  return FORBIDDEN_SOURCE_PATH_PATTERN.test(normalizePathForReport(value));
}

function isForbiddenProviderName(value) {
  return FORBIDDEN_PROVIDER_PATTERN.test(String(value ?? ""));
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function collectProviderNamesFromMeta(meta, output = []) {
  if (!meta || typeof meta !== "object") {
    return output;
  }

  for (const [key, value] of Object.entries(meta)) {
    if (key === "source_providers" || key === "provider_names") {
      output.push(...readStringArray(value));
      continue;
    }

    if (/(^|_)provider(_|$)/iu.test(key) && typeof value === "string" && value.trim()) {
      output.push(value.trim());
      continue;
    }

    if (value && typeof value === "object") {
      collectProviderNamesFromMeta(value, output);
    }
  }

  return output;
}

function getResultSessionExport(result) {
  return result.persisted_session_export ?? result.session_export ?? result.db?.sessionExport ?? null;
}

function collectResultProviderNames(result) {
  const sessionExport = getResultSessionExport(result);
  return uniqueStrings([
    ...readStringArray(result.provider_names),
    ...readStringArray(result.source_providers),
    ...readStringArray(result.db?.sessionSourceProviders),
    ...readStringArray(sessionExport?.source_providers),
    ...readStringArray(sessionExport?.provider_names),
    ...collectProviderNamesFromMeta(sessionExport?.extraction_meta_json),
    ...collectProviderNamesFromMeta(sessionExport?.extraction_meta_summary),
  ]);
}

function collectResultSessionIds(result) {
  const sessionExport = getResultSessionExport(result);
  return uniqueStrings([
    ...readStringArray(result.session_ids),
    result.extractionId,
    result.extraction_id,
    sessionExport?.id,
  ].filter(Boolean));
}

function collectBlockingIssues(result) {
  return uniqueStrings([
    ...readStringArray(result.blocking_issues),
    ...readStringArray(result.errors),
  ]);
}

function getPersistedSessionId(result) {
  const sessionExport = getResultSessionExport(result);
  if (sessionExport?.id) {
    return sessionExport.id;
  }

  if (result.db?.sessionFound === true && (result.extractionId || result.extraction_id)) {
    return result.extractionId ?? result.extraction_id;
  }

  return null;
}

function rowHasPersistedLiveEvidence(result) {
  const sessionIds = collectResultSessionIds(result);
  const persistedSessionId = getPersistedSessionId(result);

  if (!persistedSessionId || sessionIds.length === 0) {
    return false;
  }

  return sessionIds.includes(persistedSessionId);
}

function deriveRowUiVerified(result) {
  const evidence = result.ui_evidence ?? result.uiEvidence ?? null;
  if (!evidence || typeof evidence !== "object") {
    return false;
  }

  const visible = evidence.visible_counts ?? evidence.visibleCounts ?? null;
  const extraction = evidence.extraction_counts ?? evidence.extractionCounts ?? null;
  if (!visible || !extraction) {
    return false;
  }

  const sessionId = evidence.session_id ?? evidence.sessionId ?? null;
  const sessionMatches = sessionId ? collectResultSessionIds(result).includes(sessionId) : true;
  const ingredientsMatch = Number(visible.ingredients) === Number(extraction.ingredients);
  const stepsMatch = Number(visible.steps) === Number(extraction.steps);
  const candidatesMatch =
    visible.candidates === undefined ||
    extraction.candidates === undefined ||
    Number(visible.candidates) === Number(extraction.candidates);

  return sessionMatches && ingredientsMatch && stepsMatch && candidatesMatch;
}

function buildDerivedRows(results) {
  return results.map((result) => {
    const providerNames = collectResultProviderNames(result);
    const sessionIds = collectResultSessionIds(result);
    const blockingIssues = collectBlockingIssues(result);
    const persistedSessionId = getPersistedSessionId(result);
    const hasPersistedLiveEvidence = rowHasPersistedLiveEvidence(result);
    const providerNamesClean = providerNames.every((name) => !isForbiddenProviderName(name));
    const verifiedLive = hasPersistedLiveEvidence && providerNamesClean && blockingIssues.length === 0;

    return {
      id: result.id ?? result.videoId ?? result.video_id ?? null,
      blocking_issues: blockingIssues,
      persisted_session_id: persistedSessionId,
      provider_names: providerNames,
      session_ids: sessionIds,
      ui_verified: deriveRowUiVerified(result),
      verified_live: verifiedLive,
    };
  });
}

function deriveReportUiVerified(rows) {
  return rows.length > 0 && rows.every((row) => row.ui_verified || row.blocking_issues.length > 0);
}

function deriveReportVerifiedLive(rows) {
  return rows.length > 0 && rows.every((row) => row.verified_live || row.blocking_issues.length > 0);
}

function getReportEnvironment(report) {
  const manifest = getManifest(report);
  return manifest.environment ?? report.environment ?? {};
}

function hasTruthyManualClaim(report, key) {
  return getManifestValue(report, key) === true || report?.[key] === true;
}

export function validateScoreLayerSeparation(scores) {
  const errors = [];
  const userFacingFields = ["real_smoke_score", "ui_visible_score"];
  const forbiddenFields = ["fixture_replay_score", "reference_score"];

  for (const field of forbiddenFields) {
    if (scores?.user_facing_score_sources?.includes(field)) {
      addError(errors, `scores.user_facing_score_sources`, `${field} cannot feed a user-facing quality score.`);
    }
  }

  const selected = userFacingFields
    .map((field) => scores?.[field])
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  return {
    ok: errors.length === 0,
    errors,
    user_facing_total: selected.length > 0
      ? Number((selected.reduce((sum, value) => sum + value, 0) / selected.length).toFixed(2))
      : null,
  };
}

export function validateLiveExtractorCorpus(corpus) {
  const errors = [];
  const values = Array.isArray(corpus) ? corpus : null;

  if (!values) {
    addError(errors, "corpus", "Live extractor corpus must be a JSON array of YouTube URL strings.");
    return { ok: false, errors };
  }

  values.forEach((item, index) => {
    if (typeof item !== "string") {
      addError(errors, `corpus[${index}]`, "Live extractor corpus entries must be URL strings only.");
      return;
    }

    try {
      const url = new URL(item);
      const host = url.hostname.replace(/^www\./u, "");
      const isYoutube = host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
      if (!isYoutube) {
        addError(errors, `corpus[${index}]`, "Live extractor corpus URL must be a YouTube URL.");
      }
    } catch {
      addError(errors, `corpus[${index}]`, "Live extractor corpus entry is not a valid URL.");
    }
  });

  return { ok: errors.length === 0, errors };
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function validateCorpusPath(corpusPath, rootDir) {
  const resolved = path.resolve(rootDir, corpusPath);
  const corpus = await readJson(resolved);
  return validateLiveExtractorCorpus(corpus);
}

function resolveRelativeSource(specifier, importerPath) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const basePath = path.resolve(path.dirname(importerPath), specifier);
  const candidates = [
    basePath,
    `${basePath}.mjs`,
    `${basePath}.js`,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.json`,
    path.join(basePath, "index.mjs"),
    path.join(basePath, "index.js"),
    path.join(basePath, "index.ts"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? basePath;
}

async function isFile(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

export async function validateLiveExtractorSource({ entrypointPath, rootDir = ROOT } = {}) {
  const errors = [];

  if (!entrypointPath) {
    addError(errors, "extractor_entrypoint", "Live report must declare the live extractor entrypoint.");
    return { ok: false, errors };
  }

  const resolvedEntrypoint = path.resolve(rootDir, entrypointPath);
  const queue = [resolvedEntrypoint];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const relative = path.relative(rootDir, current);
    if (isForbiddenSourcePath(relative)) {
      addError(errors, relative, "Live extractor source/import graph cannot read fixtures, parity data, expected answers, test files, or .omx artifacts.");
      continue;
    }

    if (!(await isFile(current))) {
      addError(errors, relative, "Live extractor source file does not exist.");
      continue;
    }

    const source = await readFile(current, "utf8");
    for (const match of source.matchAll(SOURCE_IMPORT_PATTERN)) {
      const imported = resolveRelativeSource(match[1], current);
      if (imported) {
        queue.push(imported);
      }
    }
  }

  return {
    checked_files: [...visited].map((filePath) => path.relative(rootDir, filePath)),
    ok: errors.length === 0,
    errors,
  };
}

export async function validateYoutubeLiveExtractionReport(report, options = {}) {
  const errors = [];
  const rootDir = options.rootDir ?? ROOT;
  const manifest = getManifest(report);
  const runMode = getManifestValue(report, "run_mode");
  const evidenceOrigin = getManifestValue(report, "evidence_origin");
  const environment = getReportEnvironment(report);
  const results = asArray(report.results);
  const derivedRows = buildDerivedRows(results);
  const derivedVerifiedLive = deriveReportVerifiedLive(derivedRows);
  const derivedUiVerified = deriveReportUiVerified(derivedRows);
  const publicImprovementClaim = hasTruthyManualClaim(report, "public_improvement_claim");
  const claimedVerifiedLive = hasTruthyManualClaim(report, "verified_live");
  const claimedUiVerified = hasTruthyManualClaim(report, "ui_verified");
  const providerNames = uniqueStrings(derivedRows.flatMap((row) => row.provider_names));
  const sessionIds = uniqueStrings(derivedRows.flatMap((row) => row.session_ids));

  if (!REPORT_MODES.has(runMode)) {
    addError(errors, "run_mode", "Report run_mode must be fixture_replay, live_smoke, or ui_capture.");
  }

  if (!EVIDENCE_ORIGINS.has(evidenceOrigin)) {
    addError(errors, "evidence_origin", "Report evidence_origin must be test_fixture, live_provider, or browser_ui.");
  }

  if ((runMode === "live_smoke" && evidenceOrigin !== "live_provider") || (runMode === "ui_capture" && evidenceOrigin !== "browser_ui")) {
    addError(errors, "evidence_origin", `Report evidence_origin does not match run_mode ${runMode}.`);
  }

  if (results.length === 0) {
    addError(errors, "results", "Report must include at least one result row.");
  }

  if (runMode === "live_smoke" || runMode === "ui_capture") {
    const nodeEnv = environment.node_env ?? environment.NODE_ENV ?? null;
    const fixtureProvider = environment.homecook_youtube_fixture_provider ?? environment.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER ?? null;
    const artifactProducerPath = manifest.artifact_producer_path ?? manifest.producer_path ?? report.artifact_producer_path ?? null;
    const extractorEntrypoint = manifest.extractor_entrypoint ?? null;
    const evaluatorEntrypoint = manifest.evaluator_entrypoint ?? null;
    const corpusPath = manifest.extractor_corpus_path ?? null;

    if (nodeEnv === "test") {
      addError(errors, "environment.node_env", "Live extraction evidence cannot run with NODE_ENV=test.");
    }

    if (fixtureProvider !== "0") {
      addError(errors, "environment.homecook_youtube_fixture_provider", "Live extraction evidence requires HOMECOOK_YOUTUBE_FIXTURE_PROVIDER=0.");
    }

    if (!artifactProducerPath || isForbiddenSourcePath(artifactProducerPath)) {
      addError(errors, "artifact_producer_path", "Live report artifact producer cannot be a test, fixture, parity, expected-answer, or .omx artifact file.");
    }

    if (extractorEntrypoint && evaluatorEntrypoint && path.normalize(extractorEntrypoint) === path.normalize(evaluatorEntrypoint)) {
      addError(errors, "evaluator_entrypoint", "Live extraction and reference evaluation must use separate entrypoints.");
    }

    for (const name of providerNames) {
      if (isForbiddenProviderName(name)) {
        addError(errors, "provider_names", `Forbidden provider name for live evidence: ${name}`);
      }
    }

    derivedRows.forEach((row, index) => {
      const result = results[index];
      for (const key of FORBIDDEN_RESULT_REFERENCE_KEYS) {
        if (Object.hasOwn(result, key)) {
          addError(errors, `results[${index}].${key}`, "Live extractor report rows cannot contain reference answers or Recipio comparison fields.");
        }
      }

      if (result.input && typeof result.input === "object") {
        const illegalInputKeys = Object.keys(result.input).filter((key) => key !== "youtube_url");
        if (illegalInputKeys.length > 0) {
          addError(errors, `results[${index}].input`, "Live extractor input evidence may contain youtube_url only.");
        }
      }

      if (!row.verified_live && row.blocking_issues.length === 0) {
        addError(errors, `results[${index}].session_ids`, "Live result row must match a persisted extraction session or have a blocking issue.");
      }
    });

    if (claimedVerifiedLive && !derivedVerifiedLive) {
      addError(errors, "verified_live", "Report-supplied verified_live=true is ignored unless persisted session provenance proves it.");
    }

    if (claimedUiVerified && !derivedUiVerified) {
      addError(errors, "ui_verified", "Report-supplied ui_verified=true is ignored unless DOM count evidence proves it.");
    }

    if (publicImprovementClaim && !derivedVerifiedLive) {
      addError(errors, "public_improvement_claim", "public_improvement_claim=true requires validator-derived verified_live=true.");
    }

    if (publicImprovementClaim && !derivedUiVerified) {
      addError(errors, "public_improvement_claim", "public_improvement_claim=true requires validator-derived ui_verified=true.");
    }

    if (extractorEntrypoint && options.checkSource !== false) {
      const sourceResult = await validateLiveExtractorSource({ entrypointPath: extractorEntrypoint, rootDir });
      for (const error of sourceResult.errors) {
        errors.push(error);
      }
    }

    if (corpusPath) {
      try {
        const corpusResult = await validateCorpusPath(corpusPath, rootDir);
        for (const error of corpusResult.errors) {
          errors.push(error);
        }
      } catch (error) {
        addError(errors, "extractor_corpus_path", error instanceof Error ? error.message : String(error));
      }
    }
  }

  const scoreResult = report.scores ? validateScoreLayerSeparation(report.scores) : { ok: true, errors: [] };
  for (const error of scoreResult.errors) {
    errors.push(error);
  }

  return {
    ok: errors.length === 0,
    errors,
    derived: {
      provider_names: providerNames,
      session_ids: sessionIds,
      ui_verified: derivedUiVerified,
      user_facing_total: scoreResult.user_facing_total ?? null,
      verified_live: derivedVerifiedLive,
      rows: derivedRows,
    },
  };
}

async function main() {
  const argv = process.argv.slice(2).filter((token) => token !== "--");
  const reportPath = argv[0];

  if (!reportPath || reportPath === "--help" || reportPath === "-h") {
    process.stdout.write("Usage: node scripts/validate-youtube-live-extraction-report.mjs <report.json>\n");
    process.exit(reportPath ? 0 : 1);
  }

  const resolvedPath = path.resolve(reportPath);
  const report = await readJson(resolvedPath);
  const result = await validateYoutubeLiveExtractionReport(report, {
    rootDir: ROOT,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
