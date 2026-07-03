#!/usr/bin/env node
/* eslint-disable no-console */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

async function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(await readFile(filePath, "utf8"));
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function ingredientLine(ingredient) {
  const amount = [ingredient.amount, ingredient.unit].filter(Boolean).join(" ");
  const basis = ingredient.amountBasis ? ` · ${ingredient.amountBasis}` : "";
  const confidence = Number.isFinite(Number(ingredient.confidence)) ? ` · conf ${Number(ingredient.confidence).toFixed(2)}` : "";
  const evidence = Array.isArray(ingredient.evidence) && ingredient.evidence.length
    ? ` · evidence ${ingredient.evidence.slice(0, 3).join(" / ")}`
    : "";
  return `${ingredient.name ?? ingredient.item ?? ingredient.ingredient ?? "재료명 없음"}${amount ? ` — ${amount}` : ""}${basis}${confidence}${evidence}`;
}

function stepLine(step, index) {
  if (typeof step === "string") return step;
  return step?.instruction ?? step?.text ?? step?.description ?? `단계 ${index + 1}`;
}

function list(items, mapper) {
  if (!Array.isArray(items) || items.length === 0) return "<p class=\"empty\">없음</p>";
  return `<ol>${items.map((item, index) => `<li>${esc(mapper(item, index))}</li>`).join("")}</ol>`;
}

function metric(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "") : "-";
}

function recipeBlock(recipe, type) {
  return `
    <section class="recipe ${type}">
      <h4>${esc(recipe?.title ?? "제목 없음")}</h4>
      <div class="subhead">재료</div>
      ${list(recipe?.ingredients ?? [], ingredientLine)}
      <div class="subhead">단계</div>
      ${list(recipe?.steps ?? [], stepLine)}
    </section>
  `;
}

function visualSummaryHtml({ visualTarget, visual, visualEstimates }) {
  const targets = visualTarget?.targets ?? [];
  const estimates = visualEstimates?.visualEstimates ?? [];
  if (targets.length === 0 && estimates.length === 0) return "";
  const rows = targets.slice(0, 12).map((target) => {
    const estimate = estimates.find((entry) => entry.targetId === target.targetId);
    const amount = [estimate?.amount, estimate?.unit].filter(Boolean).join(" ") || "null";
    return `<tr><td>${esc(target.candidateId)}</td><td>${esc(target.ingredient)}</td><td>${esc(target.reason)}</td><td>${esc(target.fallbackPolicy)}</td><td>${esc(amount)}</td><td>${esc(estimate?.amountBasis ?? "-")}</td><td>${metric(estimate?.confidence)}</td><td>${esc(estimate?.reason ?? "-")}</td></tr>`;
  }).join("");
  const frameCount = (visual?.targets ?? []).reduce((sum, target) => sum + (target.frames?.length ?? 0), 0);
  return `
    <section class="visual-box">
      <h3>Visual target / estimate</h3>
      <p class="muted">targets ${targets.length} · frames ${frameCount} · estimates ${estimates.length}</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>후보</th><th>재료</th><th>target 이유</th><th>fallback</th><th>추정량</th><th>basis</th><th>conf</th><th>이유</th></tr></thead>
          <tbody>${rows || "<tr><td colspan=\"8\">없음</td></tr>"}</tbody>
        </table>
      </div>
    </section>
  `;
}

function caseHtml({ source, golden, result, det, sem, manifest, visualTarget, visual, visualEstimates }) {
  const maxRecipes = Math.max(golden?.recipes?.length ?? 0, result?.recipes?.length ?? 0);
  const rows = [];
  for (let index = 0; index < maxRecipes; index += 1) {
    rows.push(`
      <div class="pair">
        <div>${recipeBlock(golden?.recipes?.[index] ?? { title: "누락", ingredients: [], steps: [] }, "golden")}</div>
        <div>${recipeBlock(result?.recipes?.[index] ?? { title: "누락", ingredients: [], steps: [] }, "pred")}</div>
      </div>
    `);
  }
  const visualStatus = visual
    ? `${visual.collectionStatus ?? "-"} · frames ${(visual.candidates ?? []).reduce((sum, candidate) => sum + (candidate.frames?.length ?? 0), 0)}`
    : "-";
  const semScore = sem?.averageScore ?? sem?.cases?.[0]?.case_score ?? null;
  return `
    <article class="case">
      <header>
        <div>
          <h2>${esc(source?.video?.title ?? golden?.videoId ?? result?.videoId)}</h2>
          <p class="muted">${esc(golden?.videoId ?? result?.videoId)} · visual ${esc(visualStatus)} · forbidden reads ${manifest?.forbiddenReadEvents?.length ?? "-"}</p>
        </div>
        <div class="scores">
          <span>F1 ${metric(det?.ingredientF1)}</span>
          <span>Amount ${metric(det?.amountMatchRate)}</span>
          <span>Step ${metric(det?.stepCoverage)}</span>
          <span>Semantic ${metric(semScore)}</span>
        </div>
      </header>
      ${visualSummaryHtml({ visualTarget, visual, visualEstimates })}
      ${rows.join("")}
    </article>
  `;
}

