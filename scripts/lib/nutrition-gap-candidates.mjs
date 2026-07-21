import { createHash } from "node:crypto";

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
const CORE_CODES = Object.freeze([
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
]);
const CLASSIFICATIONS = Object.freeze([
  "approved_replacement",
  "needs_review",
  "keep_current",
  "no_compatible_source",
]);

function normalizeName(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ko-KR")
    .replaceAll(/[^0-9a-z가-힣]/g, "");
}

function numericAmount(value) {
  const amount = value?.amount ?? value;
  if (amount === null || amount === undefined || amount === "") return null;
  const number = Number(amount);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizedValues(values) {
  return Object.fromEntries(NUTRIENTS.map(({ code }) => [code, numericAmount(values?.[code])]));
}

function requiredPreparationMarkers(ingredientName) {
  const name = normalizeName(ingredientName);
  if (name.startsWith("다진")) return ["다진"];
  if (name.startsWith("건") && name.length > 1) return ["말린", "건조"];
  if (name.endsWith("가루")) return ["가루", "분말"];
  return [];
}

function candidateNameMatch(ingredient, candidate) {
  const sourceSemantics = normalizeName(
    `${candidate.source_state ?? ""} ${candidate.external_name ?? ""}`,
  );
  const requiredMarkers = requiredPreparationMarkers(ingredient.ingredient_name);
  if (requiredMarkers.length > 0 && !requiredMarkers.some((marker) =>
    sourceSemantics.includes(normalizeName(marker))
  )) return null;
  const aliases = new Set(
    [...(ingredient.normalized_names ?? []), ingredient.ingredient_name]
      .map(normalizeName)
      .filter(Boolean),
  );
  const externalName = normalizeName(candidate.external_name);
  if (aliases.has(externalName)) return { score: 110, method: "exact_external_name" };

  const components = new Set(
    [...(candidate.name_components ?? []), ...String(candidate.external_name ?? "").split(/[,_/]/)]
      .map(normalizeName)
      .filter(Boolean),
  );
  if ([...aliases].some((alias) => components.has(alias))) {
    return { score: 100, method: "exact_name_component" };
  }

  const sourceState = sourceSemantics;
  for (const alias of aliases) {
    const derived = [
      { prefix: "다진", marker: "다진" },
      { prefix: "건", marker: "말린" },
      { suffix: "가루", marker: "분말" },
    ];
    for (const rule of derived) {
      const base = rule.prefix && alias.startsWith(rule.prefix)
        ? alias.slice(rule.prefix.length)
        : rule.suffix && alias.endsWith(rule.suffix)
          ? alias.slice(0, -rule.suffix.length)
          : null;
      if (base && components.has(base) && sourceState.includes(rule.marker)) {
        return { score: 90, method: "exact_base_and_state" };
      }
    }
  }

  const scopes = new Set((candidate.match_scope_names ?? []).map(normalizeName).filter(Boolean));
  if ([...aliases].some((alias) => scopes.has(alias))) {
    return { score: 70, method: "provider_exact_filter_scope" };
  }
  return null;
}

function compatibleMassBasis(candidate) {
  return Number(candidate?.basis?.amount) === 100 && candidate?.basis?.unit === "g";
}

function evaluateCandidate(ingredient, candidate) {
  const nameMatch = candidateNameMatch(ingredient, candidate);
  if (nameMatch === null || !compatibleMassBasis(candidate)) return null;
  const currentValues = normalizedValues(ingredient.nutrients);
  const values = normalizedValues(candidate.values);
  const currentKnownCodes = NUTRIENTS
    .map(({ code }) => code)
    .filter((code) => currentValues[code] !== null);
  if (currentKnownCodes.some((code) => values[code] === null)) {
    return { compatible: true, improving: false, reason_code: "WOULD_DROP_CURRENT_VALUE" };
  }
  const profileMissing = (ingredient.issue_codes ?? []).includes("NUTRITION_PROFILE_MISSING");
  const improvementCodes = profileMissing
    ? CORE_CODES.filter((code) => values[code] !== null)
    : (ingredient.missing_nutrients ?? []).filter((code) => values[code] !== null);
  const improving = profileMissing
    ? CORE_CODES.every((code) => values[code] !== null)
    : improvementCodes.length > 0;
  return {
    compatible: true,
    improving,
    candidate: {
      provider_code: String(candidate.provider_code),
      provider_label: String(candidate.provider_label),
      provider_rank: Number(candidate.provider_rank),
      source_version: String(candidate.source_version),
      external_item_key: String(candidate.external_item_key),
      external_name: String(candidate.external_name),
      source_state: candidate.source_state === null || candidate.source_state === undefined
        ? null
        : String(candidate.source_state),
      basis: { amount: 100, unit: "g" },
      values,
      improvement_codes: improvementCodes,
      known_nutrient_count: Object.values(values).filter((value) => value !== null).length,
      match_method: nameMatch.method,
      match_score: nameMatch.score,
    },
  };
}

function candidateOrder(left, right) {
  return right.match_score - left.match_score ||
    left.provider_rank - right.provider_rank ||
    right.improvement_codes.length - left.improvement_codes.length ||
    right.known_nutrient_count - left.known_nutrient_count ||
    left.external_name.length - right.external_name.length ||
    left.external_item_key.localeCompare(right.external_item_key);
}

function providerMatchesCurrentSource(currentProvider, providerCode) {
  const provider = normalizeName(currentProvider);
  if (provider.includes("농촌진흥청") || provider.includes("식량과학원")) {
    return providerCode === "RDA_10_4";
  }
  if (provider.includes("식품의약품안전처") || provider.includes("식약처")) {
    return providerCode === "MFDS";
  }
  if (provider.includes("수산과학원")) return providerCode === "NIFS_KFIND";
  return false;
}

function sameKnownValues(currentValues, candidateValues) {
  return NUTRIENTS.every(({ code }) => {
    const current = currentValues[code];
    if (current === null) return true;
    const candidate = candidateValues[code];
    return candidate !== null && Math.abs(current - candidate) <= 1e-9;
  });
}

function autoApprovedCandidate(ingredient, improvingCandidates) {
  if ((ingredient.issue_codes ?? []).includes("NUTRITION_PROFILE_MISSING")) return null;
  if (!ingredient.current_external_name || ingredient.basis_unit !== "g" ||
      Number(ingredient.basis_amount) !== 100) return null;
  const currentValues = normalizedValues(ingredient.nutrients);
  const matches = improvingCandidates.filter((candidate) =>
    normalizeName(candidate.external_name) === normalizeName(ingredient.current_external_name) &&
    providerMatchesCurrentSource(ingredient.current_source_provider, candidate.provider_code) &&
    candidate.improvement_codes.length > 0 &&
    sameKnownValues(currentValues, candidate.values)
  );
  return matches.length === 1 ? matches[0] : null;
}

function basisLabel(amount, unit) {
  return Number.isFinite(Number(amount)) && typeof unit === "string"
    ? `${Number(amount)}${unit}`
    : "";
}

export function buildNutritionGapCandidateReport({ inventory, candidates, generatedAt }) {
  const sourceCandidates = Array.isArray(candidates) ? candidates : [];
  const rows = (Array.isArray(inventory?.rows) ? inventory.rows : [])
    .map((ingredient) => {
      const evaluations = sourceCandidates
        .map((candidate) => evaluateCandidate(ingredient, candidate))
        .filter(Boolean);
      const improving = evaluations
        .filter((evaluation) => evaluation.improving)
        .map((evaluation) => evaluation.candidate)
        .sort(candidateOrder);
      const compatible = evaluations
        .filter((evaluation) => evaluation.candidate)
        .map((evaluation) => evaluation.candidate)
        .sort(candidateOrder);
      const approvedCandidate = autoApprovedCandidate(ingredient, improving);
      const classification = approvedCandidate !== null
        ? "approved_replacement"
        : improving.length > 0
          ? "needs_review"
        : evaluations.length > 0
          ? "keep_current"
          : "no_compatible_source";
      const orderedCandidates = approvedCandidate === null
        ? (improving.length > 0 ? improving : compatible)
        : [approvedCandidate, ...improving.filter((candidate) =>
          candidate.external_item_key !== approvedCandidate.external_item_key
        )];
      const displayCandidates = orderedCandidates.slice(0, 3);
      const top = displayCandidates[0] ?? null;
      const tiedTopCount = top === null
        ? 0
        : (improving.length > 0 ? improving : compatible).filter((candidate) =>
          candidate.provider_rank === top.provider_rank &&
          candidate.match_score === top.match_score &&
          candidate.known_nutrient_count === top.known_nutrient_count
        ).length;
      return {
        ingredient_id: String(ingredient.ingredient_id),
        ingredient_name: String(ingredient.ingredient_name),
        classification,
        reason_codes: classification === "approved_replacement"
          ? ["CURRENT_SOURCE_ITEM_VALUES_MATCH_AND_MISSING_VALUES_ADDED"]
          : classification === "needs_review"
            ? [tiedTopCount > 1 ? "AMBIGUOUS_NUTRITION_MATCH" : "HUMAN_APPROVAL_REQUIRED"]
          : classification === "keep_current"
            ? ["NO_MORE_COMPLETE_SINGLE_ROW"]
            : ["NO_EXACT_COMPATIBLE_SOURCE"],
        current: {
          basis_label: basisLabel(ingredient.basis_amount, ingredient.basis_unit),
          source_provider: ingredient.current_source_provider ?? null,
          source_dataset: ingredient.current_source_dataset ?? null,
          source_version: ingredient.current_source_version ?? null,
          external_name: ingredient.current_external_name ?? null,
          values: normalizedValues(ingredient.nutrients),
        },
        candidate_count: improving.length > 0 ? improving.length : compatible.length,
        shown_candidate_count: displayCandidates.length,
        candidates: displayCandidates,
        review_decision: approvedCandidate === null
          ? null
          : {
            decision: "approve_candidate",
            external_item_key: approvedCandidate.external_item_key,
            reason_code: "CURRENT_SOURCE_ITEM_VALUES_MATCH_AND_MISSING_VALUES_ADDED",
          },
      };
    })
    .sort((left, right) => left.ingredient_name.localeCompare(right.ingredient_name, "ko"));
  const classificationCounts = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [
      classification,
      rows.filter((row) => row.classification === classification).length,
    ]),
  );
  const checksumPayload = {
    schema_version: "nutrition-gap-candidate-report-v1",
    inventory_checksum: inventory?.inventory_checksum ?? null,
    rows,
  };
  return {
    ...checksumPayload,
    generated_at: generatedAt,
    target_count: rows.length,
    classification_counts: classificationCounts,
    unclassified_count: rows.filter((row) => !CLASSIFICATIONS.includes(row.classification)).length,
    production_db_writes: 0,
    report_checksum: createHash("sha256")
      .update(JSON.stringify(checksumPayload))
      .digest("hex"),
  };
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export function renderNutritionGapCandidateHtml(report) {
  const clientData = safeJson({ nutrients: NUTRIENTS, ...report });
  const counts = report.classification_counts ?? {};
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>집밥 공식 영양 후보 검수</title>
  <style>
    :root { --ink:#17201c; --muted:#69736d; --paper:#f3efe5; --sheet:#fffdf7; --line:#d7d0bf; --green:#176a48; --green-soft:#e1f0e7; --red:#a63d32; --amber:#95621d; }
    * { box-sizing:border-box; }
    html { min-width:1180px; background:var(--paper); }
    body { margin:0; min-height:100vh; overflow-y: auto; color:var(--ink); font-family:"Pretendard Variable","Noto Sans KR",sans-serif; background:linear-gradient(rgba(80,70,48,.045) 1px,transparent 1px),var(--paper); background-size:100% 28px; }
    button,input,select { font:inherit; }
    header { padding:38px 44px 30px; border-bottom:1px solid #a9a290; }
    .inner,main { width:min(1880px,calc(100% - 88px)); margin:0 auto; }
    .eyebrow { margin:0 0 8px; color:var(--red); font-size:12px; font-weight:850; letter-spacing:.14em; }
    h1 { margin:0; font-size:48px; letter-spacing:-.05em; }
    .summary { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:24px 0 16px; }
    .summary article { padding:18px 20px; border:1px solid var(--line); background:rgba(255,253,247,.75); }
    .summary b { display:block; font-size:30px; }
    .summary span { color:var(--muted); font-size:13px; }
    main { padding-bottom:70px; }
    .workspace { border:1px solid #aaa290; background:var(--sheet); box-shadow:0 18px 48px rgba(30,35,30,.09); }
    .toolbar { position:sticky; top:0; z-index:10; display:flex; justify-content:space-between; gap:16px; padding:12px; border-bottom:1px solid #aaa290; background:rgba(255,253,247,.96); backdrop-filter:blur(10px); }
    .tabs { display:flex; gap:6px; }
    .tab { padding:10px 14px; border:1px solid var(--line); background:white; cursor:pointer; font-weight:800; }
    .tab[aria-selected="true"] { color:white; border-color:var(--ink); background:var(--ink); }
    .search { width:270px; padding:10px 12px; border:1px solid var(--line); }
    .export { padding:10px 14px; color:var(--green); border:1px solid var(--green); background:var(--green-soft); cursor:pointer; font-weight:800; }
    .legend { padding:10px 14px; border-bottom:1px solid var(--line); color:var(--muted); font-size:13px; }
    .table-shell { width:100%; overflow-x:auto; }
    table { width:100%; min-width:1740px; border-collapse:collapse; table-layout:fixed; }
    th,td { border-right:1px solid var(--line); border-bottom:1px solid var(--line); }
    th { padding:10px 7px; background:#ece6d7; font-size:11px; }
    th:first-child { width:150px; } th:nth-child(2) { width:280px; } th:nth-child(3) { width:78px; } th:last-child { width:250px; }
    td { min-height:72px; padding:9px 7px; font-size:12px; vertical-align:middle; }
    td.name { padding-left:14px; font-size:15px; font-weight:850; }
    td.source { text-align:left; }
    td.source select { width:100%; margin-bottom:5px; padding:6px; border:1px solid var(--line); background:white; }
    td.source small { display:block; color:var(--muted); line-height:1.35; }
    td.basis,td.nutrient { text-align:right; font-variant-numeric:tabular-nums; }
    .old { color:var(--muted); } .arrow { padding:0 3px; color:#aaa; } .new { color:var(--green); font-weight:800; }
    .blank { color:#bbb; }
    .choices { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; }
    .choice { min-height:38px; padding:6px 3px; border:1px solid var(--line); background:white; cursor:pointer; font-size:11px; font-weight:800; }
    .choice[aria-pressed="true"] { border-color:var(--green); background:var(--green-soft); color:var(--green); }
    .empty { padding:70px; color:var(--muted); text-align:center; }
  </style>
</head>
<body>
  <header><div class="inner"><p class="eyebrow">HOMECOOK · OFFICIAL SOURCE REVIEW</p><h1>공식 영양 후보 검수</h1></div></header>
  <main>
    <section class="summary">
      <article><b>${counts.approved_replacement ?? 0}개</b><span>현재 원본·기존값 일치로 자동 승인</span></article>
      <article><b>${counts.needs_review ?? 0}개</b><span>공식 후보를 바로 비교해 검수</span></article>
      <article><b>${counts.keep_current ?? 0}개</b><span>더 완전한 단일 row가 없어 현재 유지</span></article>
      <article><b>${counts.no_compatible_source ?? 0}개</b><span>정확히 맞는 공식 후보 없음</span></article>
    </section>
    <section class="workspace">
      <div class="toolbar">
        <nav class="tabs">
          <button class="tab" data-tab="needs_review" aria-selected="true">검수 필요 ${counts.needs_review ?? 0}</button>
          <button class="tab" data-tab="approved_replacement" aria-selected="false">승인 완료 ${counts.approved_replacement ?? 0}</button>
          <button class="tab" data-tab="keep_current" aria-selected="false">현재 유지 ${counts.keep_current ?? 0}</button>
          <button class="tab" data-tab="no_compatible_source" aria-selected="false">공식 후보 없음 ${counts.no_compatible_source ?? 0}</button>
        </nav>
        <div><input id="search" class="search" type="search" placeholder="재료명 검색"><button id="export" class="export" type="button">검수 결과 저장</button></div>
      </div>
      <div class="legend">모든 영양 칸은 <strong>현재 → 후보</strong> 순서입니다. 빈칸은 0이 아니라 원본 결측입니다. 자동 승인: 현재 원본·기존값 일치, 누락값만 보완.</div>
      <div class="table-shell"><table><thead><tr><th>재료명</th><th>공식 후보</th><th>기준</th>${NUTRIENTS.map((item) => `<th>${item.label}<br><small>${item.unit}</small></th>`).join("")}<th>검수결과</th></tr></thead><tbody id="body"></tbody></table><div id="empty" class="empty" hidden>조건에 맞는 항목이 없습니다.</div></div>
    </section>
  </main>
  <script type="application/json" id="candidate-data">${clientData}</script>
  <script>
    (function(){
      "use strict";
      var KEY="homecook-nutrition-candidate-review-v1";
      var data=JSON.parse(document.getElementById("candidate-data").textContent);
      var defaults={};var selected={};data.rows.forEach(function(row){if(row.review_decision){defaults[row.ingredient_id]=row.review_decision;var index=row.candidates.findIndex(function(candidate){return candidate.external_item_key===row.review_decision.external_item_key;});selected[row.ingredient_id]=index<0?0:index;}});
      var saved=defaults; try{saved=Object.assign({},defaults,JSON.parse(localStorage.getItem(KEY)||"{}"));}catch(error){}
      var state={tab:"needs_review",query:"",saved:saved,selected:selected};
      function fmt(value){if(value===null||value===undefined||value==="")return "";var number=Number(value);return Number.isFinite(number)?new Intl.NumberFormat("ko-KR",{maximumFractionDigits:2}).format(number):"";}
      function selectedCandidate(row){var index=state.selected[row.ingredient_id]||0;return row.candidates[index]||null;}
      function fmtBasis(basis){if(!basis)return "";var amount=fmt(basis.amount);var unit=typeof basis.unit==="string"?basis.unit:"";return amount&&unit?amount+unit:"";}
      function choice(row,value,label){var button=document.createElement("button");button.type="button";button.className="choice";button.textContent=label;button.setAttribute("aria-pressed",state.saved[row.ingredient_id]?.decision===value?"true":"false");button.addEventListener("click",function(){var candidate=selectedCandidate(row);state.saved[row.ingredient_id]={decision:value,external_item_key:candidate?.external_item_key||null};localStorage.setItem(KEY,JSON.stringify(state.saved));render();});return button;}
      function renderRow(row){var tr=document.createElement("tr");var candidate=selectedCandidate(row);var name=document.createElement("td");name.className="name";name.textContent=row.ingredient_name;tr.appendChild(name);var source=document.createElement("td");source.className="source";if(row.candidates.length>1){var select=document.createElement("select");row.candidates.forEach(function(item,index){var option=document.createElement("option");option.value=String(index);option.textContent=(index+1)+". "+item.provider_label+" · "+item.external_name;select.appendChild(option);});select.value=String(state.selected[row.ingredient_id]||0);select.addEventListener("change",function(){state.selected[row.ingredient_id]=Number(select.value);render();});source.appendChild(select);}var sourceText=document.createElement("small");sourceText.textContent=candidate?candidate.provider_label+" · "+candidate.external_name:"";source.appendChild(sourceText);if(row.candidate_count>row.shown_candidate_count){var more=document.createElement("small");more.textContent="동일 조건 후보 "+(row.candidate_count-row.shown_candidate_count)+"개 더 있음";source.appendChild(more);}tr.appendChild(source);var basis=document.createElement("td");basis.className="basis";basis.textContent=candidate?fmtBasis(candidate.basis):row.current.basis_label||"";tr.appendChild(basis);data.nutrients.forEach(function(nutrient){var td=document.createElement("td");td.className="nutrient";var oldValue=fmt(row.current.values[nutrient.code]);var newValue=candidate?fmt(candidate.values[nutrient.code]):"";var oldSpan=document.createElement("span");oldSpan.className=oldValue?"old":"blank";oldSpan.textContent=oldValue;td.appendChild(oldSpan);var arrow=document.createElement("span");arrow.className="arrow";arrow.textContent=" → ";td.appendChild(arrow);var newSpan=document.createElement("span");newSpan.className=newValue?"new":"blank";newSpan.textContent=newValue;td.appendChild(newSpan);tr.appendChild(td);});var result=document.createElement("td");var controls=document.createElement("div");controls.className="choices";controls.appendChild(choice(row,"approve_candidate","승인 후보"));controls.appendChild(choice(row,"keep_current","현재 유지"));controls.appendChild(choice(row,"hold","보류"));result.appendChild(controls);tr.appendChild(result);return tr;}
      function render(){var query=state.query.trim().toLocaleLowerCase("ko");var rows=data.rows.filter(function(row){return row.classification===state.tab&&(!query||row.ingredient_name.toLocaleLowerCase("ko").includes(query));});var body=document.getElementById("body");body.replaceChildren.apply(body,rows.map(renderRow));document.getElementById("empty").hidden=rows.length!==0;document.querySelectorAll(".tab").forEach(function(tab){tab.setAttribute("aria-selected",tab.dataset.tab===state.tab?"true":"false");});}
      document.querySelectorAll(".tab").forEach(function(tab){tab.addEventListener("click",function(){state.tab=tab.dataset.tab;render();});});document.getElementById("search").addEventListener("input",function(event){state.query=event.target.value;render();});document.getElementById("export").addEventListener("click",function(){var payload=JSON.stringify({version:1,report_checksum:data.report_checksum,exported_at:new Date().toISOString(),decisions:state.saved},null,2);var url=URL.createObjectURL(new Blob([payload],{type:"application/json"}));var a=document.createElement("a");a.href=url;a.download="homecook-nutrition-candidate-review.json";a.click();URL.revokeObjectURL(url);});render();
    }());
  </script>
</body>
</html>`;
}
