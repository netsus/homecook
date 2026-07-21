#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runLocalPsqlJson } from "./lib/ingredient-nutrition-local-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "outputs/nutrition-review-20260721/homecook-nutrition-review.html",
);

const BLOCKER_CODES = new Set([
  "NUTRITION_PROFILE_MISSING",
  "UNIT_CONVERSION_MISSING",
  "PIECE_WEIGHT_REQUIRED",
]);
const CORE_NUTRIENT_CODES = new Set([
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
]);
const NUTRIENTS = Object.freeze([
  { code: "energy_kcal", label: "열량", unit: "kcal" },
  { code: "carbohydrate_g", label: "탄수화물", unit: "g" },
  { code: "protein_g", label: "단백질", unit: "g" },
  { code: "fat_g", label: "지방", unit: "g" },
  { code: "saturated_fat_g", label: "포화지방", unit: "g" },
  { code: "sugars_g", label: "당류", unit: "g" },
  { code: "fiber_g", label: "식이섬유", unit: "g" },
  { code: "sodium_mg", label: "나트륨", unit: "mg" },
]);

const REVIEW_SQL = `
with current_reasons as (
  select
    split_part(reason.value, ':', 1) as issue_code,
    substring(reason.value from '^[^:]+:([0-9a-f-]{36})')::uuid as recipe_ingredient_id,
    case
      when split_part(reason.value, ':', 1) = 'NUTRIENT_VALUE_MISSING'
      then split_part(reason.value, ':', 3)
      else null
    end as missing_nutrient
  from public.recipe_nutrition_snapshots snapshot
  cross join lateral unnest(snapshot.missing_reasons) reason(value)
  where snapshot.is_current
), affected as (
  select
    ingredient.id as ingredient_id,
    ingredient.standard_name as ingredient_name,
    array_agg(distinct current_reasons.issue_code order by current_reasons.issue_code) as issue_codes,
    array_remove(
      array_agg(distinct current_reasons.missing_nutrient order by current_reasons.missing_nutrient),
      null
    ) as missing_nutrients
  from current_reasons
  join public.recipe_ingredients recipe_ingredient
    on recipe_ingredient.id = current_reasons.recipe_ingredient_id
  join public.ingredients ingredient
    on ingredient.id = recipe_ingredient.ingredient_id
  where current_reasons.issue_code <> 'TO_TASTE_EXCLUDED'
  group by ingredient.id, ingredient.standard_name
), named as (
  select
    affected.*,
    array(
      select name
      from (
        select affected.ingredient_name as name
        union
        select synonym.synonym
        from public.ingredient_synonyms synonym
        where synonym.ingredient_id = affected.ingredient_id
      ) names
      order by name
    ) as normalized_names
  from affected
), selected as (
  select
    named.*,
    chosen_profile.profile_id,
    chosen_profile.basis_amount,
    chosen_profile.basis_unit,
    chosen_profile.preparation_state,
    chosen_profile.current_source_provider,
    chosen_profile.current_source_dataset,
    chosen_profile.current_source_version,
    chosen_profile.current_external_name
  from named
  left join lateral (
    select
      profile.id as profile_id,
      profile.basis_amount,
      profile.basis_unit,
      link.preparation_state,
      source.provider_code as current_source_provider,
      source.dataset_name as current_source_dataset,
      source.source_version as current_source_version,
      source_item.external_name as current_external_name
    from public.ingredient_nutrition_profiles link
    join public.nutrition_profiles profile
      on profile.id = link.nutrition_profile_id
    left join public.nutrition_source_items source_item
      on source_item.id = profile.source_item_id
    left join public.nutrition_sources source
      on source.id = source_item.source_id
    where link.ingredient_id = named.ingredient_id
      and link.is_active
      and link.is_primary
      and link.review_status = 'approved'
      and profile.is_active
      and profile.review_status = 'approved'
    order by
      (link.preparation_state = 'as_published') desc,
      link.version desc,
      link.id
    limit 1
  ) chosen_profile on true
), review_rows as (
  select
    selected.ingredient_id,
    selected.ingredient_name,
    selected.basis_amount,
    selected.basis_unit,
    selected.preparation_state,
    selected.normalized_names,
    selected.current_source_provider,
    selected.current_source_dataset,
    selected.current_source_version,
    selected.current_external_name,
    selected.issue_codes,
    selected.missing_nutrients,
    coalesce(nutrients.values_json, '{}'::jsonb) as nutrients
  from selected
  left join lateral (
    select jsonb_object_agg(value.nutrient_code, value.amount) as values_json
    from public.nutrition_values value
    where value.profile_id = selected.profile_id
      and value.value_status = 'observed'
      and value.nutrient_code = any(array[
        'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g',
        'saturated_fat_g', 'sugars_g', 'fiber_g', 'sodium_mg'
      ])
  ) nutrients on true
)
select jsonb_build_object(
  'generated_at', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'rows', coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ingredient_id', ingredient_id,
        'ingredient_name', ingredient_name,
        'basis_amount', basis_amount,
        'basis_unit', basis_unit,
        'preparation_state', preparation_state,
        'normalized_names', normalized_names,
        'current_source_provider', current_source_provider,
        'current_source_dataset', current_source_dataset,
        'current_source_version', current_source_version,
        'current_external_name', current_external_name,
        'issue_codes', issue_codes,
        'missing_nutrients', missing_nutrients,
        'nutrients', nutrients
      )
      order by ingredient_name
    ),
    '[]'::jsonb
  )
)
from review_rows;
`;

