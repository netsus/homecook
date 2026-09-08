# Acceptance Checklist

> Current successor lineage: remote #1349 head `bdd0280bddea8ad2caf32c98bd25ac65a70293fe` + security PR #1352 reviewed head `3708cd9fe3e86a85db17946b165ee6456c596af6` merged as latest master `fb1119baae72862efefdb1cad13cc811bbd91a1c`, then normal no-ff integration `f79cc89895e19e388422c4799f23cca5c095d6c0` (tree `b1bc3500da9ef9cbd0fb0b75359cac1d4abdd2f9`). Exact master post-merge checks were 13/13 success with fail/pending/rerun 0, and `postcss>nanoid` `3.3.18` leaves high/critical audit at 0 without changing #12 product contracts.
>
> Initial fetch matched expected `origin/master` `16cfce44d32d5b618742a0e20460df4772a19142`; base drift `c12afbccd15f4935a1a52b9f2c2c23882a5033ff` and latest `origin/master` `c4045705ef72c76f7e7258d10c460f56b6847dd7` were integrated without rebase/reset/force. Contract Evolution is N/A. The current official tuple is `v1.7.32 / v1.5.36 / v1.3.34 / DB v1.3.34 / API v1.2.39`; the approved repository plan remains SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines. #9 PR #1319 merged as `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f` and #10 PR #1331 merged as `2185b59d1b460dac916aa4a4a4a5e061c8b795f0`. Current P1-ML-05 repair/review evidence is `019ffbbc-d4f1-7730-be56-0d8d6d28ce8c` / `019ffbc5-0c4a-7b11-afd9-6346a76b762c`, verdict `APPROVE P0/P1/P2 0/0/0`. Stage 1 independent internal1.5 `019ffc50-0573-7343-9d4d-00434f994398`, security/API `019ffc50-0573-7343-9d4d-002a97d92640`, five-axis/design `019ffc50-0572-7240-85fd-530ca4e8f5a2` reviews are all `APPROVE 0/0/0`; Stage 1 merge is `d5164357e85772833518c5e4766cef020735b7f1` with tree `f65303832851004f07df2b2ee6b3678cc6a56018`. Every edit save from a deleted/null origin requires explicit current active owner meal column selection; DELETE remains no relocation. Stage 4 runtime evidence, Stage 5, fresh final authority task `019fff15-9f62-7602-a092-d140ed5e717a`, and fresh Stage 6 task `01a000d1-d3da-77c3-ace5-a405f6a7a41b` are complete with `PASS/APPROVE P0/P1/P2 0/0/0`. Runtime delivery is merged/completed through PR #1361 merge `4264fe6bd5b3429029ba895a6b79cd32a5d3fa35` and PR #1364 final reviewed/source head `c9b7ef56febc485df69d5ffd144dfab8ffa1330a`, merge/tree `358450e44da691256b0eeb51d8ae131a520b6cbd` / `0682a30d9d5aba11ae7e0ae706e2b13797d0d167`. Final postmerge raw 13 = 12 success + 1 intended skip with bad/pending/rerun 0. OMO report closeout PR #1365 merge/tree is `4f3e8522ebbb6faaf48509154f04bc3e9d7d9d98` / `270e6f8c8d7b1fe2cb3c77233ad44f1753f452e8`, with retained evidence `docs/workpacks/meal-log-ui/omo-report.md`. Manual/device/AT/full WCAG/server-Mac/OAuth/merged-exact rehearsal/R/R+1/R+2/production activation remains pending.

## Happy Path

