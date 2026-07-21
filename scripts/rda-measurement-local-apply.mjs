#!/usr/bin/env node

import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { generateVolumeCandidates } from "./lib/ingredient-conversion-domain.mjs";
import { runLocalPsqlJson } from "./lib/ingredient-nutrition-local-db.mjs";

const SOURCE_URL = "https://www.nics.go.kr/food/kfi/hsMarinade/list_03";
const LICENSE_URL = "https://www.nics.go.kr/contents/page.do?contentsId=3&homepageSeCode=nics&m=100000165";
const ACCESSED_AT = "2026-07-21";
const PREPARATION_STATE = "as_published";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RDA_LIMITED_MEASUREMENT_FACTS = Object.freeze([
  Object.freeze({ ingredient_name: "간장", grams_per_15ml: 17.7 }),
  Object.freeze({ ingredient_name: "국간장", grams_per_15ml: 17.8 }),
  Object.freeze({ ingredient_name: "고추장", grams_per_15ml: 19 }),
  Object.freeze({ ingredient_name: "된장", grams_per_15ml: 18 }),
  Object.freeze({ ingredient_name: "식초", grams_per_15ml: 15.3 }),
  Object.freeze({ ingredient_name: "설탕", grams_per_15ml: 12.5 }),
  Object.freeze({ ingredient_name: "꿀", grams_per_15ml: 24 }),
  Object.freeze({ ingredient_name: "참기름", grams_per_15ml: 14.1 }),
  Object.freeze({ ingredient_name: "소금", grams_per_15ml: 11.3 }),
  Object.freeze({ ingredient_name: "액젓", grams_per_15ml: 17.9 }),
]);

