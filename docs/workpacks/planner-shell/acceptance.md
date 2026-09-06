# Acceptance Checklist

> Stage 1 locks future shell and anchor evidence. Unchecked items do not claim runtime, refreshed design, browser evidence, #12 UI or #13 tombstones exist.
>
> Official authority is the current tuple `v1.7.30/v1.5.34/v1.3.32/v1.3.32/v1.2.37`, the governed plan artifact `docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md` at SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d` (1,018 lines), and relock base/tree `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f` / `6b67f32a3a404b2d7d60a9c231a394c2e17c6c9a`.

## Dependency / Ownership Gate

- [ ] exact chain remains `#8 -> #9 -> (#10,#11) -> #12 -> #13 -> #14`; no successor is promoted by this docs relock <!-- omo:id=accept-planner-shell-chain;stage=2;scope=shared;review=3,6 -->
- [ ] #9 PR #1319 exact head `be93bfc47281e2795c59c0fd1052a4ecf6085837` is consumed only as merged backend code at base `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`; Manual/server-Mac/OAuth, merged-exact server-production/local-rehearsal, capability, R/R+1/R+2 and activation stay pending <!-- omo:id=accept-planner-shell-meal-log-core-readiness;stage=2;scope=shared;review=3,6 -->
- [x] #10 adds no DB schema/migration/RLS/RPC/public endpoint/field/status; Stage 2 backend implementation is N/A except compatibility contract tests <!-- omo:id=accept-planner-shell-no-backend-scope;stage=2;scope=shared;review=3,6 -->
- [ ] #11 COOK_MODE/LEFTOVERS, #12 MEAL_LOG body and #13 tombstone ownership remain untouched <!-- omo:id=accept-planner-shell-adjacent-ownership;stage=2;scope=shared;review=3,6 -->
- [ ] #12 implementation does not start until #10 runtime is separately implemented, reviewed, merged and green <!-- omo:id=accept-planner-shell-meal-log-ui-gate;stage=2;scope=shared;review=3,6 -->

## Shell / Navigation

- [x] existing Planner route and bottom tab remain; no new tab or parallel route <!-- omo:id=accept-planner-shell-route;stage=4;scope=frontend;review=5,6 -->
- [x] internal segment has exactly `요리 계획|식사 기록` with PLANNER_WEEK/MEAL_LOG ownership <!-- omo:id=accept-planner-shell-segments;stage=4;scope=frontend;review=5,6 -->
- [x] selected date is preserved and plan/log scroll-input state remains isolated <!-- omo:id=accept-planner-shell-state-isolation;stage=4;scope=frontend;review=5,6 -->
- [x] route/deep-link/back returns to originating segment/date without duplicate history <!-- omo:id=accept-planner-shell-history;stage=4;scope=frontend;review=5,6 -->
- [x] segment `roving tabindex` leaves only the selected tab at `tabindex=0`; Arrow Left/Right and Home/End stay in the tablist and change focus/selection, and Tab enters the selected panel <!-- omo:id=accept-planner-shell-a11y;stage=4;scope=frontend;review=5,6 -->
- [x] automatic panel/heading focus occurs only for the `deep-link/auth-return/invoker-loss fallback`, never for ordinary segment selection <!-- omo:id=accept-planner-shell-focus-entry;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized actions preserve segment/date/slot/pending action and invoking focus without rendering private data <!-- omo:id=accept-planner-shell-auth-return;stage=4;scope=frontend;review=5,6 -->
- [x] missing/disabled #12 fails closed while 요리 계획 remains usable <!-- omo:id=accept-planner-shell-log-disabled;stage=4;scope=frontend;review=5,6 -->

## Plan-only PLANNER_WEEK

- [x] Recipe Meal status and shopping/cooking actions remain unchanged <!-- omo:id=accept-planner-shell-meal-workflow;stage=4;scope=frontend;review=5,6 -->
- [x] cook_done is never displayed as consumed or goal completion <!-- omo:id=accept-planner-shell-no-consumed;stage=4;scope=frontend;review=5,6 -->
- [x] pinned keep content and legacy_backfill copy remain authoritative <!-- omo:id=accept-planner-shell-pinned-content;stage=4;scope=frontend;review=5,6 -->
- [x] plan nutrition card and new GET /planner/nutrition UI calls are removed <!-- omo:id=accept-planner-shell-remove-plan-nutrition;stage=4;scope=frontend;review=5,6 -->
- [x] new product add and quantity-edit UI are removed <!-- omo:id=accept-planner-shell-remove-product-write;stage=4;scope=frontend;review=5,6 -->
- [x] completed shopping stays read-only with no recipe-reconcile CTA <!-- omo:id=accept-planner-shell-shopping-readonly;stage=4;scope=frontend;review=5,6 -->
- [x] an empty slot shows `비어 있음` and keeps current behavior/future-slice decision; no new add affordance or CTA is implemented unless separately approved as a Contract Evolution Candidate <!-- omo:id=accept-planner-shell-empty-slot;stage=4;scope=frontend;review=5,6 -->