- [x] existing Planner shell hosts MEAL_LOG with no new bottom tab/route <!-- omo:id=accept-meal-log-ui-shell;stage=4;scope=frontend;review=5,6 -->
- [x] 7-day strip shows one selected day and no weekly analysis <!-- omo:id=accept-meal-log-ui-day-strip;stage=4;scope=frontend;review=5,6 -->
- [x] entries show exact label/brand/badge/quantity/nutrition state/edit/delete <!-- omo:id=accept-meal-log-ui-entry-display;stage=4;scope=frontend;review=5,6 -->
- [x] sheet preselects active date/meal and restores route/scroll/focus on close <!-- omo:id=accept-meal-log-ui-sheet-context;stage=4;scope=frontend;review=5,6 -->
- [x] source switch is exactly 요리한 음식|제품·재료 <!-- omo:id=accept-meal-log-ui-source-switch;stage=4;scope=frontend;review=5,6 -->
- [x] empty query shows owner/generation recent/frequent and confirms suggested amount <!-- omo:id=accept-meal-log-ui-recent;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] stored consumed_local_date controls grouping without current-timezone regroup <!-- omo:id=accept-meal-log-ui-date-authority;stage=4;scope=shared;review=6 -->
- [x] day total is the server projection of all visible non-deleted entries and section subtotals, including deleted-column snapshot sections, with partial/unavailable counts included; server is authority <!-- omo:id=accept-meal-log-ui-totals;stage=4;scope=shared;review=6 -->
- [x] deleted column sections prohibit add CTA and new target only; existing entries retain edit and delete. every edit save from a deleted/null origin requires explicit current active owner meal column selection regardless of quantity/source/date/timezone fields; save fail-closed until selection; server replaces meal_plan_column_id + slot_name_snapshot. DELETE remains no relocation and focus returns to the invoking entry action or deleted section heading <!-- omo:id=accept-meal-log-ui-deleted-column;stage=4;scope=shared;review=6 -->
- [x] create/edit/delete use UUID idempotency; edit/delete use expected revision <!-- omo:id=accept-meal-log-ui-idempotency;stage=4;scope=shared;review=6 -->
- [x] batch edit/delete targets only its own active consumed event and full replay <!-- omo:id=accept-meal-log-ui-batch-event;stage=4;scope=shared;review=6 -->
- [x] product/ingredient edit pins exact evidence and never silently repins mutable current <!-- omo:id=accept-meal-log-ui-evidence-pin;stage=4;scope=shared;review=6 -->
- [x] local date/IANA timezone/nullable instant save together; unknown time is not fabricated <!-- omo:id=accept-meal-log-ui-timezone;stage=4;scope=shared;review=6 -->

## Error / Permission

- [x] loading/empty/error/unauthorized/partial/unavailable/pending/replay/conflict are distinct <!-- omo:id=accept-meal-log-ui-states;stage=4;scope=frontend;review=5,6 -->
- [x] existing entry remains visible during scoped read error where safe <!-- omo:id=accept-meal-log-ui-error-preserve;stage=4;scope=frontend;review=5,6 -->
- [x] cooked cards show date/name/finished/remaining/weight state; missing/unrecoverable blocks g save <!-- omo:id=accept-meal-log-ui-batch-card;stage=4;scope=shared;review=6 -->
- [x] exact product basis or ingredient conversion is required; missing conversion remains correctable 422 <!-- omo:id=accept-meal-log-ui-conversion;stage=4;scope=shared;review=6 -->
- [x] unauthorized preserves return context and other-owner/private/hidden sources remain nondisclosed <!-- omo:id=accept-meal-log-ui-auth;stage=4;scope=shared;review=6 -->
- [x] delete confirms destructive soft delete/reversal, offers cancel and restores invoking focus <!-- omo:id=accept-meal-log-ui-delete-confirm;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] soft-deleted entries are absent from day reads and active aggregates <!-- omo:id=accept-meal-log-ui-deleted-entry-absence;stage=2;scope=shared;review=3,6 -->
- [x] product/ingredient typed union uses one server order/cursor with no client merge <!-- omo:id=accept-meal-log-ui-search-union;stage=2;scope=shared;review=3,6 -->
- [x] no unofficial API/source/field/status/total/search merge is added <!-- omo:id=accept-meal-log-ui-no-invention;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- [x] #9 backend runtime and #10 Planner shell merged-green contracts are consumed without broader Manual/activation promotion <!-- omo:id=accept-meal-log-ui-runtime-predecessors;stage=2;scope=shared;review=3,6 -->
- [x] canonical MEAL_LOG design and independent critique pass before Stage 2 — exact generator/repair/re-review provenance above, `APPROVE 0/0/0` <!-- omo:id=accept-meal-log-ui-design;stage=2;scope=shared;review=3,6 -->
- [x] 390px/320px/desktop evidence and fresh manifest cover all required states <!-- omo:id=accept-meal-log-ui-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] authority report approves density, strip/sheet containment, focus, 44px and no overflow <!-- omo:id=accept-meal-log-ui-authority;stage=4;scope=frontend;review=5,6 -->
- [x] Ready evidence identifies its local deterministic target and explicitly excludes pinned isolated-local or controlled full-local completion claims <!-- omo:id=accept-meal-log-ui-ready-target-boundary;stage=4;scope=shared;review=6 -->