export class RdaMeasurementApplyError extends Error {
  constructor(code) {
    super(code);
    this.name = "RdaMeasurementApplyError";
    this.code = code;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicUuid(seed) {
  const bytes = createHash("sha256")
    .update(`homecook-rda-measurement-v1:${seed}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildRdaMeasurementPlan() {
  const evidence = RDA_LIMITED_MEASUREMENT_FACTS.map((fact) => ({
    ...fact,
    evidence_id: deterministicUuid(`evidence:${fact.ingredient_name}`),
    evidence_fingerprint: sha256(JSON.stringify({
      source_url: SOURCE_URL,
      accessed_at: ACCESSED_AT,
      ingredient_name: fact.ingredient_name,
      grams_per_15ml: fact.grams_per_15ml,
    })),
  }));
  const assignments = evidence.flatMap((fact) => {
    const generated = generateVolumeCandidates({
      ingredient_id: fact.ingredient_name,
      evidence_id: fact.evidence_id,
      normalized_g_per_15ml: fact.grams_per_15ml,
      preparation_state: PREPARATION_STATE,
      compatibility: "compatible",
      evidence_review_status: "approved",
      evidence_is_active: true,
      source_freshness_status: "current",
      source_review_status: "approved",
      source_is_active: true,
    });
    return generated.candidates.map((candidate) => ({
      ...candidate,
      ingredient_name: fact.ingredient_name,
      assignment_id: deterministicUuid(
        `assignment:${fact.ingredient_name}:${candidate.conversion_profile_code}`,
      ),
      review_status: generated.reason_codes.includes("TIED_CONVERSION_PROFILE")
        ? "needs_review"
        : "approved",
      reason_code: generated.reason_codes.includes("TIED_CONVERSION_PROFILE")
        ? "TIED_CONVERSION_PROFILE"
        : "RDA_LIMITED_FACT_APPROVED",
    }));
  });
  return Object.freeze({
    source_id: deterministicUuid("source"),
    source_manifest_sha256: sha256(JSON.stringify(RDA_LIMITED_MEASUREMENT_FACTS)),
    evidence: Object.freeze(evidence),
    assignments: Object.freeze(assignments),
  });
}

export function buildRdaMeasurementApplySql({ reviewedBy, reviewedAt }) {
  if (!UUID_PATTERN.test(reviewedBy ?? "")) {
    throw new RdaMeasurementApplyError("INVALID_REVIEWER");
  }
  if (!Number.isFinite(Date.parse(reviewedAt ?? ""))) {
    throw new RdaMeasurementApplyError("INVALID_REVIEWED_AT");
  }
  const plan = buildRdaMeasurementPlan();
  const sourceReason = "사용자 요청에 따라 공식 페이지의 제한적 사실값 10건과 출처를 검토함; 전체 표를 복제하지 않으며 개별 공공누리 표시 미확인";
  const assignmentReason = "농촌진흥청 1큰술 실측값에서 유일하게 가장 가까운 대표 등급을 선택함";
  const evidenceRows = plan.evidence.map((row) => `(
    ${sqlText(row.evidence_id)}, ${sqlText(row.ingredient_name)}, ${row.grams_per_15ml},
    ${sqlText(row.evidence_fingerprint)}
  )`).join(",\n");
  const assignmentRows = plan.assignments.map((row) => `(
    ${sqlText(row.assignment_id)}, ${sqlText(row.ingredient_name)},
    ${sqlText(row.evidence_id)}, ${sqlText(row.conversion_profile_code)},
    ${row.distance_g_per_15ml}, ${sqlText(row.review_status)}, ${sqlText(row.reason_code)}
  )`).join(",\n");

  return `
begin;

do $rda_guard$
begin
  if not exists (select 1 from public.users where id = ${sqlText(reviewedBy)}::uuid) then
    raise exception 'INVALID_REVIEWER';
  end if;
  if exists (
    select 1
    from public.nutrition_sources
    where provider_code = 'RDA_NICS'
      and dataset_name = '양념식재료 무게·부피 환산 제한 근거'
      and is_active
      and id <> ${sqlText(plan.source_id)}::uuid
  ) then
    raise exception 'ACTIVE_MEASUREMENT_SOURCE_CONFLICT';
  end if;
end
$rda_guard$;

insert into public.nutrition_sources (
  id, provider_code, dataset_name, source_kind, source_version,
  data_basis_date, fetched_at, freshness_checked_at, freshness_status,
  priority_rank, source_url, license_name, license_url, manifest_sha256,
  review_status, decision_reason, reviewed_by, reviewed_at, is_active
) values (
  ${sqlText(plan.source_id)}, 'RDA_NICS', '양념식재료 무게·부피 환산 제한 근거',
  'measurement_reference', 'accessed-${ACCESSED_AT}', null,
  ${sqlText(reviewedAt)}::timestamptz, ${sqlText(reviewedAt)}::timestamptz, 'current',
  null, ${sqlText(SOURCE_URL)},
  '제한적 사실값 인용·출처표시 (개별 공공누리 표시 미확인)',
  ${sqlText(LICENSE_URL)}, ${sqlText(plan.source_manifest_sha256)},
  'approved', ${sqlText(sourceReason)}, ${sqlText(reviewedBy)},
  ${sqlText(reviewedAt)}::timestamptz, true
)
on conflict (provider_code, dataset_name, source_version, manifest_sha256) do nothing;

with evidence_input(id, ingredient_name, grams_per_15ml, evidence_fingerprint) as (
  values ${evidenceRows}
)
insert into public.measurement_source_evidence (
  id, source_id, evidence_kind, source_subject, preparation_state,
  source_observed_unit, source_observed_amount, observed_volume_ml,
  observed_weight_g, normalized_g_per_15ml, source_url, source_accessed_at,
  evidence_fingerprint, review_status, decision_reason, reviewed_by,
  reviewed_at, version, is_active
)
select
  input.id::uuid, ${sqlText(plan.source_id)}::uuid, 'volume_weight',
  input.ingredient_name, '${PREPARATION_STATE}', '1큰술 (15mL)', 1, 15,
  input.grams_per_15ml, input.grams_per_15ml, ${sqlText(SOURCE_URL)},
  '${ACCESSED_AT}'::date, input.evidence_fingerprint, 'approved',
  ${sqlText(sourceReason)}, ${sqlText(reviewedBy)}::uuid,
  ${sqlText(reviewedAt)}::timestamptz, 1, true
from evidence_input input
on conflict (source_id, evidence_fingerprint, version) do nothing;

with assignment_input(
  id, ingredient_name, evidence_id, profile_code, distance_g,
  review_status, reason_code
) as (
  values ${assignmentRows}
)
insert into public.ingredient_conversion_assignments (
  id, ingredient_id, conversion_profile_id, evidence_id, preparation_state,
  distance_g_per_15ml, candidate_rank, confidence_score, assignment_reason,
  review_status, reviewed_by, reviewed_at, version, is_active
)
select
  input.id::uuid, ingredient.id, profile.id, input.evidence_id::uuid,
  '${PREPARATION_STATE}', input.distance_g, 1, null,
  case when input.reason_code = 'TIED_CONVERSION_PROFILE'
    then 'TIED_CONVERSION_PROFILE: 설탕 12.5g/15mL는 VOLUME_G10과 VOLUME_G15의 정확한 중간값'
    else ${sqlText(assignmentReason)} end,
  input.review_status,
  case when input.review_status = 'approved' then ${sqlText(reviewedBy)}::uuid else null end,
  case when input.review_status = 'approved' then ${sqlText(reviewedAt)}::timestamptz else null end,
  1, input.review_status = 'approved'
from assignment_input input
join public.ingredients ingredient on ingredient.standard_name = input.ingredient_name
join public.measurement_conversion_profiles profile
  on profile.code = input.profile_code and profile.is_active
on conflict (ingredient_id, evidence_id, conversion_profile_id, version) do nothing;

update public.ingredient_conversion_assignments assignment
set review_status = 'approved',
    is_active = true,
    assignment_reason = 'LEGACY_PROFILE_POINTER_ONLY: 계산값은 evidence의 12.5g/15mL이며 VOLUME_G10 값은 사용하지 않음',
    reviewed_by = ${sqlText(reviewedBy)}::uuid,
    reviewed_at = ${sqlText(reviewedAt)}::timestamptz
from public.ingredients ingredient,
     public.measurement_source_evidence evidence,
     public.measurement_conversion_profiles profile
where assignment.ingredient_id = ingredient.id
  and assignment.evidence_id = evidence.id
  and assignment.conversion_profile_id = profile.id
  and ingredient.standard_name = '설탕'
  and evidence.id = ${sqlText(deterministicUuid("evidence:설탕"))}::uuid
  and evidence.normalized_g_per_15ml = 12.5
  and profile.code = 'VOLUME_G10'
  and assignment.review_status = 'needs_review'
  and not assignment.is_active;

do $rda_verify$
declare
  evidence_count integer;
  approved_assignment_count integer;
  review_assignment_count integer;
begin
  select count(*) into evidence_count
  from public.measurement_source_evidence
  where source_id = ${sqlText(plan.source_id)}::uuid and is_active and review_status = 'approved';
  select count(*) into approved_assignment_count
  from public.ingredient_conversion_assignments assignment
  join public.measurement_source_evidence evidence on evidence.id = assignment.evidence_id
  where evidence.source_id = ${sqlText(plan.source_id)}::uuid
    and assignment.is_active and assignment.review_status = 'approved';
  select count(*) into review_assignment_count
  from public.ingredient_conversion_assignments assignment
  join public.measurement_source_evidence evidence on evidence.id = assignment.evidence_id
  where evidence.source_id = ${sqlText(plan.source_id)}::uuid
    and assignment.review_status = 'needs_review' and not assignment.is_active;
  if evidence_count <> 10 or approved_assignment_count <> 10 or review_assignment_count <> 1 then
    raise exception 'RDA_MEASUREMENT_APPLY_COUNT_MISMATCH evidence=% approved=% review=%',
      evidence_count, approved_assignment_count, review_assignment_count;
  end if;
end
$rda_verify$;

commit;

select json_build_object(
  'status', 'applied',
  'environment', 'local',
  'source_id', ${sqlText(plan.source_id)},
  'evidence_count', 10,
  'approved_assignment_count', 10,
  'needs_review_assignment_count', 1,
  'needs_review_ingredients', json_build_array(),
  'legacy_pointer_only_count', 1,
  'source_url', ${sqlText(SOURCE_URL)}
)::text;
`;
}

function parseArgs(argv) {
  const args = {};
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--allow-write") {
      args.allowWrite = true;
      continue;
    }
    if (!["--reviewed-by", "--reviewed-at"].includes(token)) {
      throw new RdaMeasurementApplyError("INVALID_ARGUMENTS");
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) {
      throw new RdaMeasurementApplyError("INVALID_ARGUMENTS");
    }
    args[token.slice(2)] = value;
    index += 1;
  }
  return args;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (
      args.allowWrite !== true ||
      process.env.HOMECOOK_RDA_MEASUREMENT_WRITE_APPROVED !== "1"
    ) {
      throw new RdaMeasurementApplyError("WRITE_APPROVAL_REQUIRED");
    }
    const result = runLocalPsqlJson(buildRdaMeasurementApplySql({
      reviewedBy: args["reviewed-by"],
      reviewedAt: args["reviewed-at"],
    }));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error?.code ?? "RDA_MEASUREMENT_APPLY_FAILED";
    process.stderr.write(`${JSON.stringify({ status: "rejected", error: { code } })}\n`);
    process.exitCode = 1;
  }
}

const invokedUrl = process.argv[1] === undefined
  ? null
  : pathToFileURL(path.resolve(process.argv[1])).href;
if (import.meta.url === invokedUrl) await main();