export function classifyNutritionReviewPriority(row) {
  const issueCodes = Array.isArray(row?.issue_codes) ? row.issue_codes : [];
  if (issueCodes.some((code) => BLOCKER_CODES.has(code))) return "P0";
  const missingNutrients = Array.isArray(row?.missing_nutrients) ? row.missing_nutrients : [];
  if (missingNutrients.some((code) => CORE_NUTRIENT_CODES.has(code))) return "P1";
  return "P2";
}

export function formatNutritionBasisLabel(amount, unit) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || typeof unit !== "string" || unit.trim() === "") return "";
  return `${new Intl.NumberFormat("en-US", {
    useGrouping: false,
    maximumFractionDigits: 6,
  }).format(numericAmount)}${unit.trim()}`;
}

export function buildNutritionGapInventory({ generatedAt, rows }) {
  const targetRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const issueCodes = Array.isArray(row?.issue_codes) ? row.issue_codes : [];
      return issueCodes.includes("NUTRITION_PROFILE_MISSING") ||
        issueCodes.includes("NUTRIENT_VALUE_MISSING");
    })
    .map((row) => ({
      ingredient_id: String(row.ingredient_id),
      ingredient_name: String(row.ingredient_name),
      basis_amount: row.basis_amount === null || row.basis_amount === undefined
        ? null
        : Number(row.basis_amount),
      basis_unit: typeof row.basis_unit === "string" ? row.basis_unit : null,
      preparation_state: typeof row.preparation_state === "string"
        ? row.preparation_state
        : null,
      normalized_names: [...new Set(
        Array.isArray(row.normalized_names) ? row.normalized_names.map(String) : [String(row.ingredient_name)],
      )].sort((left, right) => left.localeCompare(right, "ko")),
      current_source_provider: typeof row.current_source_provider === "string"
        ? row.current_source_provider
        : null,
      current_source_dataset: typeof row.current_source_dataset === "string"
        ? row.current_source_dataset
        : null,
      current_source_version: typeof row.current_source_version === "string"
        ? row.current_source_version
        : null,
      current_external_name: typeof row.current_external_name === "string"
        ? row.current_external_name
        : null,
      issue_codes: [...new Set(Array.isArray(row.issue_codes) ? row.issue_codes : [])].sort(),
      missing_nutrients: [...new Set(
        Array.isArray(row.missing_nutrients) ? row.missing_nutrients : [],
      )].sort(),
      nutrients: Object.fromEntries(
        NUTRIENTS
          .filter(({ code }) =>
            row.nutrients?.[code] !== null && row.nutrients?.[code] !== undefined
          )
          .map(({ code }) => [code, Number(row.nutrients[code])]),
      ),
    }))
    .sort((left, right) => left.ingredient_id.localeCompare(right.ingredient_id));
  const checksumPayload = {
    schema_version: "nutrition-gap-inventory-v1",
    rows: targetRows,
  };
  const missingProfileCount = targetRows.filter((row) =>
    row.issue_codes.includes("NUTRITION_PROFILE_MISSING")
  ).length;
  const inventoryChecksum = createHash("sha256")
    .update(JSON.stringify(checksumPayload))
    .digest("hex");

  return {
    ...checksumPayload,
    generated_at: generatedAt,
    target_count: targetRows.length,
    partial_nutrient_count: targetRows.length - missingProfileCount,
    missing_profile_count: missingProfileCount,
    production_db_writes: 0,
    inventory_checksum: inventoryChecksum,
  };
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderNutritionReviewHtml({ generatedAt, rows }) {
  const collator = new Intl.Collator("ko");
  const preparedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ ...row, priority: classifyNutritionReviewPriority(row) }))
    .sort((left, right) =>
      left.priority.localeCompare(right.priority) ||
      collator.compare(String(left.ingredient_name), String(right.ingredient_name))
    );
  const counts = Object.fromEntries(
    ["P0", "P1", "P2"].map((priority) => [
      priority,
      preparedRows.filter((row) => row.priority === priority).length,
    ]),
  );
  const generatedLabel = Number.isFinite(Date.parse(generatedAt))
    ? new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Seoul",
    }).format(new Date(generatedAt))
    : generatedAt;
  const nutrientHeaders = NUTRIENTS.map((nutrient) =>
    `<th scope="col"><span>${nutrient.label}</span><small>${nutrient.unit}</small></th>`
  ).join("");
  const clientData = safeJson({
    generatedAt,
    nutrients: NUTRIENTS,
    rows: preparedRows,
  });

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>집밥 영양 검수 원장</title>
  <style>
    :root {
      --ink: #17201c;
      --muted: #68716b;
      --paper: #f4f1e8;
      --sheet: #fffdf7;
      --line: #d8d3c5;
      --line-strong: #aaa596;
      --green: #1e6a49;
      --green-soft: #e2f0e7;
      --red: #b53a2f;
      --red-soft: #f8e5df;
      --amber: #9b681d;
      --amber-soft: #f5ead3;
      --blue: #245c74;
      --blue-soft: #dfeef2;
      --shadow: 0 18px 50px rgba(34, 39, 34, .09);
    }
    * { box-sizing: border-box; }
    html { min-width: 1080px; background: var(--paper); }
    body {
      margin: 0;
      min-height: 100vh;
      overflow-y: auto;
      color: var(--ink);
      font-family: "Pretendard Variable", "SUIT Variable", "Noto Sans KR", sans-serif;
      background:
        linear-gradient(rgba(86, 80, 62, .045) 1px, transparent 1px),
        var(--paper);
      background-size: 100% 28px;
    }
    button, input { font: inherit; }
    button { color: inherit; }
    .masthead {
      padding: 44px 48px 36px;
      border-bottom: 1px solid var(--line-strong);
      background: rgba(244, 241, 232, .94);
    }
    .masthead-inner, main { width: min(1840px, calc(100% - 96px)); margin: 0 auto; }
    .eyebrow {
      margin: 0 0 12px;
      color: var(--red);
      font-size: 12px;
      font-weight: 850;
      letter-spacing: .17em;
      text-transform: uppercase;
    }
    .headline-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 36px; }
    h1 { margin: 0; font-size: clamp(40px, 4vw, 68px); line-height: .98; letter-spacing: -.055em; }
    .headline-meta { max-width: 570px; padding-bottom: 4px; text-align: right; }
    .headline-meta p { margin: 0; color: var(--muted); line-height: 1.65; }
    .headline-meta strong { color: var(--ink); font-size: 24px; }
    main { padding: 34px 0 80px; }
    .priority-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
    .priority-card {
      position: relative;
      min-height: 116px;
      padding: 20px 22px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: rgba(255, 253, 247, .72);
    }
    .priority-card::after {
      content: attr(data-priority);
      position: absolute;
      right: 10px;
      bottom: -20px;
      color: rgba(23, 32, 28, .045);
      font-size: 92px;
      font-weight: 900;
      letter-spacing: -.09em;
    }
    .priority-card b { display: block; font-size: 32px; letter-spacing: -.04em; }
    .priority-card span { display: block; margin-top: 7px; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .workspace { border: 1px solid var(--line-strong); background: var(--sheet); box-shadow: var(--shadow); }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line-strong);
      background: rgba(255, 253, 247, .96);
      backdrop-filter: blur(12px);
    }
    .tabs { display: flex; gap: 6px; }
    .tab {
      min-width: 122px;
      padding: 11px 14px;
      border: 1px solid transparent;
      background: transparent;
      cursor: pointer;
      font-weight: 800;
      transition: background .16s ease, border-color .16s ease, transform .16s ease;
    }
    .tab:hover { transform: translateY(-1px); border-color: var(--line); }
    .tab[aria-selected="true"] { border-color: var(--ink); background: var(--ink); color: white; }
    .tab-count { margin-left: 8px; opacity: .7; font-variant-numeric: tabular-nums; }
    .tools { display: flex; align-items: center; gap: 8px; }
    .search {
      width: 280px;
      padding: 11px 14px;
      border: 1px solid var(--line);
      border-radius: 0;
      background: white;
      outline: none;
    }
    .search:focus { border-color: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
    .export {
      padding: 11px 15px;
      border: 1px solid var(--green);
      background: var(--green-soft);
      color: var(--green);
      cursor: pointer;
      font-weight: 800;
    }
    .status-line {
      display: flex;
      justify-content: space-between;
      padding: 12px 18px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
    }
    .status-line strong { color: var(--ink); }
    .table-shell { width: 100%; overflow-x: auto; }
    table { width: 100%; min-width: 1510px; border-collapse: collapse; table-layout: fixed; }
    th, td { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    th:last-child, td:last-child { border-right: 0; }
    th {
      padding: 12px 8px;
      background: #eeeadd;
      color: #3c443f;
      font-size: 12px;
      font-weight: 850;
      text-align: center;
    }
    th span, th small { display: block; }
    th small { margin-top: 3px; color: #858b86; font-size: 10px; font-weight: 600; }
    th:first-child { width: 180px; text-align: left; padding-left: 16px; }
    th:nth-child(2) { width: 74px; }
    th:last-child { width: 310px; }
    td { height: 66px; padding: 10px 8px; text-align: right; font-size: 13px; font-variant-numeric: tabular-nums; }
    tbody tr { background: var(--sheet); transition: background .12s ease; }
    tbody tr:hover { background: #f8f4e8; }
    td.name { padding-left: 16px; text-align: left; font-size: 15px; font-weight: 800; letter-spacing: -.02em; }
    td.basis { color: var(--muted); text-align: center; }
    td.blank { background: repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(181, 58, 47, .035) 5px, rgba(181, 58, 47, .035) 9px); }
    td.review-cell { padding: 8px 10px; text-align: left; }
    .review-controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
    .review-choice {
      min-height: 38px;
      padding: 7px 5px;
      border: 1px solid var(--line);
      background: white;
      cursor: pointer;
      font-size: 12px;
      font-weight: 750;
    }
    .review-choice:hover { border-color: var(--ink); }
    .review-choice[data-choice="approved"][aria-pressed="true"] { border-color: var(--green); background: var(--green-soft); color: var(--green); }
    .review-choice[data-choice="fix"][aria-pressed="true"] { border-color: var(--red); background: var(--red-soft); color: var(--red); }
    .review-choice[data-choice="hold"][aria-pressed="true"] { border-color: var(--amber); background: var(--amber-soft); color: var(--amber); }
    .empty { padding: 70px 20px; color: var(--muted); text-align: center; }
    .footnote { margin: 14px 2px 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
    @media (prefers-reduced-motion: no-preference) {
      .workspace { animation: rise .42s ease-out both; }
      @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
    }
  </style>
</head>
<body>
  <header class="masthead">
    <div class="masthead-inner">
      <p class="eyebrow">Homecook · Nutrition Ledger</p>
      <div class="headline-row">
        <div>
          <h1>영양 검수 원장</h1>
        </div>
        <div class="headline-meta">
          <p>검수 대상 <strong>${preparedRows.length}</strong>개</p>
          <p>로컬 DB 갱신: ${escapeHtml(generatedLabel)}</p>
        </div>
      </div>
    </div>
  </header>

  <main>
    <section class="priority-board" aria-label="검수 순서">
      <article class="priority-card" data-priority="P0"><b>${counts.P0}개</b><span>레시피 계산 연결을 막고 있어 가장 먼저 확인합니다.</span></article>
      <article class="priority-card" data-priority="P1"><b>${counts.P1}개</b><span>열량·탄수화물·단백질·지방·나트륨 값을 확인합니다.</span></article>
      <article class="priority-card" data-priority="P2"><b>${counts.P2}개</b><span>포화지방·당류·식이섬유 값을 이어서 확인합니다.</span></article>
    </section>

    <section class="workspace" aria-label="재료 영양 검수표">
      <div class="toolbar">
        <nav class="tabs" aria-label="우선순위 탭">
          <button class="tab" type="button" role="tab" data-priority="P0" data-count="${counts.P0}" aria-selected="true">P0 <span class="tab-count">${counts.P0}</span></button>
          <button class="tab" type="button" role="tab" data-priority="P1" data-count="${counts.P1}" aria-selected="false">P1 <span class="tab-count">${counts.P1}</span></button>
          <button class="tab" type="button" role="tab" data-priority="P2" data-count="${counts.P2}" aria-selected="false">P2 <span class="tab-count">${counts.P2}</span></button>
        </nav>
        <div class="tools">
          <label><span class="sr-only"></span><input class="search" id="search" type="search" placeholder="재료명 검색" autocomplete="off"></label>
          <button class="export" id="export" type="button">검수 결과 저장</button>
        </div>
      </div>
      <div class="status-line"><span id="tab-description">P0 · 계산 연결 우선 확인</span><span><strong id="visible-count">0</strong>개 표시 · <strong id="reviewed-count">0</strong>개 완료</span></div>
      <div class="table-shell">
        <table>
          <thead>
            <tr>
              <th scope="col">재료명</th>
              <th scope="col">기준</th>
              ${nutrientHeaders}
              <th scope="col">검수결과</th>
            </tr>
          </thead>
          <tbody id="review-body"></tbody>
        </table>
        <div class="empty" id="empty" hidden>조건에 맞는 재료가 없습니다.</div>
      </div>
    </section>
    <p class="footnote">값이 없는 칸은 비워 두었습니다. 선택한 결과는 이 브라우저에 자동 저장되며, ‘검수 결과 저장’으로 JSON 파일을 내려받을 수 있습니다.</p>
  </main>

  <script type="application/json" id="review-data">${clientData}</script>
  <script>
    (function () {
      "use strict";
      var STORAGE_KEY = "homecook-nutrition-review-v3";
      var data = JSON.parse(document.getElementById("review-data").textContent);
      var state = { priority: "P0", query: "", reviews: loadReviews() };
      var body = document.getElementById("review-body");
      var empty = document.getElementById("empty");
      var visibleCount = document.getElementById("visible-count");
      var reviewedCount = document.getElementById("reviewed-count");
      var description = document.getElementById("tab-description");
      var descriptions = {
        P0: "P0 · 계산 연결 우선 확인",
        P1: "P1 · 핵심값 우선 확인",
        P2: "P2 · 보조값 확인"
      };

      function loadReviews() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
        catch (error) { return {}; }
      }

      function saveReviews() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.reviews));
      }

      function formatNumber(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return "";
        return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(number);
      }

      function reviewButton(row, choice, label) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "review-choice";
        button.dataset.choice = choice;
        button.textContent = label;
        button.setAttribute("aria-pressed", state.reviews[row.ingredient_id] === choice ? "true" : "false");
        button.addEventListener("click", function () {
          if (state.reviews[row.ingredient_id] === choice) delete state.reviews[row.ingredient_id];
          else state.reviews[row.ingredient_id] = choice;
          saveReviews();
          render();
        });
        return button;
      }

      function renderRow(row) {
        var tr = document.createElement("tr");
        var name = document.createElement("td");
        name.className = "name";
        name.textContent = row.ingredient_name;
        tr.appendChild(name);
        var basis = document.createElement("td");
        basis.className = "basis" + (row.basis_label ? "" : " blank");
        basis.textContent = row.basis_label || "";
        tr.appendChild(basis);
        data.nutrients.forEach(function (nutrient) {
          var td = document.createElement("td");
          var value = row.nutrients ? row.nutrients[nutrient.code] : null;
          var formatted = formatNumber(value);
          if (formatted === "") td.className = "blank";
          td.textContent = formatted;
          tr.appendChild(td);
        });
        var reviewCell = document.createElement("td");
        reviewCell.className = "review-cell";
        var controls = document.createElement("div");
        controls.className = "review-controls";
        controls.appendChild(reviewButton(row, "approved", "승인"));
        controls.appendChild(reviewButton(row, "fix", "수정 필요"));
        controls.appendChild(reviewButton(row, "hold", "보류"));
        reviewCell.appendChild(controls);
        tr.appendChild(reviewCell);
        return tr;
      }

      function render() {
        var query = state.query.trim().toLocaleLowerCase("ko");
        var rows = data.rows.filter(function (row) {
          return row.priority === state.priority && (!query || row.ingredient_name.toLocaleLowerCase("ko").includes(query));
        });
        body.replaceChildren.apply(body, rows.map(renderRow));
        empty.hidden = rows.length !== 0;
        visibleCount.textContent = String(rows.length);
        reviewedCount.textContent = String(rows.filter(function (row) { return Boolean(state.reviews[row.ingredient_id]); }).length);
        description.textContent = descriptions[state.priority];
        document.querySelectorAll(".tab").forEach(function (tab) {
          tab.setAttribute("aria-selected", tab.dataset.priority === state.priority ? "true" : "false");
        });
      }

      document.querySelectorAll(".tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          state.priority = tab.dataset.priority;
          render();
        });
      });
      document.getElementById("search").addEventListener("input", function (event) {
        state.query = event.target.value;
        render();
      });
      document.getElementById("export").addEventListener("click", function () {
        var payload = JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), reviews: state.reviews }, null, 2);
        var url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
        var anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "homecook-nutrition-review-progress.json";
        anchor.click();
        URL.revokeObjectURL(url);
      });
      render();
    }());
  </script>
