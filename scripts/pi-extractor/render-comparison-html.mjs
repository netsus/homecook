#!/usr/bin/env node
/* eslint-disable no-console */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadDatasetProfile } from "../recipe-loop/lib/dataset-profile.mjs";

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

function metric(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "") : "-";
}

function normalizeName(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

function allIngredientNames(ingredient) {
  return [
    ingredient?.name,
    ingredient?.item,
    ingredient?.ingredient,
    ...(Array.isArray(ingredient?.nameAliases) ? ingredient.nameAliases : []),
  ].filter(Boolean);
}

function ingredientName(ingredient) {
  return ingredient?.name ?? ingredient?.item ?? ingredient?.ingredient ?? "재료명 없음";
}

function namesMatch(first, second) {
  const firstNames = allIngredientNames(first).map(normalizeName).filter(Boolean);
  const secondNames = allIngredientNames(second).map(normalizeName).filter(Boolean);
  for (const a of firstNames) {
    for (const b of secondNames) {
      if (a === b) return { score: 1, label: "100%" };
      const shorter = a.length <= b.length ? a : b;
      const longer = a.length > b.length ? a : b;
      if (shorter.length >= 2 && longer.includes(shorter)) return { score: 0.86, label: "86%" };
    }
  }
  return { score: 0, label: "miss" };
}

function amountText(item) {
  return [item?.amount, item?.unit].filter(Boolean).join(" ") || "";
}

function refsText(refs, limit = 5) {
  const values = Array.isArray(refs) ? refs : refs ? [refs] : [];
  if (values.length === 0) return "-";
  const clipped = values.slice(0, limit).join(" / ");
  return values.length > limit ? `${clipped} / +${values.length - limit}` : clipped;
}

function boolText(value) {
  return value === true ? "true" : value === false ? "false" : "-";
}

function badge(className, value) {
  return value ? `<span class="${className}">${esc(value)}</span>` : "";
}

function ingredientCell(ingredient, { isGolden = false } = {}) {
  if (!ingredient) return "<span class=\"empty\">-</span>";
  const amount = amountText(ingredient);
  const aliases = Array.isArray(ingredient.nameAliases) && ingredient.nameAliases.length
    ? `<div class="alias">alias: ${esc(ingredient.nameAliases.join(", "))}</div>`
    : "";
  const evidence = Array.isArray(ingredient.evidence) || ingredient.evidence
    ? `<div class="alias">evidence: ${esc(refsText(ingredient.evidence, 6))}</div>`
    : "";
  const confidence = Number.isFinite(Number(ingredient.confidence))
    ? badge("conf", `conf ${Number(ingredient.confidence).toFixed(2)}`)
    : "";
  return [
    `<b>${esc(ingredientName(ingredient))}</b>`,
    amount ? ` ${esc(amount)}` : "",
    badge("basis", ingredient.amountBasis),
    badge("group", ingredient.groupLabel),
    ingredient.optional ? badge("opt", "선택") : "",
    confidence,
    aliases,
    isGolden ? "" : evidence,
  ].join("");
}

function stepText(step, index) {
  if (typeof step === "string") return step;
  return step?.instruction ?? step?.text ?? step?.description ?? `단계 ${index + 1}`;
}

function titleScore(first, second) {
  const a = normalizeName(first);
  const b = normalizeName(second);
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.includes(b) || b.includes(a)) return 2;
  const aChars = new Set([...a]);
  const bChars = new Set([...b]);
  const common = [...aChars].filter((char) => bChars.has(char)).length;
  return common / Math.max(1, Math.max(aChars.size, bChars.size));
}

function alignRecipes(goldenRecipes, predRecipes) {
  const used = new Set();
  return (goldenRecipes ?? []).map((golden, index) => {
    let bestIndex = -1;
    let bestScore = -1;
    for (const [predIndex, pred] of (predRecipes ?? []).entries()) {
      if (used.has(predIndex)) continue;
      const score = titleScore(golden?.title, pred?.title) + (predIndex === index ? 0.25 : 0);
      if (score > bestScore) {
        bestIndex = predIndex;
        bestScore = score;
      }
    }
    if (bestIndex >= 0 && bestScore >= 0.25) {
      used.add(bestIndex);
      return { golden, pred: predRecipes[bestIndex], predIndex: bestIndex, goldenIndex: index, matched: true };
    }
    return { golden, pred: null, predIndex: -1, goldenIndex: index, matched: false };
  }).concat((predRecipes ?? [])
    .map((pred, predIndex) => ({ pred, predIndex }))
    .filter((item) => !used.has(item.predIndex))
    .map((item) => ({ golden: null, pred: item.pred, predIndex: item.predIndex, goldenIndex: -1, matched: false })));
}