## Legacy / Boundary

- [x] historical product cards show pinned identity/quantity in a read-only section <!-- omo:id=accept-planner-shell-legacy-card;stage=4;scope=frontend;review=5,6 -->
- [x] same-screen detail shows pinned nutrition; no new detail route <!-- omo:id=accept-planner-shell-legacy-detail;stage=4;scope=frontend;review=5,6 -->
- [ ] owner delete is the only legacy mutation and preserves nondisclosure <!-- omo:id=accept-planner-shell-legacy-delete;stage=2;scope=shared;review=3,6 -->
- [x] unauthenticated access keeps existing `401 UNAUTHORIZED`; retained legacy delete keeps existing `401 UNAUTHORIZED`, `403 FORBIDDEN` and `404 RESOURCE_NOT_FOUND` without a new error code <!-- omo:id=accept-planner-shell-errors;stage=2;scope=shared;review=3,6 -->
- [x] no auto meal-log migration, current-version repin, cook/shop/XP/status action <!-- omo:id=accept-planner-shell-no-legacy-expansion;stage=4;scope=shared;review=6 -->
- [x] GET /planner/nutrition, legacy GET/delete and v1 cursor survive at least one compatibility release and until #13 approved compatibility evidence/tombstone contract <!-- omo:id=accept-planner-shell-compat-floor;stage=2;scope=shared;review=3,6 -->
- [x] HOME remains recipe-only and unified food search is not added there <!-- omo:id=accept-planner-shell-home-boundary;stage=4;scope=frontend;review=5,6 -->
- [ ] #12 owns MEAL_LOG UI and #13 owns tombstones <!-- omo:id=accept-planner-shell-successor-boundary;stage=2;scope=shared;review=3,6 -->

## UI States / Authority

- [x] loading/empty/error/unauthorized/shopping-readonly/legacy-readonly are distinct <!-- omo:id=accept-planner-shell-states;stage=4;scope=frontend;review=5,6 -->
- [x] registered 장보기 and shopping_done 요리하기 stay primary, 상세/남은요리 stay secondary, and legacy 삭제 stays destructive tertiary; 320px wraps in that order <!-- omo:id=accept-planner-shell-cta-hierarchy;stage=4;scope=frontend;review=5,6 -->
- [x] canonical PLANNER_WEEK design refresh and independent critic pass before Stage 2 <!-- omo:id=accept-planner-shell-design-critic;stage=4;scope=frontend;review=5,6 -->
- [x] 390px/320px/desktop static evidence covers 16px padding, 44px targets, 7-day containment, at least 2-day overview, user-configured 1/3/5 meal columns, long custom meal names, 200% text scaling, localization expansion, sticky boundaries, bottom-tab safe-area and no page overflow <!-- omo:id=accept-planner-shell-design-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] child sheet/detail traps focus, supports Escape where appropriate, restores the invoking control and preserves scroll context <!-- omo:id=accept-planner-shell-focus-trap;stage=4;scope=frontend;review=5,6 -->
- [x] refreshed product-design-authority report approves before confirmed <!-- omo:id=accept-planner-shell-authority;stage=4;scope=frontend;review=5,6 -->

## Contract / Verification

