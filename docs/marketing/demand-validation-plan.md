# 무먹 광고 퍼널 v2 수요검증 통합 계획

- 상태: 사용자 승인 contract-evolution + Stage 1 재잠금
- source prototype: `feature/demand-validation-funnel-integration@63f8ef2a019c6d260a96a42fab9d67f727d93557`
- source handoff: `marketing/mumeok-funnel-prototype-v2/INTEGRATION.md`
- Stage 1 author task: `01a0630e-81f1-7f42-8b1b-cb259d1d5997`
- production mutation: false

latest source는 뒤로가기·결과·체험·planner·beta layout, 최종 캐릭터와 탄·단·지 자산을 보강했으며 exact 4문항·4결과 계약은 유지한다. 포팅 시 `evidence/design-qa/final-v4/`와 `final-v5/`를 최신 visual reference로 사용한다.

## 1. 목표

검증된 4문항·4결과 프런트를 `/beta`의 Next.js shell에 안전하게 포팅하고, 익명 퍼널 행동과 이메일 신청을 한 endpoint·한 session row 안의 분리된 write boundary로 측정한다. 결과와 체험은 email 전에 공개하며 production lead readiness와 이미지 권리가 준비되지 않으면 공개 수집을 fail-closed로 유지한다.

## 2. 고정 화면 흐름

`hero → quiz(q1..q4) → result → experience(1..5) → planner_homecook → packaged_food → planner_complete → beta_form → done`

고정 원칙:

- Hero는 `a | b | c | d | default`다.
- 알려진 `utm_content` hook → `ad_variant` → `default` 순서로 Hero를 고른다.
- 모든 Hero는 같은 Q1로 이동하며 이후 데이터와 화면은 동일하다.
- 모든 사용자가 네 문항을 완료한다.
- 결과는 Q3 하나로 결정하고 이메일 전에 공개한다.
- 5단계 체험, 집밥 식단 payoff, 완제품 식단 payoff도 이메일 전에 공개한다.
- beta form 제출 성공 뒤에만 done을 보여 준다.
- 기존 concept/neutral intent/followup은 v2 화면에 없다.

## 3. 단일 API·DB 계약

보존:

- `POST /api/v1/marketing/validation`
- `public.marketing_validation_sessions`
- `{ success, data, error }`
- HttpOnly `mumeok_validation_session`
- local-only Supabase internal scope
- first-write-wins, ordered transition, normalized email unique, duplicate generic success

v2 익명 action:

`view → quiz_started → quiz_completed → result_viewed → experience_started → experience_completed → beta_form_viewed`

PII action:

`lead_submitted`

익명 action은 email, consent, Turnstile field를 거부한다. `lead_submitted`만 email/consent/Turnstile을 받고 `consent_version=marketing-demand-validation-v2`, server time `consented_at`을 기록한다. accepted와 duplicate는 같은 generic success를 반환하고 PII는 response, URL, console/server log, analytics/event payload에 넣지 않는다.

## 4. Attribution

`view`는 아래 public field만 받는다.

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `ad_variant=a|b|c|d|default`

`campaign_key`, `creative_key`, `audience_key`는 server authority다. v2 row는 `creative_key=mumeok_funnel_prototype_v2`로 구분한다. 개발용 `variant` query는 standalone 호환일 뿐 운영 API field가 아니다. unknown query/variant는 frontend에서 `default`로 정규화하고 API unknown field를 만들지 않는다.

## 5. Quiz/result와 legacy 경계

exact 질문·선택지·Q3 mapping은 `docs/marketing/quiz-content-spec.md`가 담당한다.

- v2 answers: exact `q1..q4`
- v2 result: `homecook-passer | eyeballing-master | ingredient-tracker | pro-measurer`
- v2 `target_qualified`: `null`
- v1 old answers/result/target: historical row read only
- v1 `solution_viewed`/`intent_selected`/`followup_submitted`와 planner followup field: v2 write 금지

기존 cookie가 historical v1 row를 가리키면 새 v2 `view`가 새 row/cookie를 발급한다. v1 row에 v2 event를 섞거나 반대로 mapping하지 않는다.

## 6. DB successor 영향

후속 Stage 2 migration은 한 table에 nullable column만 additive로 추가한다.

- `ad_variant`
- `result_viewed_at`
- `experience_started_at`
- `experience_completed_at`
- `beta_form_viewed_at`

result constraint는 새 네 key를 추가하되 old key를 historical compatibility로 보존한다. v2 row는 legacy action/followup/target column을 null로 강제한다. 새 table/event log/RPC/public endpoint는 만들지 않는다.

## 7. Frontend port 경계

포팅 대상:

- `src/Prototype.tsx`의 화면·state·copy·fixture
- `src/prototype.css`의 랜딩 전용 style/motion intent
- `public/assets/funnel/`의 최종 app-owned 자산
- source `tests/funnel.spec.ts`의 사용자 흐름 계약

제외:

- iPhone/Pixel frame과 device selector
- `src/mobile/` runtime
- standalone keyboard/device/status assets
- standalone root CSS와 Vite shell
- npm package/runtime을 운영 Next app에 복사하는 행위

Next.js 공용 shell, semantic HTML, visible focus, 44px target, safe area, screen-reader progress/live state, `prefers-reduced-motion`, 320px 이상 폭을 기준으로 재구성한다.

## 8. 권리·오인 방지 gate

- 실제 YouTube 썸네일은 공개 광고/랜딩 사용 권리 확인 또는 대체 자산이 필요하다.
- 제품 이미지는 사용 권리를 확인하고 `제품 예시`를 항상 표시한다.
- 채널/제품 제휴·추천으로 오인시키는 카피를 금지한다.
- 권리 확인이 없는 asset은 production blocker다.

## 9. 운영·보안 blocker

아래 중 하나라도 없으면 lead는 fail-closed다.

- actual operator privacy data와 canonical `/privacy`
- `MARKETING_LEAD_PROTECTION_READY=1`
- Turnstile production secret, expected action, allowed hostname
- `ALLOWED_MARKETING_ORIGINS`
- edge rate-limit rule evidence
- `MARKETING_CAMPAIGN_END_AT`와 retention 확인
- beta invitation sender email/domain
- full-local migration apply 승인·backup evidence
- 실제 iOS Safari smoke
- paid ads 집행 승인

이 Stage 1은 production/remote/cloud/linked Supabase, migration apply/reset, Caddy/launchd/release/tag/deploy를 수행하지 않는다.

## 10. 후속 Stage 검증

Stage 2는 types/parser/pure Q3 rule/migration/state/idempotency/duplicate/fail-closed/PII boundary를 test-first로 구현한다. Stage 4는 source prototype의 app-owned UI를 Next.js에 포팅하고 Vitest·Playwright·a11y·visual·Lighthouse evidence를 만든다. Stage 6은 `demand-validation-analysis.sql`과 result template을 v2 result/ad cohort 전환 기준으로 갱신한다. 각 작성 Stage는 별도 task reviewer와 authority를 거치며 이 Stage 1 task가 승인하지 않는다.