function alignIngredients(goldenIngredients, predIngredients) {
  const used = new Set();
  const rows = [];
  for (const golden of goldenIngredients ?? []) {
    let bestIndex = -1;
    let best = { score: 0, label: "miss" };
    for (const [index, pred] of (predIngredients ?? []).entries()) {
      if (used.has(index)) continue;
      const match = namesMatch(golden, pred);
      if (match.score > best.score) {
        best = match;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0 && best.score > 0) {
      used.add(bestIndex);
      rows.push({ golden, pred: predIngredients[bestIndex], className: best.score === 1 ? "ing-match" : "ing-order", label: best.label });
    } else {
      rows.push({ golden, pred: null, className: "ing-miss", label: "miss" });
    }
  }
  for (const [index, pred] of (predIngredients ?? []).entries()) {
    if (!used.has(index)) rows.push({ golden: null, pred, className: "ing-extra", label: "extra" });
  }
  return rows;
}

function scoreClass(score) {
  if (!Number.isFinite(Number(score))) return "na";
  if (Number(score) >= 4) return "good";
  if (Number(score) >= 3) return "mid";
  return "low";
}

function recipeProblem(score, pair) {
  return !pair.matched || !Number.isFinite(Number(score)) || Number(score) < 4;
}

function semanticCase(sem, index, title) {
  const cases = sem?.cases ?? [];
  return cases[index] ?? cases.find((item) => normalizeName(item.title) === normalizeName(title)) ?? null;
}

function deterministicRecipe(det, index) {
  return det?.perRecipe?.[index] ?? null;
}

function visualRows({ visualTarget, visual, visualEstimates }) {
  const targets = visualTarget?.targets ?? [];
  const estimates = visualEstimates?.visualEstimates ?? [];
  const framesByCandidate = new Map((visual?.candidates ?? []).map((candidate) => [candidate.candidateId, candidate.frames ?? []]));
  const rows = targets.map((target) => {
    const estimate = estimates.find((entry) => entry.targetId === target.targetId);
    const frames = framesByCandidate.get(target.candidateId) ?? [];
    const reasonParts = [
      estimate?.reason,
      estimate?.error,
      estimate?.uncertainty,
      estimate?.targetVisible === false ? "targetVisible=false" : null,
      estimate?.referenceObjectVisible === false ? "referenceObjectVisible=false" : null,
      Array.isArray(estimate?.evidence) && estimate.evidence.length ? null : "frame evidence 없음",
    ].filter(Boolean);
    return `
      <tr>
        <td>${esc(target.candidateId)}</td>
        <td>${esc(target.ingredient)}</td>
        <td>${esc(target.reason ?? "-")}</td>
        <td>${esc(target.fallbackPolicy ?? "-")}</td>
        <td>${esc(amountText(estimate) || "null")}</td>
        <td>${esc(estimate?.amountBasis ?? "null")}</td>
        <td>${metric(estimate?.confidence)}</td>
        <td>${esc(refsText(estimate?.evidence, 6))}</td>
        <td>${esc([
          `visible ${boolText(estimate?.targetVisible)}`,
          `ref ${boolText(estimate?.referenceObjectVisible)}`,
          estimate?.countEvidence ? `count ${estimate.countEvidence}` : null,
          `candidate frames ${frames.length}`,
          reasonParts.join(" · ") || "visual-estimate 미적용",
        ].filter(Boolean).join(" · "))}</td>
      </tr>
    `;
  });
  for (const skipped of visualTarget?.skippedTargets ?? []) {
    rows.push(`
      <tr>
        <td>${esc(skipped.candidateId)}</td>
        <td>${esc(skipped.ingredient)}</td>
        <td>${esc(skipped.reasonCode ?? "skipped")}</td>
        <td colspan="6">visual target 생성 안 함</td>
      </tr>
    `);
  }
  return rows.join("");
}

function visualEvidenceHtml({ visualTarget, visual, visualEstimates }) {
  const targets = visualTarget?.targets ?? [];
  const skipped = visualTarget?.skippedTargets ?? [];
  const estimates = visualEstimates?.visualEstimates ?? [];
  const frameCount = (visual?.candidates ?? []).reduce((sum, candidate) => sum + (candidate.frames?.length ?? 0), 0);
  if (targets.length === 0 && skipped.length === 0 && estimates.length === 0 && frameCount === 0) return "";
  return `
    <details class="visual">
      <summary>Visual estimate 근거 · targets ${targets.length} · frames ${frameCount} · estimates ${estimates.length}</summary>
      <div class="tbl">
        <table>
          <thead><tr><th>후보</th><th>재료</th><th>target 이유</th><th>fallback</th><th>추정량</th><th>basis</th><th>conf</th><th>evidence</th><th>판단 이유</th></tr></thead>
          <tbody>${visualRows({ visualTarget, visual, visualEstimates }) || "<tr><td colspan=\"9\">visual target 없음</td></tr>"}</tbody>
        </table>
      </div>
    </details>
  `;
}

function understandingInjectionRows(candidateDrafts) {
  return (candidateDrafts?.candidates ?? []).map((candidate) => {
    const injected = candidate.candidateRecipeMapContractInjected
      ?? candidate.candidateIntegratedBriefInjected
      ?? candidate.recipeUnitUnderstandingStatePromptInjected;
    const bytes = candidate.candidateRecipeMapContractBytes
      ?? candidate.candidateIntegratedBriefBytes
      ?? candidate.recipeUnitUnderstandingStatePromptBytes;
    const maxBytes = candidate.candidateRecipeMapContractMaxBytes
      ?? candidate.candidateIntegratedBriefMaxBytes
      ?? candidate.recipeUnitUnderstandingStatePromptMaxDeltaBytes;
    const budgetExceeded = candidate.candidateRecipeMapContractBudgetExceeded
      ?? candidate.candidateIntegratedBriefBudgetExceeded
      ?? candidate.recipeUnitUnderstandingStatePromptBudgetExceeded;
    const failOpen = candidate.candidateRecipeMapContractFailOpen
      ?? candidate.candidateIntegratedBriefFailOpen
      ?? candidate.recipeUnitUnderstandingStatePromptFailOpen;
    const section = candidate.candidateRecipeMapContractInjected
      ? "RECIPE_MAP_CONTRACT"
      : candidate.candidateIntegratedBriefInjected
      ? "CANDIDATE_INTEGRATED_BRIEF"
      : candidate.recipeUnitUnderstandingStatePromptSection;
    return `
      <tr>
        <td>${esc(candidate.candidateId ?? "-")}</td>
        <td>${esc(candidate.title ?? "-")}</td>
        <td>${esc(boolText(injected))}</td>
        <td>${esc(section ?? "-")}</td>
        <td>${esc(bytes ?? "-")}${maxBytes ? ` / ${esc(maxBytes)}` : ""}</td>
        <td>${esc(boolText(budgetExceeded))}</td>
        <td>${esc(boolText(failOpen))}</td>
        <td>${esc([
          `stories ${candidate.understandingAuditStoryCount ?? 0}`,
          `source entries ${candidate.sourceEntryCount ?? 0}`,
          candidate.candidateRecipeMapContractTruncated || candidate.candidateIntegratedBriefTruncated || candidate.recipeUnitUnderstandingStatePromptTruncated ? "truncated" : null,
          candidate.reason,
        ].filter(Boolean).join(" · ") || "-")}</td>
      </tr>
    `;
  }).join("");
}

function understandingUsageHtml({ candidateDrafts, videoUnderstandingUsage, videoUnderstandingFailure }) {
  const candidateCount = candidateDrafts?.candidates?.length ?? 0;
  if (!videoUnderstandingUsage && !videoUnderstandingFailure && candidateCount === 0) return "";
  const usable = videoUnderstandingUsage?.usable;
  const acceptedStoryCount = videoUnderstandingUsage?.acceptedStoryCount ?? 0;
  const rejectedStoryCount = videoUnderstandingUsage?.rejectedStoryCount ?? 0;
  const injectedCount = (candidateDrafts?.candidates ?? [])
    .filter((candidate) => (
      candidate.candidateRecipeMapContractInjected
      ?? candidate.candidateIntegratedBriefInjected
      ?? candidate.recipeUnitUnderstandingStatePromptInjected
    ) === true)
    .length;
  const failureText = videoUnderstandingFailure
    ? `${videoUnderstandingFailure.reason ?? "failed"}${videoUnderstandingFailure.message ? ` · ${videoUnderstandingFailure.message}` : ""}`
    : "";
  return `
    <details class="visual understanding">
      <summary>Integrated understanding 주입 · candidates ${candidateCount} · injected ${injectedCount} · accepted stories ${acceptedStoryCount}</summary>
      <div class="note">
        video-understanding usable: <code>${esc(boolText(usable))}</code>
        · rejected stories: <code>${esc(rejectedStoryCount)}</code>
        · candidate scoped: <code>${esc(boolText(videoUnderstandingUsage?.candidateScoped))}</code>
        ${videoUnderstandingUsage?.reason ? `· reason: <code>${esc(videoUnderstandingUsage.reason)}</code>` : ""}
        ${failureText ? `· failure: <code>${esc(failureText)}</code>` : ""}
      </div>
      <div class="tbl">
        <table>
          <thead><tr><th>후보</th><th>레시피</th><th>주입</th><th>prompt 섹션</th><th>bytes</th><th>budget 초과</th><th>fail-open</th><th>설명</th></tr></thead>
          <tbody>${understandingInjectionRows(candidateDrafts) || "<tr><td colspan=\"8\">candidate draft 없음</td></tr>"}</tbody>
        </table>
      </div>
    </details>
  `;
}

function wholeVideoRecipeMapHtml({ wholeVideoRecipeMap, wholeVideoRecipeMapAudit, candidateMapAdherenceAudit }) {
  if (!wholeVideoRecipeMap && !wholeVideoRecipeMapAudit && !candidateMapAdherenceAudit) return "";
  const units = wholeVideoRecipeMap?.units ?? [];
  const warnings = [
    ...(wholeVideoRecipeMapAudit?.warnings ?? []).map((warning) => ({ source: "map-audit", ...warning })),
    ...(candidateMapAdherenceAudit?.warnings ?? []).map((warning) => ({ source: "adherence", ...warning })),
  ];
  const unitRows = units.map((unit) => {
    const known = (unit.ingredientSlots ?? []).filter((slot) => slot.amountSlot?.status === "known");
    const unknown = (unit.ingredientSlots ?? []).filter((slot) => slot.amountSlot?.status !== "known");
    return `
      <tr>
        <td>${esc(unit.recipeUnitId ?? "-")}</td>
        <td>${esc(unit.title ?? unit.dishIntent?.name ?? "-")}</td>
        <td>${esc(known.map((slot) => `${slot.name} ${slot.amountSlot.amount}${slot.amountSlot.unit}`).join(", ") || "-")}</td>
        <td>${esc(unknown.map((slot) => `${slot.name}(${slot.amountSlot?.status ?? "unknown"})`).join(", ") || "-")}</td>
        <td>${esc((unit.stepSpine ?? []).map((step) => step.text).join(" -> ") || "-")}</td>
        <td>${esc((unit.visualGaps ?? []).map((gap) => gap.ingredient).join(", ") || "-")}</td>
      </tr>
    `;
  }).join("");
  const warningRows = warnings.map((warning) => `
    <tr>
      <td>${esc(warning.source)}</td>
      <td>${esc(warning.type ?? "-")}</td>
      <td>${esc(warning.recipeUnitId ?? "-")}</td>
      <td>${esc(warning.ingredient ?? "-")}</td>
      <td>${esc([warning.amount, warning.unit].filter(Boolean).join("") || [warning.expectedAmount, warning.expectedUnit].filter(Boolean).join("") || "-")}</td>
      <td>${esc(warning.sourceRef ?? (warning.evidence ?? []).join(", ") ?? "-")}</td>
      <td>${esc(warning.reason ?? warning.textSnippet ?? "-")}</td>
    </tr>
  `).join("");
  return `
    <details class="visual understanding">
      <summary>Whole-video recipe map · units ${units.length} · known amounts ${wholeVideoRecipeMap?.summary?.knownAmountSlotCount ?? 0} · warnings ${warnings.length}</summary>
      <div class="note">
        지도는 후보 draft 전에 만든 전체 영상 이해 메모입니다. known amount는 원본 source entry로 다시 검증된 수량이고, unknown/visual gap은 아직 채우면 안 되는 빈칸입니다.
      </div>
      <div class="tbl">
        <table>
          <thead><tr><th>unit</th><th>요리</th><th>검증된 수량</th><th>미확정 수량</th><th>조리 흐름</th><th>visual gap</th></tr></thead>
          <tbody>${unitRows || "<tr><td colspan=\"6\">recipe map unit 없음</td></tr>"}</tbody>
        </table>
      </div>
      <div class="tbl">
        <table>
          <thead><tr><th>출처</th><th>경고</th><th>unit</th><th>재료</th><th>수량</th><th>근거</th><th>이유</th></tr></thead>
          <tbody>${warningRows || "<tr><td colspan=\"7\">map/adherence 경고 없음</td></tr>"}</tbody>
        </table>
      </div>
    </details>
  `;
}

function sourceGapHtml({ sourceDraft, gapLedger, holisticAudit }) {
  const recipes = sourceDraft?.recipes ?? [];
  const gaps = gapLedger?.gaps ?? [];
  const rows = [];
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients ?? []) {
      const gap = gaps.find((item) => item.candidateId === recipe.candidateId && item.ingredient === ingredient.name);
      rows.push(`
        <tr>
          <td>${esc(recipe.candidateId ?? "-")}</td>
          <td>${esc(recipe.title ?? "-")}</td>
          <td>${esc(ingredient.name ?? "-")}</td>
          <td>${esc(amountText(ingredient) || "null")}</td>
          <td>${esc(ingredient.amountBasis ?? "null")}</td>
          <td>${esc(refsText(ingredient.sourceEvidence, 5))}</td>
          <td>${esc(gap?.gapType ?? "-")}</td>
          <td>${esc(boolText(gap?.visualTargetAllowed))}</td>
          <td>${esc(gap?.whyVisualNeeded ?? gap?.reason ?? "-")}</td>
        </tr>
      `);
    }
  }
  for (const recipe of holisticAudit?.recipes ?? []) {
    const ingredientRows = recipe.ingredients?.length ? recipe.ingredients : [{ ingredient: null, status: recipe.status }];
    for (const auditRow of ingredientRows) {
      const ingredient = auditRow.ingredient ?? auditRow.original ?? {};
      const original = auditRow.original ?? ingredient;
      rows.push(`
        <tr>
          <td>${esc(recipe.candidateId ?? "-")}</td>
          <td>${esc(recipe.title ?? "-")}</td>
          <td>${esc(ingredientName(ingredient))}</td>
          <td>${esc(amountText(ingredient) || amountText(original) || "null")}</td>
          <td>${esc(ingredient.amountBasis ?? original.amountBasis ?? "null")}</td>
          <td>${esc(refsText(auditRow.evidenceRefs ?? ingredient.evidence ?? original.evidence, 5))}</td>
          <td>${esc(`holistic:${auditRow.status ?? recipe.status ?? "-"}:${auditRow.amountStatus ?? "-"}`)}</td>
          <td>${esc(boolText(Boolean(auditRow.visualEstimate)))}</td>
          <td>${esc(auditRow.reason ?? recipe.reason ?? "-")}</td>
        </tr>
      `);
    }
  }
  if (rows.length === 0) return "";
  return `
    <details class="visual source-gap">
      <summary>Source evidence / gap-ledger / holistic audit · source recipes ${recipes.length} · gaps ${gaps.length} · audit recipes ${holisticAudit?.recipes?.length ?? 0}</summary>
      <div class="tbl">
        <table>
          <thead><tr><th>후보</th><th>레시피</th><th>재료</th><th>source 양</th><th>basis</th><th>source evidence</th><th>gap</th><th>visual 허용</th><th>판단 이유</th></tr></thead>
          <tbody>${rows.join("") || "<tr><td colspan=\"9\">없음</td></tr>"}</tbody>
        </table>
      </div>
    </details>
  `;
}

