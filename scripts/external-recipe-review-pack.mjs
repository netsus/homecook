#!/usr/bin/env node

import path from "node:path";

import {
  buildIngredientLookup,
  buildRecipeRiskReport,
  envValue,
  escapeHtml,
  normalizeFoodSafetyRecipeRow,
  parseCliArgs,
  parsePositiveInteger,
  readJson,
  readLocalEnv,
  selectPilotCandidates,
  stringOrNull,
  writeJson,
  writeText,
} from "./lib/external-recipe-ingest.mjs";

const DEFAULT_OUTPUT_DIR = ".artifacts/external-recipe-ingest/review-pack";

async function fetchSupabaseTable({ table, select, localEnv }) {
  const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL", localEnv);
  const anonKey = envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", localEnv);

  if (!supabaseUrl || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  }

  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.searchParams.set("select", select);
  url.searchParams.set("limit", "10000");

  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase REST ${table} failed: HTTP ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function loadDictionary({ localEnv, dictionaryPath }) {
  if (dictionaryPath) {
    return readJson(dictionaryPath);
  }

  const [ingredients, ingredientSynonyms] = await Promise.all([
    fetchSupabaseTable({
      table: "ingredients",
      select: "id,standard_name,category",
      localEnv,
    }),
    fetchSupabaseTable({
      table: "ingredient_synonyms",
      select: "ingredient_id,synonym,ingredients(id,standard_name)",
      localEnv,
    }),
  ]);

  return { ingredients, ingredient_synonyms: ingredientSynonyms };
}

function renderRiskMarkdown({ generatedAt, riskReport, selected }) {
  const lines = [
    `# Recipe Load Risk Report - ${generatedAt.slice(0, 10)}`,
    "",
    "## Summary",
    "",
    `- Source rows: ${riskReport.summary.source_row_count}`,
    `- Candidate recipes: ${riskReport.summary.candidate_recipe_count}`,
    `- Blocked candidates: ${riskReport.summary.blocked_count}`,
    `- Pilot selected: ${riskReport.summary.pilot_selected_count}`,
    `- Unresolved ingredient names: ${riskReport.summary.unresolved_ingredient_name_count}`,
    `- Unresolved cooking methods: ${riskReport.summary.unresolved_cooking_method_count}`,
    `- Weak step rows: ${riskReport.summary.weak_step_count}`,
    `- Production DB writes: ${riskReport.summary.production_db_writes}`,
    "",
    "## Risk Flags",
    "",
    "| flag | count |",
    "| --- | ---: |",
    ...Object.entries(riskReport.risk_flag_counts).map(([flag, count]) => `| ${flag} | ${count} |`),
    "",
    "## Pilot Selection",
    "",
    "| title | bucket | score | reason |",
    "| --- | --- | ---: | --- |",
    ...selected.map((candidate) => `| ${candidate.title} | ${candidate.bucket} | ${candidate.score} | ${candidate.pilot_selection_reason} |`),
    "",
    "## Top Unresolved Ingredients",
    "",
    "| name | count |",
    "| --- | ---: |",
    ...riskReport.unresolved_ingredient_names.slice(0, 50).map((item) => `| ${item.name} | ${item.count} |`),
  ];

  return `${lines.join("\n")}\n`;
}

function renderWorklist(candidates) {
  const header = [
    "decision",
    "candidate_id",
    "title",
    "bucket",
    "score",
    "blocked",
    "risk_flags",
    "resolved_ingredients",
    "unresolved_ingredients",
    "step_count",
    "method",
    "review_note",
  ];
  const rows = candidates.map((candidate) => {
    const resolvedCount = candidate.ingredients.filter((ingredient) => ingredient.resolved).length;
    const unresolved = candidate.ingredients
      .filter((ingredient) => !ingredient.resolved)
      .map((ingredient) => ingredient.parsed_name)
      .join(", ");

    return [
      candidate.blocked ? "exclude" : "review",
      candidate.candidate_id,
      candidate.title,
      candidate.bucket,
      String(candidate.score),
      String(candidate.blocked),
      candidate.risk_flags.join(","),
      String(resolvedCount),
      unresolved,
      String(candidate.steps.length),
      candidate.cooking_method?.label ?? "",
      "",
    ]
      .map((value) => String(value).replace(/\t/g, " ").replace(/\r?\n/g, " "))
      .join("\t");
  });

  return `${[header.join("\t"), ...rows].join("\n")}\n`;
}

function renderReviewHtml({ candidates, selected, generatedAt }) {
  const selectedIds = new Set(selected.map((candidate) => candidate.candidate_id));
  const cards = candidates
    .map((candidate) => {
      const ingredients = candidate.ingredients
        .map((ingredient) => {
          const target = ingredient.target?.standard_name ?? "미해결";
          const className = ingredient.resolved ? "ok" : "bad";

          return `<tr><td>${escapeHtml(ingredient.display_text)}</td><td>${escapeHtml(ingredient.parsed_name)}</td><td class="${className}">${escapeHtml(target)}</td><td>${escapeHtml(ingredient.amount_text ?? "")}</td></tr>`;
        })
        .join("");
      const steps = candidate.steps
        .map((step) => `<li><span>${step.step_number}</span>${escapeHtml(step.instruction)}</li>`)
        .join("");
      const selectedLabel = selectedIds.has(candidate.candidate_id) ? "pilot" : "review";

      return `
        <section class="card ${candidate.blocked ? "blocked" : ""}">
          <div class="card-head">
            <div>
              <strong>${escapeHtml(candidate.title)}</strong>
              <p>${escapeHtml(candidate.source_recipe_id)} · ${escapeHtml(candidate.bucket)} · ${escapeHtml(selectedLabel)}</p>
            </div>
            <div class="score">${candidate.score}</div>
          </div>
          <div class="meta">
            <span>${candidate.blocked ? "blocked" : "candidate"}</span>
            <span>${escapeHtml(candidate.cooking_method?.label ?? "조리법 미해결")}</span>
            ${candidate.risk_flags.map((flag) => `<span class="risk">${escapeHtml(flag)}</span>`).join("")}
          </div>
          <table>
            <thead><tr><th>원문</th><th>파싱명</th><th>대표 재료</th><th>분량</th></tr></thead>
            <tbody>${ingredients}</tbody>
          </table>
          <ol>${steps}</ol>
        </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>집밥 레시피 DB 리뷰팩</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fb; color: #1f2937; }
    header { position: sticky; top: 0; z-index: 2; padding: 20px 28px; background: rgba(255,255,255,.94); border-bottom: 1px solid #dde3ea; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    main { padding: 24px 28px 40px; display: grid; gap: 16px; }
    .card { background: #fff; border: 1px solid #d9e1eb; border-radius: 8px; padding: 18px; box-shadow: 0 8px 24px rgba(15,23,42,.05); }
    .card.blocked { border-color: #f0b4b4; background: #fffafa; }
    .card-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .card-head strong { font-size: 20px; }
    .card-head p { margin: 6px 0 0; color: #64748b; }
    .score { min-width: 52px; height: 52px; display: grid; place-items: center; border-radius: 999px; background: #eaf4ff; color: #0673d8; font-weight: 800; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
    .meta span { padding: 5px 9px; border-radius: 999px; background: #edf2f7; font-size: 13px; }
    .meta .risk { background: #fff0f0; color: #b42318; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
    th { color: #475569; font-size: 13px; }
    td.ok { color: #047857; font-weight: 700; }
    td.bad { color: #b42318; font-weight: 700; }
    ol { margin: 12px 0 0; padding-left: 0; list-style: none; display: grid; gap: 8px; }
    li { display: grid; grid-template-columns: 28px 1fr; gap: 8px; line-height: 1.6; }
    li span { width: 24px; height: 24px; display: inline-grid; place-items: center; border-radius: 50%; background: #e5e7eb; font-size: 12px; font-weight: 800; }
  </style>
</head>
<body>
  <header>
    <h1>집밥 레시피 DB 리뷰팩</h1>
    <div>생성일: ${escapeHtml(generatedAt)} · 후보 ${candidates.length}개 · pilot ${selected.length}개</div>
  </header>
  <main>${cards}</main>
</body>
</html>
`;
}

function renderPilotSelection({ selected, generatedAt }) {
  const lines = [
    `# Recipe Pilot Selection - ${generatedAt.slice(0, 10)}`,
    "",
    "## Rule",
    "",
    "- Source: FoodSafetyKorea `COOKRCP01` only.",
    "- Production DB writes: 0.",
    "- Only explicitly approved review decisions can become a migration later.",
    "",
    "## Selected Candidates",
    "",
    "| title | source id | bucket | score | method | resolved/total ingredients |",
    "| --- | --- | --- | ---: | --- | ---: |",
    ...selected.map((candidate) => {
      const resolved = candidate.ingredients.filter((ingredient) => ingredient.resolved).length;

      return `| ${candidate.title} | ${candidate.source_recipe_id} | ${candidate.bucket} | ${candidate.score} | ${candidate.cooking_method?.label ?? ""} | ${resolved}/${candidate.ingredients.length} |`;
    }),
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const sourceExportPath = stringOrNull(args["source-export"]);
  if (!sourceExportPath) {
    throw new Error("Usage: pnpm external:recipes:review-pack -- --source-export <live-source-export.json> [--output-dir <dir>]");
  }

  const localEnv = await readLocalEnv();
  const outputDir = stringOrNull(args["output-dir"]) ?? DEFAULT_OUTPUT_DIR;
  const generatedAt = stringOrNull(args["generated-at"]) ?? new Date().toISOString();
  const targetCount = parsePositiveInteger(args["target-count"], 30);
  const sourceExport = await readJson(sourceExportPath);
  const dictionary = await loadDictionary({
    localEnv,
    dictionaryPath: stringOrNull(args["ingredient-dictionary"]),
  });
  const lookup = buildIngredientLookup(dictionary);
  const rows = Array.isArray(sourceExport.foodsafetyCookRecipeRows)
    ? sourceExport.foodsafetyCookRecipeRows
    : [];
  const candidates = rows.map((row) => normalizeFoodSafetyRecipeRow(row, { ingredientLookup: lookup }));
  const selected = selectPilotCandidates(candidates, targetCount);
  const riskReport = buildRecipeRiskReport(candidates, selected);
  const candidateReport = {
    generated_at: generatedAt,
    source_export: sourceExportPath,
    source_provider: sourceExport.source_provider ?? "foodsafety-cookrcp",
    source_kind: sourceExport.source_kind ?? null,
    production_db_writes: 0,
    candidates,
    pilot_selection: selected.map((candidate) => candidate.candidate_id),
    summary: riskReport.summary,
  };

  await writeJson(path.join(outputDir, "recipe-candidates.json"), candidateReport);
  await writeJson(path.join(outputDir, "recipe-load-risk-report.json"), riskReport);
  await writeText(path.join(outputDir, "recipe-load-risk-report.md"), renderRiskMarkdown({ generatedAt, riskReport, selected }));
  await writeText(path.join(outputDir, "recipe-review-worklist.tsv"), renderWorklist(candidates));
  await writeText(path.join(outputDir, "recipe-review.html"), renderReviewHtml({ candidates, selected, generatedAt }));
  await writeText(path.join(outputDir, `recipe-pilot-selection-${generatedAt.slice(0, 10)}.md`), renderPilotSelection({ selected, generatedAt }));

  process.stdout.write(`Wrote ${path.join(outputDir, "recipe-candidates.json")}\n`);
  process.stdout.write(`Wrote ${path.join(outputDir, "recipe-review.html")}\n`);
  process.stdout.write(`Pilot selected: ${selected.length}\n`);
  process.stdout.write("Production DB writes: 0\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
