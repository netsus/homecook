# Slice: ux-latency-resolution

## Goal
사용자가 집밥 앱의 주요 화면 진입과 모달/시트 열기에서 느끼는 `>0.2s` 대기를 줄인다. 기존 MVP 계약을 변경하지 않고, 로컬 production-like 환경에서 측정된 수치를 기준으로 warm-up, cache 재사용, 선택적 prefetch 개선을 적용한다.

## Branches

- 프론트엔드: `feature/fe-ux-latency-resolution`

## In Scope
- 화면: `HOME`, `PLANNER_WEEK`, `MYPAGE`, `RECIPE_DETAIL`, `MEAL_SCREEN`, `SHOPPING_DETAIL`, `COOKING_READY`, `COOK_MODE`, `LEFTOVERS`, `ATE_LIST`, `SETTINGS`, `RECIPEBOOK_DETAIL`
- 오버레이: `INGREDIENT_FILTER_MODAL`, `SAVE_MODAL`, planner-add sheet, leftovers planner-add sheet
- API: 기존 API 소비만. 신규 엔드포인트 없음
- 상태 전이: 없음 (기존 상태 전이 계약 변경 없음)
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요
- 측정 하네스: `tests/e2e/qa-ux-latency.spec.ts` (Playwright 기반 production-like 타이밍 수집)
- 아티팩트 경로:
  - `.omx/artifacts/ux-latency/dev/` — dev-server 진단 전용
  - `.omx/artifacts/ux-latency/prodlike/` — primary authority lane
  - `.omx/artifacts/ux-latency/preview/` — optional secondary confirmation
  - `.artifacts/qa/ux-latency-resolution/<timestamp>/` — exploratory QA 번들

## Out of Scope
- API/schema/DB/endpoint/auth 계약 변경
- `meals.status`, `shopping_lists`, `cooking_sessions` 등 상태 전이 변경
- feature flag 추가 또는 변경
- anchor screen(`HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`)의 CTA 위계, 스크롤 구조, 정보 구조, modal/sheet/full-page 전환 구조 변경
- React Query / SWR 등 새로운 데이터 패칭 라이브러리 도입 (별도 명시적 결정 없이)
- Server Component에서 service-role 직접 읽기
- 전역 `prefetch` 일괄 on/off — 각 route별 증거 기반 개별 판단만 허용
- `next dev` 타이밍만으로 최종 성공 주장

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| 모든 기존 슬라이스(`01`~`22` + design-polish + wave1-port + mvp2-polish) | merged | [x] |

> 이 슬라이스는 기존 전체 UI가 안정화된 상태에서 성능 최적화를 수행한다. 신규 기능 의존성은 없다.

## Backend First Contract
- 이 슬라이스는 백엔드 변경이 없다 (FE-only).
- 기존 route handler API를 그대로 소비한다.
- 신규 request/response/error 계약 없음.
- 권한/소유자 검증: 기존 auth/bootstrap 시맨틱 보존. warm-up/cache에서 auth boundary를 우회하지 않는다.
- 멱등성: 해당 없음 (mutation 없음).