function deferredNotes(goldenIngredients, predIngredients) {
  const rows = alignIngredients(goldenIngredients, predIngredients);
  return rows
    .filter((row) => row.golden?.amountBasis === "visual-estimate")
    .filter((row) => amountText(row.golden) !== amountText(row.pred))
    .map((row) => `${ingredientName(row.golden)}: Golden amountBasis=visual-estimate라 분량 차이 감점 보류`);
}

function ingredientTable(goldenRecipe, predRecipe) {
  const goldenIngredients = goldenRecipe?.ingredients ?? [];
  const predIngredients = predRecipe?.ingredients ?? [];
  const rows = alignIngredients(goldenIngredients, predIngredients).map((row) => `
    <tr class="${row.className}">
      <td>${ingredientCell(row.golden, { isGolden: true })}</td>
      <td>${ingredientCell(row.pred)}</td>
      <td class="align-score">${esc(row.label)}</td>
    </tr>
  `).join("");
  return `
    <div class="tbl">
      <h3>재료 (정답 ${goldenIngredients.length} / Pi ${predIngredients.length})</h3>
      <table>
        <thead><tr><th>정답 golden</th><th>Pi 추출</th><th>정렬</th></tr></thead>
        <tbody>${rows || "<tr><td colspan=\"3\">재료 없음</td></tr>"}</tbody>
      </table>
    </div>
  `;
}