- [ ] no unofficial API, route, field, status, bottom tab or writer is added <!-- omo:id=accept-planner-shell-no-invention;stage=2;scope=shared;review=3,6 -->
- [ ] Stage 1 claims only docs validators/tests/lint/typecheck/audit/diff <!-- omo:id=accept-planner-shell-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [x] implementation records failing component/route-history tests before code <!-- omo:id=accept-planner-shell-tdd-red;stage=4;scope=frontend;review=5,6 -->
- [ ] independent internal1.5/security/five-axis/design/Stage3/5/6 findings are zero <!-- omo:id=accept-planner-shell-independent-review;stage=2;scope=shared;review=3,6 -->
- [ ] every check started for the current head SHA is terminal green or intended skip; post-merge master QA/Policy/Security/Vercel are green <!-- omo:id=accept-planner-shell-ci;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- Stage 1 uses repository docs/workflow fixtures only; DB bootstrap, external write, remote migration, browser login and OAuth are N/A.
- future deterministic fixtures: owner plan with `registered`, `shopping_done`, `cook_done`; empty day; completed shopping; `keep` pin; `legacy_backfill`; legacy product read/delete; other-owner nondisclosure; unauthenticated return context; and #12 disabled.
- fixture cleanup must be isolated and idempotent. Production/staging writes and destructive legacy migration are forbidden.
- real-data/server verification is read-only and must record the merged-exact head SHA, environment, capture time and unchanged target digests where applicable.

## Manual QA

- verifier: separate Codex reviewers and product-design-authority
- environment: 390px/320px/desktop, physical keyboard/screen reader, safe-area/virtual keyboard, history/back, merged-exact-SHA server-production/local-rehearsal read-only, server-Mac/OAuth
- scenarios: both segments, auth return, #12 unavailable, plan states, legacy read/detail/delete, completed shopping
- evidence split: `PNG static-layout proof` for geometry only; `Playwright history/focus/Escape proof` for browser sequences; `Manual physical keyboard/screen reader/device keyboard proof` for hardware and assistive-technology behavior

### Manual Only

- [ ] legacy endpoint/tombstone removal occurs only under #13 approved compatibility evidence
- [ ] physical-device 390px/320px, VoiceOver/TalkBack-equivalent, server-Mac/OAuth, merged-exact server-production/local-rehearsal and #9 capability/R/R+1/R+2/activation evidence remain pending and are not claimed by Stage 1

## 2026-09-06 기존 조작 복원 검증

사용자의 명시적 복원 요청에 따라 위 empty-slot의 추가 CTA 유보를 기존 조작 복원에 한해 대체한다. 과거 체크 상태는 이 복구의 새 검증을 뜻하지 않는다.

- [x] 요리 계획/식사 기록의 데이터·날짜·뒤로가기 경계를 유지한다.
- [x] 가로 스크롤은 정확히 한 주 이동하며 중앙 복귀가 추가 주 이동을 만들지 않는다.
- [x] 빈/채운 끼니의 추가 메뉴가 실제 날짜·끼니를 기존 recipe picker에 전달한다.
- [x] 날짜 선택은 해당 주간 카드로 이동하며 고정 날짜 바에 가려지지 않는다.
- [x] 7일 모바일 목록과 데스크톱 날짜×끼니 표, 사용자 끼니 설정을 유지한다.
- [x] 갱신/오류/권한 없음에서 새 추가가 차단되고 legacy 읽기/삭제 보호를 유지한다.
- [x] 계획 영양 합계와 완제품 신규 계획 추가는 복구하지 않는다.

검증 근거: [2026-09-06 복원 검증](evidence/2026-09-06-interaction-restoration-verification.md). 운영/실제 계정/독립 Stage 완료와 구분한다.

## 2026-09-06 사용자 승인 출시 전 UI 확인

- 확인 완료: 공개 예시/개인 데이터 분리와 변경 액션 로그인 안내
- 확인 완료: 제공된 랜딩 식단 이미지 기준 날짜·음식·영양 표시
- 확인 완료: 기존 서버 영양값과 정확한 g 환산 보호 유지
- 확인 완료: 관련 회귀, 타입, lint, build 및 로컬 시각 검증
- 미검증/범위 밖: 실제 계정 end-to-end 및 운영 배포 (이번 로컬 UI 작업 범위 밖)

근거: `docs/workpacks/planner-shell/evidence/2026-09-06-prelaunch-ui-verification.md`. 이전 Stage 체크를 새 독립 승인으로 재사용하지 않는다.

### 2026-09-06 후속 UI 재배치 승인

사용자 실기기 피드백에 따라 밝은 포인트, 모바일 날짜 줄만 고정, 데스크톱 두 플래너 상단 메뉴, 계획 카드의 인분·상태 중심 표시, 항상 보이는 식사 영양 그래프와 중복 조작 제거를 적용한다. 구체 범위는 `docs/workpacks/planner-shell/evidence/2026-09-06-prelaunch-ui-plan.md`의 후속 승인 항목이다. 기존 개인 데이터 권한·실제 합계·API/DB 계약은 유지한다.