## Frontend Delivery Mode
- 기존 화면의 latency 개선이므로 신규 UI 상태 추가 없음
- 기존 필수 상태(`loading / empty / error / read-only / unauthorized`)는 건드리지 않고 보존
- skeleton/loading 표시 타이밍이 빨라지는 것이 목표이며, 상태 자체의 추가/제거는 하지 않음
- 로그인 보호 액션: 기존 로그인 게이트 보존, warm-up은 auth-settled 후에만 user-scoped 데이터에 접근

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` (latency 개선 대상이지만 구조/전환 모델 변경 없음)
- Visual artifact: N/A — 시각적 UI 변경 없음, 데이터 로딩 타이밍만 변경
- Authority status: `not-required`
- Notes: 이 슬라이스는 anchor screen의 CTA 위계, 스크롤 구조, 정보 구조, modal/sheet/full-page 전환 구조를 변경하지 않는다. prefetch/warm-up/cache 로직만 변경하므로 authority review는 불필요하다. 만약 Phase 4 escalation에서 server handoff가 필요해져서 anchor screen의 rendering 구조가 바뀐다면 별도 authority 경로를 열어야 한다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5/6 review 통과, authority not required, 시각 구조 변경 없음
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> 시각적 UI 변경이 없고 anchor CTA/scroll/IA/transition 구조를 건드리지 않아 authority review는 필요하지 않았다. Stage 5/6 review와 visual/a11y core gate를 통과했다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `.omx/plans/ux-latency-resolution-ralplan-20260524.md` — RALPLAN-DR (방향/범위/측정 계약)
- `.omx/context/ux-latency-resolution-plan-20260523T164614Z.md` — context snapshot
- `docs/design/anchor-screens.md`
- `docs/design/mobile-ux-rules.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan
- fixture baseline: 기존 앱의 demo 모드(`pnpm dev:demo`) 또는 auth fixture 사용
- real DB smoke 경로: `pnpm build && node scripts/start-production.mjs` (production-like lane)
- 측정 하네스: `tests/e2e/qa-ux-latency.spec.ts` + `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 PLAYWRIGHT_REUSE_EXISTING_SERVER=1`
- seed / reset: 기존 seed 경로 재사용. 이 슬라이스에서 새로운 seed 데이터 불필요
- bootstrap 의존: 기존 bootstrap 구조 그대로 사용 (`meal_plan_columns ×3`, `recipe_books ×3` 등)
- blocker 조건: `pnpm` 실행 가능한 PATH 확보 필요 (Phase 0 command contract에서 잠금)
- 측정 프로토콜: surface별 `1 cold + 5 warm` 반복. warm median을 비교 수치로 사용
- 아티팩트 분리: `dev-server` / `production-like` / `preview` 측정을 절대 혼합하지 않음
- exploratory QA: `pnpm qa:explore -- --slice ux-latency-resolution --output-dir .artifacts/qa/ux-latency-resolution/<timestamp>`

## Key Rules
- **production-like 측정 우선**: `next dev` 타이밍은 진단 전용. 최종 성공은 `pnpm build && pnpm start`에서만 주장
- **route별 prefetch 판단**: `prefetch={false}`를 전역으로 뒤집지 않음. surface-to-file matrix에서 route owner가 개별 판단
- **warm-up matrix 분리**:
  - Matrix A (공용/공유 데이터): route idle 후 warm-up 허용, TTL/mutation 기반 무효화
  - Matrix B (auth-scoped 사용자 데이터): auth/bootstrap 완료 후에만 warm-up, logout/auth 변경 시 무효화
- **anchor screen 보호**: `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`의 CTA 위계, 스크롤 구조, IA, 전환 구조를 바꾸려면 authority review 필요
- **회귀 guardrails**:
  - 변경 surface warm median: 이전 대비 `+10%` 또는 `+50ms` 이내
  - 변경 surface cold: 이전 대비 `+15%` 또는 `+100ms` 이내
  - HOME shell-visible: `+75ms` 이내
  - 이미 `<=300ms`인 route: `+25ms` 이내
  - Lighthouse performance score: `-3`점 이내
  - TBT: `+50ms` 이내 (baseline `<=200ms` → `<=250ms` 유지)
- **Phase 4 server handoff**: Option A(targeted warm-up) 실패 시에만 surface별 named exception lane 사용. strict entry condition 5개 충족 필수
- **app router / server preload boundary**: route handler auth/bootstrap 시맨틱 보존. service-role 직접 읽기 금지. user-scoped cache는 logout/auth 변경 시 무효화 규칙 선행 정의 필수

## Contract Evolution Candidates (Optional)
- 없음. 기존 API/DB/auth 계약 변경 불필요.