</body>
</html>`;
}

export function loadLocalNutritionReviewData() {
  const result = runLocalPsqlJson(REVIEW_SQL, process.env, undefined, { timeoutMs: 60_000 });
  return {
    ...result,
    rows: result.rows.map((row) => ({
      ...row,
      basis_label: formatNutritionBasisLabel(row.basis_amount, row.basis_unit),
    })),
  };
}

function main() {
  const outputIndex = process.argv.indexOf("--output");
  const inventoryOutputIndex = process.argv.indexOf("--inventory-output");
  const outputPath = outputIndex === -1
    ? DEFAULT_OUTPUT
    : path.resolve(process.argv[outputIndex + 1] ?? "");
  const inventoryOutputPath = inventoryOutputIndex === -1
    ? null
    : path.resolve(process.argv[inventoryOutputIndex + 1] ?? "");
  if (!outputPath.endsWith(".html")) throw new Error("INVALID_NUTRITION_REVIEW_OUTPUT");
  if (inventoryOutputPath && !inventoryOutputPath.endsWith(".json")) {
    throw new Error("INVALID_NUTRITION_INVENTORY_OUTPUT");
  }
  const result = loadLocalNutritionReviewData();
  const html = renderNutritionReviewHtml({
    generatedAt: result.generated_at,
    rows: result.rows,
  });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, "utf8");
  const inventory = buildNutritionGapInventory({
    generatedAt: result.generated_at,
    rows: result.rows,
  });
  if (inventoryOutputPath) {
    mkdirSync(path.dirname(inventoryOutputPath), { recursive: true });
    writeFileSync(inventoryOutputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  }
  const counts = Object.fromEntries(["P0", "P1", "P2"].map((priority) => [
    priority,
    result.rows.filter((row) => classifyNutritionReviewPriority(row) === priority).length,
  ]));
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    inventory_output: inventoryOutputPath,
    total: result.rows.length,
    counts,
    nutrition_gap_targets: inventory.target_count,
    inventory_checksum: inventory.inventory_checksum,
  })}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