### 2026-09-06 iPhone 13 mini 후속 승인

사용자는 5개 모바일 하단 탭(홈/요리 계획/식사 기록/팬트리/마이), 상단 중복 segment 제거, 두 플래너 날짜 줄 swipe 주이동과 native 달력 날짜 점프, 기존 화살표·기간행 제거를 요청했다. 계획 카드는 색점+계획인분+1인분당 예상 kcal(전체 pinned 영양÷계획 인분, partial/minimum 및 unknown 보존), 식사기록의 음식별 영양은 상시 표시하며 ‘먹은 양’/‘요리한 음식’ 반복 문구를 제거한다. 인분/섭취량/영양의 원천·권한·API/DB는 유지한다. 375px Safari 계열과 320px 검증을 포함한다.

### 2026-09-06 달력 즉시선택·음식 상세 후속 승인

사용자 실기기 피드백: native 날짜 선택의 확인단계·확대현상을 없애기 위해 앱 내부 버튼형 달력에서 날짜를 누르면 즉시 선택/닫힘으로 교체한다. 월·연도 직접 선택과 주 swipe는 유지한다. 식사 카드의 수정은 음식 상세 sheet로 옮기고 삭제는 이름있는 아이콘으로 표시한다. 목록은 양/kcal/탄단지 그래프, 나트륨은 상세에서만 표시한다. 기존 식사 데이터·수정삭제 API/권한/계산을 재사용하며 새로운 route/API/DB는 만들지 않는다. 홈 무먹 가이드 이미지는 랜딩의 실제 공유 OG 자산을 사용한다.

### 2026-09-06 상세 보류·계획 영양·가이드·랜딩 운영 승인

사용자는 현재 준비 모드에서 식사 이름의 상세 진입을 보류하고 비로그인은 로그인 페이지, 로그인 사용자는 준비 안내로 막도록 요청했다. 상세 구현과 준비 모드 해제는 추후 개발/검증 대상이며 기존 API·복귀 보호 코드는 유지한다. 계획 카드에는 인분과 1인분 기준 칼로리·탄단지를 표시한다. 가이드에는 실제 기능/준비 상태, 랜딩 체험 연결, 기존 귀여운 이미지 자산을 반영한다. 랜딩의 신규 유입/화면은 a·b·c만 운영하고 기본/d/잘못된 값은 a로 정규화하되 UTM과 과거 세션·DB 기록은 보존한다. 공유 결과의 읽기 전용 경로는 별도 Hero 버전이 아니며 그대로 보존한다.

### 2026-09-06 주간 식사 기록·출시 전 가입 차단

사용자 승인: 식사 기록을 주간 세로 날짜 카드로 표시하고 최초 진입 시 선택일(기본 오늘)에 맞춘다. 날짜별 합계는 숫자가 파란 4개 영양 타일, 개별 식사는 양/kcal/탄단지 텍스트로 표시한다. 계획은 전체 kcal/탄단지와 막대를 표시한다. 완성 무게는 추후 수율 기반 예상값·실측 덮어쓰기를 개발할 예정이며 지금 알고리즘/DB 쓰기를 추가하지 않는다. 정보가 없는 계획은 ‘무게 계산 준비 중’으로 표시한다.

선택 날짜는 테두리 없는 파랑/흰 글씨, 오늘은 별도 라벨로 구분한다. 오늘·장보기·남은요리는 버튼 형태로 보강하고 상단 준비 배너를 한 줄 기준선으로 정렬한다. 홈 YouTube 진입의 복귀는 홈이다.

출시 전 소셜 로그인 버튼과 앱 로그인 시작/콜백을 차단한다. 시작은 기존 AUTH_FLOW_UNAVAILABLE/503, 콜백은 교환 전에 준비 안내로 반환한다. 기존 세션·로컬 password QA·인증된 계정 연결은 보존한다. Supabase 외부 직접 인증 API 설정을 변경하는 것은 범위 밖이다. 로컬 랜딩은 허용 origin·공식 캠페인 기간 설정 누락을 로컬 전용으로 보완하고 실제 저장 인증 오류와 구분한다. 새 계정/리드 저장 성공을 가짜로 처리하지 않는다.