export async function renderComparisonHtml(rawArgs = {}, options = {}) {
  const args = typeof rawArgs.length === "number" ? parseCliArgs(rawArgs) : rawArgs;
  const projectRoot = options.projectRoot ?? process.cwd();
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = args["out-tag"];
  if (!outTag) throw new Error("--out-tag is required");
  const dataRoot = path.join(projectRoot, "notebooks/recipe_loop_data", split);
  const ids = typeof args.ids === "string"
    ? args.ids.split(",").map((item) => item.trim()).filter(Boolean)
    : (await readdir(dataRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const outputPath = path.resolve(projectRoot, args.output ?? `.omx/plans/pi-extractor-${outTag}-vs-golden.html`);
  const grade = await readJson(path.join(dataRoot, `_grade_summary.${outTag}.json`), { aggregate: {}, perVideo: [] });
  const semantic = await readJson(path.join(dataRoot, `_semantic_summary.${outTag}.json`), { aggregate: {}, perVideo: [] });
  const cases = [];
  for (const id of ids) {
    const caseDir = path.join(dataRoot, id);
    const runDir = path.join(caseDir, "runs", outTag);
    cases.push(caseHtml({
      source: await readJson(path.join(caseDir, "source.json"), {}),
      golden: await readJson(path.join(caseDir, "golden.json"), { videoId: id, recipes: [] }),
      result: await readJson(path.join(runDir, "result.json"), { videoId: id, recipes: [] }),
      det: grade.perVideo?.find((item) => item.videoId === id),
      sem: semantic.perVideo?.find((item) => item.videoId === id),
      manifest: await readJson(path.join(runDir, "file-access-manifest.json"), null),
      visualTarget: await readJson(path.join(runDir, "visual-target-ledger.json"), null),
      visual: await readJson(path.join(runDir, "visual-ledger.json"), null),
      visualEstimates: await readJson(path.join(runDir, "visual-estimates.json"), null),
    }));
  }
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pi extractor train vs golden · ${esc(outTag)}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2933; background: #f6f7f9; }
    main { max-width: 1280px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 0; font-size: 18px; line-height: 1.35; }
    h4 { margin: 0 0 12px; font-size: 16px; }
    .summary, .case { background: #fff; border: 1px solid #d8dee8; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
    .summary { padding: 20px; margin: 20px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    .tile { padding: 12px; background: #f9fafb; border: 1px solid #e3e8ef; border-radius: 6px; }
    .tile strong { display: block; font-size: 20px; margin-top: 4px; }
    .case { margin-top: 18px; overflow: hidden; }
    .case > header { display: flex; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid #e3e8ef; }
    .scores { display: flex; flex-wrap: wrap; gap: 8px; align-content: start; justify-content: flex-end; }
    .scores span { padding: 6px 8px; background: #eef2f7; border-radius: 6px; font-size: 13px; white-space: nowrap; }
    .muted { color: #627386; margin: 6px 0 0; font-size: 13px; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #edf0f4; }
    .pair:first-of-type { border-top: 0; }
    .recipe { padding: 18px 20px; min-height: 160px; }
    .golden { border-right: 1px solid #edf0f4; background: #fffef8; }
    .pred { background: #f8fbff; }
    .subhead { margin-top: 14px; font-weight: 700; color: #334155; }
    .visual-box { padding: 14px 20px; border-bottom: 1px solid #e3e8ef; background: #fbfcfe; }
    .visual-box h3 { margin: 0 0 4px; font-size: 15px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th, td { border: 1px solid #e3e8ef; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #eef2f7; }
    ol { margin: 8px 0 0 20px; padding: 0; }
    li { margin: 5px 0; line-height: 1.45; }
    .empty { color: #9aa6b2; margin: 8px 0 0; }
    @media (max-width: 760px) { .case > header, .pair { display: block; } .golden { border-right: 0; border-bottom: 1px solid #edf0f4; } }
  </style>
</head>
<body>
<main>
  <h1>Pi 추출 결과와 Golden 비교</h1>
  <p class="muted">split=${esc(split)} · outTag=${esc(outTag)} · 이 보고서는 추출/freeze 이후에 생성되어 golden을 읽습니다.</p>
  <section class="summary">
    <div class="grid">
      <div class="tile">완료<strong>${grade.aggregate?.actual_count ?? ids.length}/${grade.aggregate?.expected_count ?? ids.length}</strong></div>
      <div class="tile">레시피 수 일치<strong>${metric(grade.aggregate?.recipeCountMatchRate)}</strong></div>
      <div class="tile">재료 F1<strong>${metric(grade.aggregate?.ingredientF1)}</strong></div>
      <div class="tile">분량 일치<strong>${metric(grade.aggregate?.amountMatchRate)}</strong></div>
      <div class="tile">단계 커버리지<strong>${metric(grade.aggregate?.stepCoverage)}</strong></div>
      <div class="tile">Semantic 평균<strong>${metric(semantic.aggregate?.averageScore)}</strong></div>
      <div class="tile">Semantic 하위2<strong>${metric(semantic.aggregate?.bottomKMeanScore)}</strong></div>
      <div class="tile">Semantic 통과<strong>${semantic.aggregate?.threshold_success ? "PASS" : "FAIL"}</strong></div>
    </div>
  </section>
  ${cases.join("\n")}
</main>
</body>
</html>`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
  return { outputPath };
}

async function main() {
  const result = await renderComparisonHtml(process.argv.slice(2));
  console.log(`[OK] comparison HTML: ${path.relative(process.cwd(), result.outputPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