## Manual QA

- verifier: separate Codex reviewers and product-design-authority
- environment: 390px/320px/desktop, keyboard/screen reader, route/back/focus, current/immediate-previous client
- scenarios: selected day, deleted column history, soft-deleted entry absence, totals/incomplete, recent/search, three sources, create/edit/delete/replay/conflict

## Automation Split

### Vitest

- [x] Stage 1 regression invokes actual evaluateDocGate pass and checklist error count 0 <!-- omo:id=accept-meal-log-ui-doc-gate-regression;stage=2;scope=shared;review=3,6 -->
- [x] Stage 1 claims only docs validators/tests/lint/typecheck/audit/diff <!-- omo:id=accept-meal-log-ui-stage1-honesty;stage=2;scope=shared;review=3,6 -->
- [x] implementation records failing component/history tests before code <!-- omo:id=accept-meal-log-ui-tdd-red;stage=2;scope=shared;review=3,6 -->
- [x] independent internal1.5/security/five-axis/design/Stage3/5/6 findings are zero <!-- omo:id=accept-meal-log-ui-reviews;stage=2;scope=shared;review=3,6 -->

### Playwright

- [x] user flow, route/scroll/focus, mutation, replay and conflict are fixed in browser tests <!-- omo:id=accept-meal-log-ui-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [x] Ready handoff pins the exact publication head while leaving current-head and post-merge results to their owning successor gates <!-- omo:id=accept-meal-log-ui-ready-ci-boundary;stage=4;scope=shared;review=6 -->

### Stage 6 / Runtime Closeout And Broader Pending

> - [x] independent Stage 6 closeout — task `01a000d1-d3da-77c3-ace5-a405f6a7a41b`, `APPROVE P0/P1/P2 0/0/0`
> - [x] runtime source merge — PR #1361 merge `4264fe6bd5b3429029ba895a6b79cd32a5d3fa35`
> - [x] final repair publication — PR #1364 reviewed/source head `c9b7ef56febc485df69d5ffd144dfab8ffa1330a`, merge/tree `358450e44da691256b0eeb51d8ae131a520b6cbd` / `0682a30d9d5aba11ae7e0ae706e2b13797d0d167`
> - [x] post-merge repository checks closeout — raw 13 = 12 success + 1 intended skip, bad/pending/rerun 0
> - [x] OMO report projection — PR #1365 merge/tree `4f3e8522ebbb6faaf48509154f04bc3e9d7d9d98` / `270e6f8c8d7b1fe2cb3c77233ad44f1753f452e8`, retained `docs/workpacks/meal-log-ui/omo-report.md`
> - [ ] pinned isolated-local fixtures and controlled full-local read-only target identity/checksum evidence

### Manual Only

- [ ] Manual/device/AT/full WCAG/server-Mac/OAuth/merged-exact rehearsal, capability R/R+1/R+2, production activation evidence remain pending; #12 does not perform or claim them

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