function stepTable(goldenRecipe, predRecipe) {
  const goldenSteps = goldenRecipe?.steps ?? [];
  const predSteps = predRecipe?.steps ?? [];
  const length = Math.max(goldenSteps.length, predSteps.length);
  const rows = Array.from({ length }, (_, index) => `
    <tr>
      <td class="num">${index + 1}</td>
      <td>${goldenSteps[index] ? esc(stepText(goldenSteps[index], index)) : "<span class=\"empty\">-</span>"}</td>
      <td>${predSteps[index] ? esc(stepText(predSteps[index], index)) : "<span class=\"empty\">매칭된 단계 없음</span>"}</td>
    </tr>
  `).join("");
  return `
    <div class="tbl">
      <h3>만들기 (정답 ${goldenSteps.length} / Pi ${predSteps.length})</h3>
      <table class="steps">
        <thead><tr><th>#</th><th>정답 golden</th><th>Pi 추출</th></tr></thead>
        <tbody>${rows || "<tr><td colspan=\"3\">단계 없음</td></tr>"}</tbody>
      </table>
    </div>
  `;
}

function recipeCard({ pair, semCase, detRecipe }) {
  const caseScore = semCase?.case_score;
  const className = pair.matched ? scoreClass(caseScore) : "na";
  const open = recipeProblem(caseScore, pair) ? "open" : "";
  const deferred = deferredNotes(pair.golden?.ingredients ?? [], pair.pred?.ingredients ?? []);
  const title = pair.golden?.title ?? "정답에 없는 Pi 추가 레시피";
  const predTitle = pair.pred?.title ?? "매칭된 추출 레시피 없음";
  return `
    <details class="recipe ${className}" ${open} data-problem="${recipeProblem(caseScore, pair) ? "1" : "0"}">
      <summary>
        <span class="rtitle">${esc(title)}</span>
        <span class="pred-title">Pi: ${esc(predTitle)}</span>
        <span class="scores">
          <b class="sc ${scoreClass(semCase?.ingredient_score)}">재료 ${metric(semCase?.ingredient_score)}</b>
          <b class="sc ${scoreClass(semCase?.step_score)}">단계 ${metric(semCase?.step_score)}</b>
          <b class="sc case ${scoreClass(caseScore)}">case ${metric(caseScore)}</b>
          <span class="scale">/5</span>
        </span>
      </summary>
      <div class="body">
        <div class="reason">
          <b>semantic judge</b>
          <p>${esc(semCase?.reason ?? (pair.matched ? "semantic judge 결과 없음" : "매칭된 추출 레시피 없음"))}</p>
          ${deferred.length ? `<p class="deferred"><b>분량 보류:</b> ${esc(deferred.join(" / "))}</p>` : ""}
          <p class="metric-line">deterministic: ingredient F1 ${metric(detRecipe?.ingredientF1)} · amount match ${metric(detRecipe?.amountMatchRate)} · amount coverage ${metric(detRecipe?.amountCoverage)} · step coverage ${metric(detRecipe?.stepCoverage)}</p>
        </div>
        ${ingredientTable(pair.golden, pair.pred)}
        ${stepTable(pair.golden, pair.pred)}
      </div>
    </details>
  `;
}

