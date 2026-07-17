# planner-nutrition-summary Stage 1 Critique Brief

> 대상: `ui/designs/PLANNER_WEEK.md`, `ui/designs/MEAL_SCREEN.md`의 Planner Nutrition Summary addendum
> 상태: `🟢 통과` — Stage 1 repaired docs/future evidence plan 승인
> 독립 검토: Stage 1 작성자와 분리된 fresh Codex가 initial review와 exact repaired diff re-review를 수행했고, 별도 fresh Codex repair-final owner가 findings를 수리했다.

## 검토 기준

- 공식 화면 v1.5.26의 PLANNER_WEEK compact week/day 계획 열량과 MEAL_SCREEN 핵심 5종 상세 분리가 유지되는가
- `계획 영양`이 실제 섭취, 목표 달성, 의료 조언으로 오해되지 않는가
- `partial/minimum`, `unavailable`, observed complete 0이 시각·문구로 구분되는가
- API에 없는 partial/unavailable 별도 count나 missing-reason field를 UI가 요구하지 않는가
- 기존 prepared-food-planner-entry의 Recipe Meal/product entry 구분, primary CTA, localized scroll, anchor return을 보존하는가
- 390px 첫 화면과 320px narrow에서 summary가 day overview를 과도하게 밀거나 핵심 5종/CTA를 자르지 않는가
- summary loading/error가 기존 content를 지우지 않고 stale range/date/column 응답이 최신 화면을 덮지 않는가
- Stage 4 before/after 390/320/desktop, exploratory QA/eval, real local DB smoke, authority evidence가 machine-readable하게 잠겼는가

## Stage 1.5 Initial Independent Review

- verdict: `STAGE1_5_DOCS_REQUEST_CHANGES`
- Blocker / Important / Suggestion: `0 / 5 / 0`
- content fingerprint: `e0e7f17c177f3f81df31e6b8a3c2995f9fd20fee6e3176010ec3a1f2b5558264`
- repair owner: Stage 1 author/reviewer와 분리된 fresh Codex repair-final owner

### Initial Findings / Repair Record

1. read-only GET과 `ensureUserBootstrapState` 쓰기 경계가 충돌했다.
   - repair: bootstrap은 환경·테스트 사전 준비로만 수행하고, user row와 기본 `아침/점심/저녁` 3 columns를 확인한 뒤 측정을 시작한다. GET route/service는 bootstrap을 호출하지 않으며 request 전후 target/planner write 0을 잠갔다.
2. Frontend Delivery Mode의 empty/read-only/unauthorized 계약이 부족했다.
   - repair: no-entry는 `계획 영양 정보 없음`이고 false 0 금지, summary 자체에는 mutation/repin control 없음, 로그인 뒤 week/date/column return context 복원을 명시했다.
3. current DB가 만들 수 없는 product estimated/mixed fixture가 있었다.
   - repair: recipe direct/estimated/mixed snapshot과 product complete/partial/unavailable direct pin으로 교체했다. aggregate mixed는 recipe/product 조합으로 검증하며 신규 product quality/warning field를 금지했다.
4. fixture/reset/bootstrap 실행 계약이 추상적이었다.
   - repair: fixture는 `lib/mock/qa-fixtures.ts`와 `qa/fixtures/slices-01-05.json`을 `pnpm dev:qa-fixtures`로, real local은 `pnpm local:reset:demo` 뒤 `pnpm dev:local-supabase`로 고정하고 두 evidence를 분리했다.
5. initial independent review 기록과 Stage 4 미승인 경계가 없었다.
   - repair: 이 fingerprint/verdict/findings와 repair 상태를 기록하고, 재검토 전 approval/green을 기록하지 않도록 잠갔다.

## Independent Re-review Approval

- reviewed date: `2026-07-17`
- decision: `RE_REVIEW_APPROVED`
- design critique verdict: `🟢 통과`
- reviewed fingerprint: `83f54e3942b40ceb46af2f917d6981f111a18060e4139ee7a96727651d05f315`
- final Blocker / Important / Suggestion: `0 / 0 / 0`
- verified: six-file Vitest `104 / 104`; source-of-truth, workflow-v2, workpack, automation-spec, bookkeeping, diff validators pass
- review progression: initial `0 / 5 / 0` → separate repair-final → re-review `0 / 0 / 0`
- approved scope: repaired Stage 1 docs와 future evidence plan only
- pending scope: Stage 4 실제 UI/screenshots/authority precheck, Stage 5, final authority, Stage 6
- merge boundary: 이 기록은 final exact-diff 검토 전 merge 승인이 아니다.
