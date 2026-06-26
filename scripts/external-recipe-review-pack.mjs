#!/usr/bin/env node

import path from "node:path";

import {
  buildIngredientLookup,
  buildRecipeRiskReport,
  envValue,
  escapeHtml,
  foldText,
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

function renderIngredientOptions(dictionary) {
  return (dictionary.ingredients ?? [])
    .map((ingredient) => stringOrNull(ingredient.standard_name))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko-KR"))
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join("");
}

function ingredientStandardNames(dictionary) {
  return (dictionary.ingredients ?? [])
    .map((ingredient) => stringOrNull(ingredient.standard_name))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko-KR"));
}

function ingredientMentionedInSteps(ingredient, steps) {
  const stepText = foldText(steps.map((step) => step.instruction).join(" "));
  const candidates = [
    ingredient.parsed_name,
    ingredient.target?.standard_name,
    ingredient.component_label && ingredient.parsed_name?.includes(ingredient.component_label)
      ? ingredient.component_label
      : null,
  ]
    .map((value) => foldText(value))
    .filter((value) => value.length >= 2);

  return candidates.some((value) => stepText.includes(value));
}

function renderReviewHtml({ candidates, selected, generatedAt, dictionary }) {
  const selectedIds = new Set(selected.map((candidate) => candidate.candidate_id));
  const selectedOrder = new Map(selected.map((candidate, index) => [candidate.candidate_id, index + 1]));
  const ingredientOptions = renderIngredientOptions(dictionary);
  const standardNames = ingredientStandardNames(dictionary);
  const cards = candidates
    .map((candidate) => {
      const isPilot = selectedIds.has(candidate.candidate_id);
      const pilotOrder = selectedOrder.get(candidate.candidate_id) ?? null;
      const defaultDecision = candidate.blocked ? "exclude" : isPilot ? "approve" : "hold";
      const ingredients = candidate.ingredients
        .map((ingredient, ingredientIndex) => {
          const target = ingredient.target?.standard_name ?? "미해결";
          const className = ingredient.resolved ? "ok" : "bad";
          const ingredientDecision = ingredient.resolved ? "keep" : "map_to_existing";
          const mentionedInSteps = ingredientMentionedInSteps(ingredient, candidate.steps);

          return `<tr data-ingredient-row data-index="${ingredientIndex + 1}" data-row-kind="source" data-resolved="${ingredient.resolved ? "true" : "false"}" data-step-mentioned="${mentionedInSteps ? "true" : "false"}" data-component-label="${escapeHtml(ingredient.component_label ?? "")}">
            <td class="review-cell">
              <span class="cell-label">확인</span>
              <label class="review-check"><input type="checkbox" data-ingredient-reviewed aria-label="${ingredientIndex + 1}번 재료 확인"></label>
            </td>
            <td class="source-cell">
              <span class="cell-label">원문</span>
              <strong>${escapeHtml(ingredient.display_text)}</strong>
              ${mentionedInSteps ? "" : '<small class="step-missing-label">조리단계 직접 언급 없음</small>'}
            </td>
            <td>
              <span class="cell-label">섹션</span>
              <input data-ingredient-component-label value="${escapeHtml(ingredient.component_label ?? "")}" placeholder="예: 소스" aria-label="재료 섹션">
            </td>
            <td>
              <span class="cell-label">파싱명</span>
              <input data-ingredient-parsed value="${escapeHtml(ingredient.parsed_name)}" aria-label="파싱명">
            </td>
            <td class="${className}">
              <span class="cell-label">대표 재료</span>
              <input data-ingredient-target list="ingredient-options" value="${ingredient.resolved ? escapeHtml(target) : ""}" placeholder="예: 식용유" aria-label="대표 재료">
              <small data-target-status>${escapeHtml(target)}</small>
            </td>
            <td>
              <span class="cell-label">분량</span>
              <input data-ingredient-amount value="${escapeHtml(ingredient.amount_text ?? "")}" aria-label="분량">
            </td>
            <td>
              <span class="cell-label">결정</span>
              <select data-ingredient-decision aria-label="재료 결정">
                <option value="keep"${ingredientDecision === "keep" ? " selected" : ""}>유지</option>
                <option value="map_to_existing"${ingredientDecision === "map_to_existing" ? " selected" : ""}>기존 대표재료로 매핑</option>
                <option value="add_ingredient">새 대표재료 추가</option>
                <option value="add_synonym">동의어 추가</option>
                <option value="component_reference">완성 구성품 참조</option>
                <option value="exclude">레시피 재료행 제외</option>
                <option value="hold">보류</option>
              </select>
            </td>
            <td>
              <span class="cell-label">메모</span>
              <textarea data-ingredient-note placeholder="수정 이유"></textarea>
            </td>
            <td class="row-actions">
              <span class="cell-label">행</span>
              <button type="button" data-add-derived-ingredient>누락 재료 추가</button>
            </td>
          </tr>`;
        })
        .join("");
      const steps = candidate.steps
        .map(
          (step) => `<li data-step-row data-step-number="${step.step_number}" data-component-label="${escapeHtml(step.component_label ?? "")}" data-instruction="${escapeHtml(step.instruction)}">
            <span>${step.step_number}</span>
            <input data-step-component-label value="${escapeHtml(step.component_label ?? "")}" placeholder="섹션 없음" aria-label="${step.step_number}단계 섹션">
            <textarea data-step-instruction aria-label="${step.step_number}단계 조리내용">${escapeHtml(step.instruction)}</textarea>
          </li>`,
        )
        .join("");
      const selectedLabel = isPilot ? "pilot" : "review";
      const resolvedCount = candidate.ingredients.filter((ingredient) => ingredient.resolved).length;
      const stepMissingCount = candidate.ingredients.filter((ingredient) => !ingredientMentionedInSteps(ingredient, candidate.steps)).length;
      const rawTip = stringOrNull(candidate.raw_payload?.RCP_NA_TIP);
      const sourceImageUrl = stringOrNull(candidate.thumbnail_url) ?? stringOrNull(candidate.image_url);

      return `
        <section
          class="card ${candidate.blocked ? "blocked" : ""}"
          data-card
          data-candidate-id="${escapeHtml(candidate.candidate_id)}"
          data-source-id="${escapeHtml(candidate.source_recipe_id)}"
          data-pilot="${isPilot ? "true" : "false"}"
          data-pilot-order="${pilotOrder ?? ""}"
          data-blocked="${candidate.blocked ? "true" : "false"}"
          data-title="${escapeHtml(candidate.title)}"
        >
          <div class="card-head">
            <div>
              <label class="field-label">레시피명</label>
              <input class="title-input" data-recipe-title value="${escapeHtml(candidate.title)}" aria-label="레시피명">
              <p>${escapeHtml(candidate.source_recipe_id)} · ${escapeHtml(candidate.bucket)} · ${escapeHtml(selectedLabel)}${pilotOrder ? ` #${pilotOrder}` : ""}</p>
            </div>
            <div class="score">${candidate.score}</div>
          </div>
          <div class="decision-row">
            <label>
              <span>레시피 결정</span>
              <select data-recipe-decision>
                <option value="approve"${defaultDecision === "approve" ? " selected" : ""}>승인</option>
                <option value="exclude"${defaultDecision === "exclude" ? " selected" : ""}>제외</option>
                <option value="hold"${defaultDecision === "hold" ? " selected" : ""}>보류</option>
                <option value="fix_needed">수정 필요</option>
              </select>
            </label>
            <label>
              <span>조리법</span>
              <input data-method-label value="${escapeHtml(candidate.cooking_method?.label ?? "")}" placeholder="예: 끓이기">
            </label>
            <label class="note-field">
              <span>레시피 메모</span>
              <input data-recipe-note placeholder="제외/수정 이유">
            </label>
          </div>
          <div class="meta">
            ${pilotOrder ? `<span class="pilot-badge">Pilot ${pilotOrder}/${selected.length}</span>` : ""}
            <span>${candidate.blocked ? "blocked" : "candidate"}</span>
            <span>${escapeHtml(candidate.cooking_method?.label ?? "조리법 미해결")}</span>
            <span>${resolvedCount}/${candidate.ingredients.length} 재료 매핑</span>
            ${stepMissingCount > 0 ? `<span class="step-missing-badge">단계 미언급 ${stepMissingCount}</span>` : ""}
            ${candidate.risk_flags.map((flag) => `<span class="risk">${escapeHtml(flag)}</span>`).join("")}
          </div>
          <details class="source-evidence">
            <summary>원본 근거 보기</summary>
            <div class="source-grid">
              <div>
                <strong>원본 재료 전문</strong>
                <pre>${escapeHtml(candidate.raw_ingredient_text ?? "")}</pre>
              </div>
              <div>
                <strong>원본 보조정보</strong>
                <p>식약처 COOKRCP01 · RCP_SEQ ${escapeHtml(candidate.source_recipe_id)}</p>
                ${sourceImageUrl ? `<p><a href="${escapeHtml(sourceImageUrl)}" target="_blank" rel="noreferrer">원본 이미지 열기</a></p>` : ""}
                ${rawTip ? `<p>${escapeHtml(rawTip)}</p>` : ""}
              </div>
            </div>
          </details>
          <table>
            <thead><tr><th>확인</th><th>원문</th><th>섹션</th><th>파싱명</th><th>대표 재료</th><th>분량</th><th>결정</th><th>메모</th><th>행</th></tr></thead>
            <tbody>${ingredients}</tbody>
          </table>
          <h3>조리 단계</h3>
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
    .guide { margin: 10px 0 0; color: #475569; font-size: 14px; line-height: 1.5; }
    .guide strong { color: #1f2937; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 16px; }
    .toolbar button { border: 1px solid #d8e0ea; background: #fff; color: #1f2937; border-radius: 7px; padding: 9px 12px; font-weight: 700; cursor: pointer; }
    .toolbar button.active { border-color: #1798f2; background: #eaf6ff; color: #0673d8; }
    .toolbar input { min-width: 260px; flex: 1; border: 1px solid #d8e0ea; border-radius: 7px; padding: 10px 12px; font-size: 14px; }
    .toolbar .summary { margin-left: auto; color: #64748b; font-size: 13px; }
    main { padding: 24px 28px 40px; display: grid; gap: 16px; }
    .card { background: #fff; border: 1px solid #d9e1eb; border-radius: 8px; padding: 18px; box-shadow: 0 8px 24px rgba(15,23,42,.05); }
    .card[hidden] { display: none; }
    .card.blocked { border-color: #f0b4b4; background: #fffafa; }
    .card-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .card-head strong { font-size: 20px; }
    .card-head p { margin: 6px 0 0; color: #64748b; }
    .field-label, .decision-row span, .cell-label { display: block; margin-bottom: 5px; color: #64748b; font-size: 12px; font-weight: 700; }
    .title-input { width: min(560px, 70vw); border: 1px solid #d8e0ea; border-radius: 7px; padding: 10px 12px; font-size: 20px; font-weight: 800; }
    .decision-row { display: grid; grid-template-columns: 150px 180px 1fr; gap: 10px; margin: 16px 0 10px; }
    .decision-row select, .decision-row input, td input, td select, td textarea, li input, li textarea { width: 100%; box-sizing: border-box; border: 1px solid #d8e0ea; border-radius: 7px; padding: 8px 10px; font: inherit; background: #fff; }
    td textarea { min-height: 42px; resize: vertical; }
    li textarea { min-height: 58px; resize: vertical; line-height: 1.5; }
    .row-actions button { border: 1px solid #d8e0ea; border-radius: 7px; background: #fff; padding: 8px 10px; font-weight: 700; cursor: pointer; white-space: nowrap; }
    .row-actions button[data-remove-ingredient] { border-color: #f1b5b5; color: #b42318; }
    .score { min-width: 52px; height: 52px; display: grid; place-items: center; border-radius: 999px; background: #eaf4ff; color: #0673d8; font-weight: 800; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
    .meta span { padding: 5px 9px; border-radius: 999px; background: #edf2f7; font-size: 13px; }
    .meta .pilot-badge { background: #eaf6ff; color: #0673d8; font-weight: 800; }
    .meta .step-missing-badge { background: #fff7ed; color: #c2410c; font-weight: 800; }
    .meta .risk { background: #fff0f0; color: #b42318; }
    .source-evidence { margin: 12px 0; border: 1px solid #d8e0ea; border-radius: 8px; background: #f8fafc; }
    .source-evidence summary { padding: 11px 12px; cursor: pointer; font-weight: 800; color: #334155; }
    .source-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(240px, .8fr); gap: 12px; padding: 0 12px 12px; }
    .source-grid strong { display: block; margin-bottom: 6px; }
    .source-grid pre, .source-grid p { margin: 0; color: #475569; font-size: 13px; line-height: 1.55; white-space: pre-wrap; word-break: keep-all; }
    .source-grid a { color: #0673d8; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
    th { color: #475569; font-size: 13px; }
    .review-cell { width: 54px; }
    .review-check { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid #d8e0ea; border-radius: 7px; background: #fff; cursor: pointer; }
    .review-check input { width: 18px; height: 18px; accent-color: #1798f2; cursor: pointer; }
    .step-missing-label { color: #c2410c; font-weight: 800; }
    td.ok small { color: #047857; font-weight: 700; }
    td.bad small { color: #b42318; font-weight: 700; }
    td small.exists { color: #047857; }
    td small.new-target { color: #9a3412; }
    td small { display: block; margin-top: 5px; }
    h3 { margin: 18px 0 8px; font-size: 15px; }
    ol { margin: 12px 0 0; padding-left: 0; list-style: none; display: grid; gap: 8px; }
    li { display: grid; grid-template-columns: 28px minmax(120px, 180px) 1fr; gap: 8px; align-items: start; line-height: 1.6; }
    li span { width: 24px; height: 24px; display: inline-grid; place-items: center; border-radius: 50%; background: #e5e7eb; font-size: 12px; font-weight: 800; }
    @media (max-width: 900px) {
      header { padding: 16px; }
      main { padding: 16px; }
      .decision-row { grid-template-columns: 1fr; }
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tr { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin: 10px 0; }
      td { border-bottom: 0; padding: 8px 0; }
      li { grid-template-columns: 28px 1fr; }
      li textarea { grid-column: 2; }
      .source-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>집밥 레시피 DB 리뷰팩</h1>
    <div>생성일: ${escapeHtml(generatedAt)} · 후보 ${candidates.length}개 · pilot ${selected.length}개</div>
    <p class="guide"><strong>재료 흐름:</strong> 원문은 식약처 원본 재료 문자열, 파싱명은 수량/괄호/전처리어를 제거한 추출명, 대표 재료는 현재 ingredients/ingredient_synonyms DB로 매핑된 표준명입니다. 소스, 드레싱, 육수, 고명처럼 레시피 안에서 따로 만드는 구성은 <strong>섹션</strong>에 적고, 한 원문에 재료가 2개 이상 섞이면 <strong>누락 재료 추가</strong>로 행을 나눠 주세요. 레시피 안에서 만든 소스/드레싱을 뒤 단계에서 다시 쓰는 행은 <strong>완성 구성품 참조</strong>를 선택하면 대표 재료 DB와 장보기 재료에 넣지 않는 검토값으로 내보냅니다.</p>
    <div class="toolbar">
      <button type="button" data-filter="pilot" class="active">pilot만</button>
      <button type="button" data-filter="all">전체</button>
      <button type="button" data-filter="unresolved">미해결 재료</button>
      <button type="button" data-filter="step-missing">단계 미언급</button>
      <button type="button" data-filter="reviewed">확인 완료</button>
      <button type="button" data-filter="unreviewed">미확인 재료</button>
      <button type="button" data-filter="blocked">blocked</button>
      <button type="button" data-filter="changed">수정한 항목</button>
      <input type="search" id="search" placeholder="레시피명, 재료명, 메모 검색">
      <button type="button" id="export-json">결정 JSON 내보내기</button>
      <button type="button" id="export-tsv">결정 TSV 내보내기</button>
      <button type="button" id="reset-decisions">저장값 초기화</button>
      <span class="summary" id="visible-summary"></span>
    </div>
  </header>
  <datalist id="ingredient-options">${ingredientOptions}</datalist>
  <main>${cards}</main>
  <script>
    const storageKey = "homecook:recipe-review-decisions:" + location.pathname;
    const cards = [...document.querySelectorAll("[data-card]")];
    const search = document.querySelector("#search");
    const summary = document.querySelector("#visible-summary");
    const existingIngredientNames = new Set(${JSON.stringify(standardNames)});
    let activeFilter = "pilot";

    function collectDecisions() {
      return cards.map((card) => ({
        candidate_id: card.dataset.candidateId,
        source_recipe_id: card.dataset.sourceId,
        is_pilot: card.dataset.pilot === "true",
        pilot_order: card.dataset.pilotOrder ? Number(card.dataset.pilotOrder) : null,
        blocked: card.dataset.blocked === "true",
        original_title: card.dataset.title,
        title: card.querySelector("[data-recipe-title]").value.trim(),
        recipe_decision: card.querySelector("[data-recipe-decision]").value,
        cooking_method_label: card.querySelector("[data-method-label]").value.trim(),
        recipe_note: card.querySelector("[data-recipe-note]").value.trim(),
        ingredients: [...card.querySelectorAll("[data-ingredient-row]")].map((row) => ({
          index: row.dataset.index,
          row_kind: row.dataset.rowKind ?? "source",
          reviewed: row.querySelector("[data-ingredient-reviewed]").checked,
          mentioned_in_steps_initially: row.dataset.stepMentioned === "true",
          original_text: row.querySelector(".source-cell strong").textContent.trim(),
          component_label: row.querySelector("[data-ingredient-component-label]").value.trim(),
          parsed_name: row.querySelector("[data-ingredient-parsed]").value.trim(),
          target_name: row.querySelector("[data-ingredient-target]").value.trim(),
          amount_text: row.querySelector("[data-ingredient-amount]").value.trim(),
          decision: row.querySelector("[data-ingredient-decision]").value,
          note: row.querySelector("[data-ingredient-note]").value.trim(),
          initially_resolved: row.dataset.resolved === "true",
        })),
        steps: [...card.querySelectorAll("[data-step-row]")].map((row) => ({
          step_number: Number(row.dataset.stepNumber),
          component_label: row.querySelector("[data-step-component-label]").value.trim(),
          instruction: row.querySelector("[data-step-instruction]").value.trim(),
        })),
      }));
    }

    function decisionMap() {
      return new Map(collectDecisions().map((decision) => [decision.candidate_id, decision]));
    }

    function save() {
      localStorage.setItem(storageKey, JSON.stringify(collectDecisions()));
      applyFilter();
    }

    function applySaved() {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;

      const saved = new Map(JSON.parse(raw).map((decision) => [decision.candidate_id, decision]));
      for (const card of cards) {
        const decision = saved.get(card.dataset.candidateId);
        if (!decision) continue;

        card.querySelector("[data-recipe-title]").value = decision.title ?? "";
        card.querySelector("[data-recipe-decision]").value = decision.recipe_decision ?? "hold";
        card.querySelector("[data-method-label]").value = decision.cooking_method_label ?? "";
        card.querySelector("[data-recipe-note]").value = decision.recipe_note ?? "";

        const rows = [...card.querySelectorAll("[data-ingredient-row]")];
        for (const rowDecision of decision.ingredients ?? []) {
          let row = rows.find((item) => String(item.dataset.index) === String(rowDecision.index));
          if (!row && rowDecision.row_kind === "manual_add") {
            const sourceRow = rows[0];
            if (!sourceRow) continue;
            row = appendManualIngredientRow(sourceRow, rowDecision);
          }
          if (!row) continue;

          row.querySelector("[data-ingredient-reviewed]").checked = Boolean(rowDecision.reviewed);
          row.querySelector("[data-ingredient-component-label]").value = rowDecision.component_label ?? row.dataset.componentLabel ?? "";
          row.querySelector("[data-ingredient-parsed]").value = rowDecision.parsed_name ?? "";
          row.querySelector("[data-ingredient-target]").value = rowDecision.target_name ?? "";
          row.querySelector("[data-ingredient-amount]").value = rowDecision.amount_text ?? "";
          row.querySelector("[data-ingredient-decision]").value = rowDecision.decision ?? "hold";
          row.querySelector("[data-ingredient-note]").value = rowDecision.note ?? "";
          updateTargetStatus(row);
        }

        const stepRows = [...card.querySelectorAll("[data-step-row]")];
        for (const stepDecision of decision.steps ?? []) {
          const row = stepRows.find((item) => Number(item.dataset.stepNumber) === Number(stepDecision.step_number));
          if (!row) continue;

          row.querySelector("[data-step-component-label]").value = stepDecision.component_label ?? row.dataset.componentLabel ?? "";
          row.querySelector("[data-step-instruction]").value = stepDecision.instruction ?? row.dataset.instruction ?? "";
        }
      }
    }

    function nextManualIndex(card, sourceIndex) {
      const prefix = sourceIndex + ".";
      const taken = [...card.querySelectorAll("[data-ingredient-row]")]
        .map((row) => row.dataset.index)
        .filter((index) => index && index.startsWith(prefix))
        .map((index) => Number(index.slice(prefix.length)))
        .filter(Number.isFinite);
      const next = taken.length > 0 ? Math.max(...taken) + 1 : 1;

      return prefix + next;
    }

    function appendManualIngredientRow(sourceRow, rowDecision = {}) {
      const card = sourceRow.closest("[data-card]");
      const sourceText = rowDecision.original_text ?? sourceRow.querySelector(".source-cell strong").textContent.trim();
      const index = rowDecision.index ?? nextManualIndex(card, sourceRow.dataset.index);
      const row = document.createElement("tr");
      row.dataset.ingredientRow = "";
      row.dataset.index = String(index);
      row.dataset.rowKind = "manual_add";
      row.dataset.resolved = "false";
      row.dataset.stepMentioned = rowDecision.mentioned_in_steps_initially === true ? "true" : "false";
      row.innerHTML = [
        '<td class="review-cell"><span class="cell-label">확인</span><label class="review-check"><input type="checkbox" data-ingredient-reviewed aria-label="추가 재료 확인"></label></td>',
        '<td class="source-cell"><span class="cell-label">원문</span><strong></strong></td>',
        '<td><span class="cell-label">섹션</span><input data-ingredient-component-label placeholder="예: 소스" aria-label="재료 섹션"></td>',
        '<td><span class="cell-label">파싱명</span><input data-ingredient-parsed aria-label="파싱명"></td>',
        '<td class="bad"><span class="cell-label">대표 재료</span><input data-ingredient-target list="ingredient-options" placeholder="예: 시금치" aria-label="대표 재료"><small data-target-status>새 행</small></td>',
        '<td><span class="cell-label">분량</span><input data-ingredient-amount aria-label="분량"></td>',
        '<td><span class="cell-label">결정</span><select data-ingredient-decision aria-label="재료 결정"><option value="keep">유지</option><option value="map_to_existing">기존 대표재료로 매핑</option><option value="add_ingredient" selected>새 대표재료 추가</option><option value="add_synonym">동의어 추가</option><option value="component_reference">완성 구성품 참조</option><option value="exclude">레시피 재료행 제외</option><option value="hold">보류</option></select></td>',
        '<td><span class="cell-label">메모</span><textarea data-ingredient-note placeholder="수정 이유"></textarea></td>',
        '<td class="row-actions"><span class="cell-label">행</span><button type="button" data-remove-ingredient>추가 행 삭제</button></td>',
      ].join("");
      row.querySelector("[data-ingredient-reviewed]").checked = Boolean(rowDecision.reviewed);
      row.querySelector(".source-cell strong").textContent = sourceText;
      row.querySelector("[data-ingredient-component-label]").value =
        rowDecision.component_label ?? sourceRow.querySelector("[data-ingredient-component-label]").value;
      row.querySelector("[data-ingredient-parsed]").value = rowDecision.parsed_name ?? "";
      row.querySelector("[data-ingredient-target]").value = rowDecision.target_name ?? "";
      row.querySelector("[data-ingredient-amount]").value = rowDecision.amount_text ?? "";
      row.querySelector("[data-ingredient-decision]").value = rowDecision.decision ?? "add_ingredient";
      row.querySelector("[data-ingredient-note]").value = rowDecision.note ?? "";
      sourceRow.after(row);
      updateTargetStatus(row);

      return row;
    }

    function updateTargetStatus(row) {
      const targetInput = row.querySelector("[data-ingredient-target]");
      const status = row.querySelector("[data-target-status]");
      if (!targetInput || !status) return;

      const target = targetInput.value.trim();
      status.classList.remove("exists", "new-target");
      if (!target) {
        status.textContent = "대표 재료 입력 필요";
        return;
      }

      if (existingIngredientNames.has(target)) {
        status.textContent = "DB에 있는 대표재료";
        status.classList.add("exists");
        return;
      }

      status.textContent = "새 대표재료 후보";
      status.classList.add("new-target");
    }

    function isChanged(card) {
      if (card.querySelector("[data-recipe-note]").value.trim()) return true;
      if (card.querySelector("[data-recipe-title]").value.trim() !== card.dataset.title) return true;
      if (card.querySelector("[data-recipe-decision]").value === "fix_needed") return true;
      if (
        [...card.querySelectorAll("[data-step-row]")].some(
          (row) =>
            row.querySelector("[data-step-component-label]").value.trim() !== row.dataset.componentLabel ||
            row.querySelector("[data-step-instruction]").value.trim() !== row.dataset.instruction,
        )
      ) {
        return true;
      }

      return [...card.querySelectorAll("[data-ingredient-row]")].some((row) => {
        const hasNote = row.querySelector("[data-ingredient-note]").value.trim();
        const hasComponentLabel = row.querySelector("[data-ingredient-component-label]").value.trim() !== row.dataset.componentLabel;
        const decision = row.querySelector("[data-ingredient-decision]").value;
        const target = row.querySelector("[data-ingredient-target]").value.trim();
        const initiallyResolved = row.dataset.resolved === "true";

        return row.dataset.rowKind === "manual_add" || hasNote || hasComponentLabel || decision !== (initiallyResolved ? "keep" : "map_to_existing") || (!initiallyResolved && target);
      });
    }

    function cardMatchesSearch(card) {
      const query = search.value.trim().toLocaleLowerCase("ko-KR");
      if (!query) return true;

      return card.textContent.toLocaleLowerCase("ko-KR").includes(query);
    }

    function applyFilter() {
      let visibleCount = 0;
      for (const card of cards) {
        const hasUnresolved = card.querySelector("[data-ingredient-row][data-resolved='false']");
        const hasStepMissing = card.querySelector("[data-ingredient-row][data-step-mentioned='false']");
        const ingredientRows = [...card.querySelectorAll("[data-ingredient-row]")];
        const hasUnreviewed = ingredientRows.some((row) => !row.querySelector("[data-ingredient-reviewed]").checked);
        const allReviewed = ingredientRows.length > 0 && !hasUnreviewed;
        const matchesFilter =
          activeFilter === "all" ||
          (activeFilter === "pilot" && card.dataset.pilot === "true") ||
          (activeFilter === "blocked" && card.dataset.blocked === "true") ||
          (activeFilter === "unresolved" && hasUnresolved) ||
          (activeFilter === "step-missing" && hasStepMissing) ||
          (activeFilter === "reviewed" && allReviewed) ||
          (activeFilter === "unreviewed" && hasUnreviewed) ||
          (activeFilter === "changed" && isChanged(card));
        const visible = matchesFilter && cardMatchesSearch(card);

        card.hidden = !visible;
        if (visible) visibleCount += 1;
      }

      summary.textContent = visibleCount + " / " + cards.length + " 표시";
    }

    function download(name, type, content) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    function exportTsv() {
      const rows = [["candidate_id", "source_recipe_id", "pilot_order", "recipe_decision", "title", "ingredient_index", "ingredient_reviewed", "mentioned_in_steps_initially", "component_label", "original_text", "parsed_name", "target_name", "amount_text", "ingredient_decision", "note"]];
      for (const decision of collectDecisions()) {
        for (const ingredient of decision.ingredients) {
          rows.push([
            decision.candidate_id,
            decision.source_recipe_id,
            decision.pilot_order ?? "",
            decision.recipe_decision,
            decision.title,
            String(ingredient.index),
            ingredient.reviewed ? "true" : "false",
            ingredient.mentioned_in_steps_initially ? "true" : "false",
            ingredient.component_label,
            ingredient.original_text,
            ingredient.parsed_name,
            ingredient.target_name,
            ingredient.amount_text,
            ingredient.decision,
            ingredient.note || decision.recipe_note,
          ]);
        }
      }

      download("recipe-review-decisions.tsv", "text/tab-separated-values", rows.map((row) => row.map((cell) => String(cell).replace(/\\t/g, " ").replace(/\\r?\\n/g, " ")).join("\\t")).join("\\n") + "\\n");
    }

    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
        applyFilter();
      });
    });
    document.addEventListener("input", (event) => {
      if (event.target.matches("[data-ingredient-target]")) {
        updateTargetStatus(event.target.closest("[data-ingredient-row]"));
      }
      if (event.target.matches("input, textarea, select")) save();
    });
    document.addEventListener("change", (event) => {
      if (event.target.matches("select, input[type='checkbox']")) save();
    });
    document.addEventListener("click", (event) => {
      const addButton = event.target.closest("[data-add-derived-ingredient]");
      if (addButton) {
        const row = appendManualIngredientRow(addButton.closest("[data-ingredient-row]"));
        row.querySelector("[data-ingredient-parsed]").focus();
        save();
        return;
      }

      const removeButton = event.target.closest("[data-remove-ingredient]");
      if (removeButton) {
        removeButton.closest("[data-ingredient-row]").remove();
        save();
      }
    });
    search.addEventListener("input", applyFilter);
    document.querySelector("#export-json").addEventListener("click", () => {
      download("recipe-review-decisions.json", "application/json", JSON.stringify({ exported_at: new Date().toISOString(), decisions: collectDecisions() }, null, 2) + "\\n");
    });
    document.querySelector("#export-tsv").addEventListener("click", exportTsv);
    document.querySelector("#reset-decisions").addEventListener("click", () => {
      localStorage.removeItem(storageKey);
      location.reload();
    });

    document.querySelectorAll("[data-ingredient-row]").forEach(updateTargetStatus);
    applySaved();
    applyFilter();
  </script>
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
  await writeText(path.join(outputDir, "recipe-review.html"), renderReviewHtml({ candidates, selected, generatedAt, dictionary }));
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