function videoProblem({ sem, det, manifest }) {
  const caseScores = (sem?.cases ?? []).map((item) => Number(item.case_score)).filter(Number.isFinite);
  return (
    caseScores.some((score) => score < 4)
    || det?.recipeCountMatch === false
    || (manifest?.forbiddenReadEvents?.length ?? 0) > 0
    || (manifest?.visualEvidenceContractFailureCount ?? 0) > 0
  );
}

function videoHtml({
  id,
  source,
  golden,
  result,
  det,
  sem,
  manifest,
  sourceDraft,
  gapLedger,
  holisticAudit,
  visualTarget,
  visual,
  visualEstimates,
  candidateDrafts,
  videoUnderstandingUsage,
  videoUnderstandingFailure,
  wholeVideoRecipeMap,
  wholeVideoRecipeMapAudit,
  candidateMapAdherenceAudit,
  outTag,
}) {
  const pairs = alignRecipes(golden?.recipes ?? [], result?.recipes ?? []);
  const minScore = (sem?.cases ?? []).reduce((min, item) => Math.min(min, Number(item.case_score)), Number.POSITIVE_INFINITY);
  const minDisplay = Number.isFinite(minScore) ? minScore : null;
  return `
    <section class="video" data-problem="${videoProblem({ sem, det, manifest }) ? "1" : "0"}">
      <h2><a href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" rel="noopener noreferrer">${esc(id)}</a> <span>${esc(source?.video?.title ?? golden?.title ?? "")}</span></h2>
      <div class="video-meta">
        <span>run: ${esc(outTag)}</span>
        <span>recipes ${det?.recipeCountPredicted ?? result?.recipes?.length ?? 0}/${det?.recipeCountGolden ?? golden?.recipes?.length ?? 0}</span>
        <span>semantic avg ${metric(sem?.average_score ?? sem?.averageScore)} · min ${metric(minDisplay)}</span>
        <span>det F1 ${metric(det?.ingredientF1)} · amount ${metric(det?.amountMatchRate)} · coverage ${metric(det?.amountCoverage)} · steps ${metric(det?.stepCoverage)}</span>
      <span>forbidden reads ${manifest?.forbiddenReadEvents?.length ?? 0}</span>
      <span>contract failures ${manifest?.visualEvidenceContractFailureCount ?? 0}</span>
      </div>
      ${understandingUsageHtml({ candidateDrafts, videoUnderstandingUsage, videoUnderstandingFailure })}
      ${wholeVideoRecipeMapHtml({ wholeVideoRecipeMap, wholeVideoRecipeMapAudit, candidateMapAdherenceAudit })}
      ${visualEvidenceHtml({ visualTarget, visual, visualEstimates })}
      ${sourceGapHtml({ sourceDraft, gapLedger, holisticAudit })}
      ${pairs.map((pair, index) => recipeCard({
        pair,
        semCase: semanticCase(sem, pair.goldenIndex >= 0 ? pair.goldenIndex : index, pair.golden?.title ?? pair.pred?.title),
        detRecipe: deterministicRecipe(det, pair.goldenIndex >= 0 ? pair.goldenIndex : index),
      })).join("\n")}
    </section>
  `;
}