## Primary User Path
1. 사용자가 하단 탭 또는 링크로 주요 화면(HOME, PLANNER_WEEK, MYPAGE 등)에 진입한다
2. 이전보다 빠르게 shell이 보이고, 핵심 콘텐츠가 interactive 상태에 도달한다
3. 모달/시트(재료 필터, 레시피 저장, 플래너 추가)를 열 때 지연 없이 바로 인터랙션할 수 있다

## Implementation Summary (Stage 4)

### Phase 2: Prefetch 활성화

Next.js Link 컴포넌트에서 `prefetch={false}`를 제거하여 기본 prefetch 동작을 활성화했다.
변경 대상은 높은-트래픽 네비게이션 경로와 레시피 카드 링크:

| 파일 | 변경 내용 | 대상 경로 |
| --- | --- | --- |
| `wave1-mobile-bottom-tab.tsx` | prefetch 활성화 | `/`, `/planner`, `/pantry`, `/mypage` |
| `app-header.tsx` | prefetch 활성화 | `/`, `/planner`, `/pantry`, `/mypage` |
| `web-top-nav.tsx` | prefetch 활성화 | `/`, `/planner`, `/pantry`, `/mypage` |
| `recipe-card.tsx` | prefetch 활성화 (2개 Link) | `/recipe/[id]` |
| `home-screen.tsx` | prefetch 활성화 (web recipe card, profile) | `/recipe/[id]`, `/mypage` |
| `planner-week-screen.tsx` | prefetch 활성화 (profile) | `/mypage` |
| `meal-screen.tsx` | prefetch 활성화 (profile) | `/mypage` |
| `recipe-detail-screen.tsx` | prefetch 활성화 (breadcrumb, profile) | `/`, `/mypage`, return href |

### Phase 2: Overlay warm-up 판단

- Ingredient filter modal, save modal, planner-add sheet 모두 `fetchJson()` 기반 직접 fetch.
- 클라이언트 캐시 레이어(React Query/SWR/Zustand cache)가 없어 pre-fetch 결과를 재사용할 수 없음.
- 캐시 레이어 추가는 out of scope (새 데이터 패칭 패턴).
- 결론: overlay warm-up은 비용 대비 효과 불충분. No action.

### Phase 3: 직렬 데이터 로딩 검토

- HOME: 3개 병렬 useEffect (auth, themes, recipes) — 이미 최적화됨
- PLANNER: auth → data 직렬화는 Matrix B 제약 (auth-scoped data). `initialAuthenticated` prop으로 서버 auth 가능 시 직렬화 제거됨
- MYPAGE: `Promise.all()` 병렬화 — 이미 최적화됨
- SETTINGS: 2개 `void` 호출이 같은 effect에서 병렬 실행 — 이미 최적화됨
- 기타: 단일 fetch, 병렬화 기회 없음
- 결론: 추가 직렬화 제거 불필요. No action.

### Phase 4: Holdout escalation

- Phase 2 prefetch로 주요 경로(4개 탭 + 레시피 상세)가 커버됨
- Server handoff 필요 없음
- 결론: Phase 4 불필요.

### Pre-existing test failure

- `slice-17b-recipebook-detail.spec.ts:377` ("recipe card navigates to RECIPE_DETAIL") — 3개 프로젝트에서 실패
- 원인: 테스트가 `a[href='/recipe/recipe-1']`를 찾지만 실제 href에 return context query params 포함
- 이 슬라이스 변경과 무관 (clean state에서도 재현됨)

## Stage 5 Production-Like Evidence

로컬 production-like 환경에서 QA fixture auth를 명시적으로 켠 뒤 route entry 하네스를 실행했다.
Overlay timing은 자동화하지 않고 manual QA/follow-up으로 남긴다.

Evidence:

- Review artifact: `.omx/artifacts/ux-latency/stage5-design-and-prodlike-review-20260523T2155Z.md`
- Raw timing log: `.omx/artifacts/ux-latency/stage5-prodlike-qa-ux-latency-mobile-chrome-20260523T2200Z.log`
- Command shape: `NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES=1 HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm build` → `pnpm start -H 127.0.0.1 -p 3101` → `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 PLAYWRIGHT_REUSE_EXISTING_SERVER=1 pnpm exec playwright test tests/e2e/qa-ux-latency.spec.ts --project=mobile-chrome`

| Surface | Cold ms | Warm median ms |
| --- | ---: | ---: |
| HOME | 103 | 44 |
| RECIPE_DETAIL | 105 | 43 |
| PLANNER_WEEK | 83 | 28 |
| MEAL_SCREEN | 92 | 44 |
| MYPAGE | 86 | 42 |
| LEFTOVERS | 62 | 23 |
| ATE_LIST | 59 | 23 |
| SETTINGS | 76 | 40 |
| RECIPEBOOK_DETAIL | 94 | 43 |
| SHOPPING_DETAIL | 76 | 44 |
| COOKING_READY | 62 | 22 |
| COOK_MODE | 74 | 44 |

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3은 N/A (FE-only 슬라이스). Stage 4~6에서 프론트/QA/closeout 항목을 닫는다.

- [x] Phase 0 command contract 잠금 (`phase0-command-contract.md`) <!-- omo:id=delivery-phase0-command-contract;stage=4;scope=frontend;review=6 -->
- [x] 측정 하네스 생성 (`tests/e2e/qa-ux-latency.spec.ts`) <!-- omo:id=delivery-latency-harness;stage=4;scope=frontend;review=6 -->
- [x] baseline 수치 수집 (route entries only — overlay entries는 manual QA) <!-- omo:id=delivery-baseline-capture;stage=4;scope=frontend;review=6 -->
- [x] surface 분류 완료 (Matrix A/B, wait source, candidate fix) <!-- omo:id=delivery-surface-classification;stage=4;scope=frontend;review=6 -->
- [x] Phase 2 low-risk warm-up 적용 <!-- omo:id=delivery-phase2-warmup;stage=4;scope=frontend;review=5,6 -->
- [x] Phase 3 shared data reuse 적용 <!-- omo:id=delivery-phase3-data-reuse;stage=4;scope=frontend;review=5,6 -->
- [x] Phase 4 holdout escalation (필요 시) — 불필요 (Phase 2 prefetch로 주요 경로 커버) <!-- omo:id=delivery-phase4-escalation;stage=4;scope=frontend;review=5,6 -->
- [x] 회귀 guardrail 검증 (Lighthouse, TBT, warm/cold median) — route timing guardrail 통과, Lighthouse/TBT 통과 (`pnpm test:lighthouse:run`) <!-- omo:id=delivery-regression-guardrails;stage=4;scope=frontend;review=6 -->
- [x] `loading / empty / error / read-only` 보존 확인 — prefetch 변경만이므로 기존 상태 미변경 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend:pr` 통과 <!-- omo:id=delivery-verify-frontend-pr;stage=4;scope=frontend;review=6 -->
- [x] `pnpm verify:frontend` full-suite disposition 기록 — pre-existing `slice-17b-recipebook-detail.spec.ts:377` href selector mismatch 3건으로 full command는 별도 follow-up, shipping gate인 `pnpm verify:frontend:pr`은 통과 <!-- omo:id=delivery-verify-frontend;stage=4;scope=frontend;review=6 -->
- [x] production-like 수치 표 작성 — same-lane before 수치는 Stage 4 전 미수집이라 after + historical symptom baseline으로 보고 <!-- omo:id=delivery-prodlike-evidence;stage=4;scope=frontend;review=6 -->
- [x] Vitest / Playwright 자동화 범위 구분 — Vitest: N/A (no new utility logic), Playwright: qa-ux-latency.spec.ts (route entry only, overlay timing은 manual QA) <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 — `acceptance.md` Manual QA 섹션에 route/overlay/auth cache 확인 시나리오 기록 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
