#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateYoutubeLiveExtractionReport } from "./validate-youtube-live-extraction-report.mjs";

const ROOT = process.cwd();
const REPORT_SCHEMA = "youtube-live-extraction-report-v1";
const UI_SCRIPT_PATH = "scripts/youtube-smoke-ui.mjs";

function parseArgs(argv) {
  const args = {
    output: null,
    report: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--report" && next) {
      args.report = next;
      index += 1;
      continue;
    }

    if (token === "--output" && next) {
      args.output = next;
      index += 1;
      continue;
    }

    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.report) {
    throw new Error("--report is required.");
  }

  return args;
}

function printHelp() {
  process.stdout.write("Usage: pnpm youtube:smoke:ui -- --report <live-smoke-report.json>\n");
}

function getLiveManifest(report) {
  return report.report_validation ?? report.validation ?? report;
}

function buildUiCaptureReport(liveReport, liveReportPath) {
  const liveManifest = getLiveManifest(liveReport);
  const environment = liveManifest.environment ?? {};
  const results = Array.isArray(liveReport.results)
    ? liveReport.results.map((result) => ({
        blocking_issues: result.blocking_issues ?? [],
        db: result.db?.sessionExport
          ? {
              sessionExport: result.db.sessionExport,
              sessionFound: result.db.sessionFound === true,
            }
          : result.db,
        errors: result.errors ?? [],
        extracted_counts: result.extracted_counts ?? null,
        extractionId: result.extractionId ?? result.extraction_id ?? null,
        id: result.id ?? result.videoId ?? result.video_id ?? null,
        provider_names: result.provider_names ?? [],
        session_ids: result.session_ids ?? [],
        source_providers: result.source_providers ?? [],
        ui_evidence: result.ui_evidence ?? result.uiEvidence ?? null,
      }))
    : [];

  return {
    evidence_origin: "browser_ui",
    linked_live_report_path: liveReportPath,
    report_schema: REPORT_SCHEMA,
    report_validation: {
      artifact_producer_path: UI_SCRIPT_PATH,
      command: "pnpm youtube:smoke:ui",
      environment,
      evidence_origin: "browser_ui",
      extractor_entrypoint: liveManifest.extractor_entrypoint ?? null,
      public_improvement_claim: false,
      run_mode: "ui_capture",
      ui_verified: false,
      verified_live: false,
    },
    results,
    run_mode: "ui_capture",
    startedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const liveReportPath = path.resolve(args.report);
  const liveReport = JSON.parse(await readFile(liveReportPath, "utf8"));
  const report = buildUiCaptureReport(liveReport, liveReportPath);
  const outputPath = path.resolve(
    args.output ?? path.join(path.dirname(liveReportPath), "ui-capture-report.json"),
  );

  const validation = await validateYoutubeLiveExtractionReport(report, { rootDir: ROOT });
  await writeFile(outputPath, JSON.stringify({ ...report, validation_result: validation }, null, 2) + "\n");
  process.stdout.write(`UI capture report: ${outputPath}\n`);
  process.stdout.write(`UI capture validation:\n${JSON.stringify(validation, null, 2)}\n`);

  if (!validation.ok) {
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