function kstNow() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date());
}

function summaryTable({ ids, freeze, grade, semantic }) {
  const aggregate = grade.aggregate ?? {};
  const sem = semantic.aggregate ?? {};
  const forbiddenReads = freeze?.forbiddenReadCount ?? aggregate.forbiddenReadCount ?? 0;
  return `
    <table class="summary">
      <thead><tr><th>영상</th><th>freeze</th><th>forbidden reads</th><th>semantic 평균</th><th>bottom2</th><th>최저</th><th>semantic gate</th><th>재료 F1</th><th>분량 match</th><th>분량 coverage</th><th>단계 coverage</th></tr></thead>
      <tbody><tr>
        <td>${ids.length}</td>
        <td>${freeze?.completedCount ?? aggregate.actual_count ?? "-"}/${freeze?.caseCount ?? aggregate.expected_count ?? ids.length}</td>
        <td>${forbiddenReads}</td>
        <td>${metric(sem.averageScore)}</td>
        <td>${metric(sem.bottomKMeanScore)}</td>
        <td>${metric(sem.minCaseScore)}</td>
        <td class="${sem.threshold_success ? "pass" : "fail"}">${sem.threshold_success ? "PASS" : "FAIL"}</td>
        <td>${metric(aggregate.ingredientF1)}</td>
        <td>${metric(aggregate.amountMatchRate)}</td>
        <td>${metric(aggregate.amountCoverage)}</td>
        <td>${metric(aggregate.stepCoverage)}</td>
      </tr></tbody>
    </table>
  `;
}

