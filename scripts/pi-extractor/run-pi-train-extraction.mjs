#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { runPiExtraction } from "./run-pi-extraction.mjs";

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export async function runPiTrainExtraction(rawArgs = {}, options = {}) {
  const args = typeof rawArgs.length === "number" ? parseCliArgs(rawArgs) : rawArgs;
  const holisticMode = args.mode === "holistic-draft";
  const holisticTimelineUnderstanding = args["holistic-enable-timeline-understanding"] === true;
  return runPiExtraction({
    split: "train",
    staged: true,
    "source-packet-only": true,
    "compact-source-packet": true,
    "fast-prompt": true,
    "generic-repair": true,
    "visual-frames": true,
    "visual-frame-count": "3",
    "visual-frames-per-range": "3",
    "visual-seconds-per-candidate": "24",
    "visual-target-max-ranges": "3",
    "visual-window-before-sec": "8",
    "visual-window-after-sec": "12",
    "visual-description-only-sweep": true,
    "visual-description-only-sweep-frames": "6",
    "visual-max-targets-per-candidate": "4",
    "visual-max-total-targets-per-case": "16",
    "visual-max-frames-per-target": "6",
    "visual-estimates": true,
    "visual-estimate-max-frames": "6",
    "visual-timeout-ms": "180000",
    freeze: true,
    "max-caption-segments": "300",
    "max-description-chars": "2800",
    "max-author-comments": "2",
    "timeout-ms": "180000",
    thinking: holisticMode ? "medium" : "low",
    ...(holisticMode ? {
      ...(holisticTimelineUnderstanding ? {} : { "holistic-storyboard-frame-count": "8" }),
      "holistic-storyboard-max-candidates": "8",
      "holistic-max-targets-per-recipe": "3",
      "holistic-max-total-targets": "12",
      "holistic-visual-target-max-window-sec": "16",
      "visual-allow-fallback-ranges": true,
      "visual-description-only-sweep-frames": "2",
      "visual-max-frames-per-target": "4",
      "visual-estimate-max-frames": "4",
    } : {}),
    ...args,
  }, options);
}

async function main() {
  const result = await runPiTrainExtraction(process.argv.slice(2));
  process.exit(result.failures > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