export async function renderComparisonHtml(rawArgs = {}, options = {}) {
  const args = typeof rawArgs.length === "number" ? parseCliArgs(rawArgs) : rawArgs;
  const projectRoot = options.projectRoot ?? process.cwd();
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = args["out-tag"];
  if (!outTag) throw new Error("--out-tag is required");
  if (split !== "train") {
    throw new Error("protected split comparison HTML is aggregate-only; detailed rendering is allowed for train only");
  }
  const dataRoot = path.join(projectRoot, "notebooks/recipe_loop_data", split);
  const requestedIds = typeof args.ids === "string"
    ? args.ids.split(",").map((item) => item.trim()).filter(Boolean)
    : null;
  const datasetProfile = typeof args["dataset-manifest"] === "string"
    ? await loadDatasetProfile({
      projectRoot,
      manifestPath: args["dataset-manifest"],
      split,
      requestedIds,
    })
    : null;
  const ids = datasetProfile?.ids ?? requestedIds
    ?? (await readdir(dataRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const outputPath = path.resolve(projectRoot, args.output ?? `.omx/plans/${outTag}-vs-golden.html`);
  const grade = await readJson(path.join(dataRoot, `_grade_summary.${outTag}.json`), { aggregate: {}, perVideo: [] });
  const semantic = await readJson(path.join(dataRoot, `_semantic_summary.${outTag}.json`), { aggregate: {}, perVideo: [] });
  const freeze = await readJson(path.join(dataRoot, `_pi_freeze.${outTag}.json`), null);
  const cases = [];
  for (const id of ids) {
    const caseDir = path.join(dataRoot, id);
    const runDir = path.join(caseDir, "runs", outTag);
    cases.push(videoHtml({
      id,
      source: await readJson(path.join(caseDir, "source.json"), {}),
      golden: await readJson(path.join(caseDir, "golden.json"), { videoId: id, recipes: [] }),
      result: await readJson(path.join(runDir, "result.json"), { videoId: id, recipes: [] }),
      det: grade.perVideo?.find((item) => item.videoId === id),
      sem: semantic.perVideo?.find((item) => item.videoId === id),
      manifest: await readJson(path.join(runDir, "file-access-manifest.json"), null),
      sourceDraft: await readJson(path.join(runDir, "source-draft.json"), null),
      gapLedger: await readJson(path.join(runDir, "gap-ledger.json"), null),
      holisticAudit: await readJson(path.join(runDir, "holistic-evidence-audit.json"), null),
      visualTarget: await readJson(path.join(runDir, "visual-target-ledger.json"), null),
      visual: await readJson(path.join(runDir, "visual-ledger.json"), null),
      visualEstimates: await readJson(path.join(runDir, "visual-estimates.json"), null),
      candidateDrafts: await readJson(path.join(runDir, "candidate-drafts.json"), null),
      videoUnderstandingUsage: await readJson(path.join(runDir, "video-understanding-usage.json"), null),
      videoUnderstandingFailure: await readJson(path.join(runDir, "video-understanding-failure.json"), null),
      wholeVideoRecipeMap: await readJson(path.join(runDir, "whole-video-recipe-map.json"), null),
      wholeVideoRecipeMapAudit: await readJson(path.join(runDir, "whole-video-recipe-map-audit.json"), null),
      candidateMapAdherenceAudit: await readJson(path.join(runDir, "candidate-map-adherence-audit.json"), null),
      outTag,
    }));
  }

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(outTag)} 추출 결과 vs golden 정답 비교</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",sans-serif;font-size:14px;line-height:1.5}header{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #d9dee8;padding:14px 22px;box-shadow:0 2px 12px rgba(15,23,42,.06);max-height:52vh;overflow:auto}main{max-width:1320px;margin:0 auto;padding:18px 22px 60px}h1{font-size:20px;margin:0 0 6px}code{background:#eef2f7;border-radius:4px;padding:1px 5px}.note{margin:3px 0;color:#596274;font-size:12.5px}.summary{border-collapse:collapse;margin:10px 0}.summary th,.summary td{border:1px solid #d7dce5;padding:5px 10px;text-align:center}.summary th{background:#f1f4f8}.legend span,.basis,.group,.opt,.conf{display:inline-block;margin:1px 3px 1px 0;padding:1px 6px;border-radius:4px;font-size:11px}.lgood{background:#dcfce7}.lmid{background:#fef3c7}.llow{background:#fee2e2}.controls button{margin:6px 8px 0 0;padding:5px 11px;border:1px solid #b7c0cf;background:#fff;border-radius:6px;cursor:pointer}.controls button.active{background:#2563eb;color:#fff;border-color:#2563eb}.video{margin:18px 0 26px}.video.hide,.recipe.hide{display:none}.video h2{font-size:14px;margin:0 0 6px;background:#111827;color:#fff;border-radius:6px;padding:8px 10px}.video h2 a{color:#bfdbfe;text-decoration:none}.video h2 span{font-weight:500}.video-meta{display:flex;flex-wrap:wrap;gap:6px 10px;margin:6px 0;color:#4b5563;font-size:12px}.video-meta span{background:#fff;border:1px solid #dfe4ec;border-radius:999px;padding:3px 8px}.visual{background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin:6px 0;padding:0 10px}.visual summary{cursor:pointer;padding:6px 0;font-size:12px;color:#374151}.source-gap summary{color:#334155}.recipe{background:#fff;border:1px solid #e1e5ed;border-left-width:5px;border-radius:8px;margin:8px 0;overflow:hidden}.recipe.good{border-left-color:#16a34a}.recipe.mid{border-left-color:#d97706}.recipe.low{border-left-color:#dc2626}.recipe.na{border-left-color:#9ca3af}.recipe summary{cursor:pointer;list-style:none;padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}.recipe summary::-webkit-details-marker{display:none}.rtitle{font-weight:800;font-size:15px}.pred-title{color:#64748b;font-size:12px}.scores{margin-left:auto;display:flex;gap:5px;align-items:center}.sc{font-size:12px;border-radius:5px;padding:2px 7px;font-weight:800}.sc.good{background:#dcfce7;color:#166534}.sc.mid{background:#fef3c7;color:#92400e}.sc.low{background:#fee2e2;color:#991b1b}.sc.na{background:#e5e7eb;color:#4b5563}.scale{color:#8a93a3;font-size:11px}.body{padding:0 12px 12px}.reason{background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:9px 11px;margin:4px 0 10px}.reason p{margin:4px 0}.deferred{color:#7c5a00}.metric-line{font-size:12px;color:#64748b}.tbl{margin:10px 0;overflow:auto}.tbl h3{font-size:13px;margin:0 0 5px;color:#374151}.tbl table{width:100%;border-collapse:collapse}.tbl th{background:#f1f5f9;border:1px solid #dfe4ec;text-align:left;padding:6px 8px;font-size:12px}.tbl td{border:1px solid #edf0f5;padding:6px 8px;vertical-align:top}.tbl td:nth-child(1),.tbl td:nth-child(2){width:46%}.steps td:nth-child(1){width:44px!important;text-align:center;color:#8a93a3}.basis{background:#eef2ff;color:#3730a3}.group{background:#ecfdf5;color:#047857}.opt{background:#fff7ed;color:#c2410c}.conf{background:#f1f5f9;color:#475569}.alias{color:#8a93a3;font-size:11px;margin-top:2px}.empty{color:#a0a7b4}.align-score{width:74px!important;text-align:center;color:#64748b;font-size:12px}.ing-match td{background:#fbfffb}.ing-order td{background:#fffbeb}.ing-miss td{background:#fff7f7}.ing-extra td{background:#f8fafc}.pass{color:#166534;font-weight:800}.fail{color:#991b1b;font-weight:800}@media(max-width:780px){header{position:static;max-height:none}main{padding:12px}.scores{margin-left:0}.tbl table,.summary{font-size:12px}.tbl td,.tbl th{padding:4px}}
</style>
</head>
<body>
<header>
<h1>${esc(outTag)} 추출 결과 vs golden 정답 비교</h1>
<p class="note">split: <code>${esc(split)}</code> · run tag: <code>${esc(outTag)}</code> · 생성: ${esc(kstNow())} KST · 추출 중에는 <code>source.json</code>/공개 입력만 사용했고, 이 HTML은 freeze 이후 golden을 읽어 만든 비교표입니다.</p>
<p class="note">Visual estimate 근거는 영상별 접이식 영역에 넣었습니다. null/실패/미적용 결과도 숨기지 않습니다.</p>
<p class="legend">case_score: <span class="lgood">≥4 양호</span><span class="lmid">3~4 보통</span><span class="llow">&lt;3 약함</span></p>
${summaryTable({ ids, freeze, grade, semantic })}
<div class="controls"><button id="btn-all" class="active" onclick="flt('all')">전체</button><button id="btn-prob" onclick="flt('prob')">case&lt;4만</button><button onclick="tog(true)">모두 펼치기</button><button onclick="tog(false)">모두 접기</button></div>
</header>
<main>
${cases.join("\n")}
</main>
<script>
function flt(mode){
  document.getElementById('btn-all').classList.toggle('active', mode === 'all');
  document.getElementById('btn-prob').classList.toggle('active', mode === 'prob');
  document.querySelectorAll('.video').forEach((el) => {
    el.classList.toggle('hide', mode === 'prob' && el.dataset.problem !== '1');
  });
}
function tog(open){
  document.querySelectorAll('details.recipe, details.visual').forEach((el) => { el.open = open; });
}
</script>
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
