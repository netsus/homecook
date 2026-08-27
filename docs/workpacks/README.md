# Workpack Roadmap v2

## Purpose

- 앞으로의 구현은 `작은 세로 슬라이스` 단위로 진행한다.
- 각 슬라이스는 공식 문서 기준의 사용자 가치 하나를 닫아야 한다.
- 같은 슬라이스에서도 개발 브랜치는 `백엔드`와 `프론트엔드`로 분리한다.
- Wave1 프로토타입을 실제 서비스로 포팅하는 후속 계획은 `docs/workpacks/wave1-service-porting-plan.md`를 기준으로 한다.
- 2026-05-11 이후 Wave1 모바일 앱 재포팅의 디자인 기준은 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`다. 기존 Wave1 porting PR의 screenshot/authority evidence는 historical evidence이며, 모바일 목표는 fixed prototype reference 대비 100% parity다.

## Revision Notes

- `v2` full-local Supabase Auth / DB / Storage production contract (2026-08-01 KST, UTC+09:00)
  - 2026-07-30 `remote Auth + local DB/Storage` active 계약을 대체하고, 현재 Mac의 self-hosted Supabase Auth·PostgreSQL·PostgREST·Storage를 단일 authority로 통합한다.
  - stable Auth UUID와 `auth.uid()` RLS, account generation과 owner/read-only/delete/recreate 보호를 유지하며 모든 사용자는 새 local ES256 session으로 한 번 재로그인한다.
  - server-issued OAuth flow ledger, local session binding, Keychain/read-only secret mount, Auth-only public proxy, official S3/rclone restore와 floor 전후 rollback을 implementation/cutover gate로 둔다.
  - hybrid workpack과 migration은 역사/recovery artifact로 유지하며 14일 안정화와 dependency 0 전에는 삭제하지 않는다.

- `v2` hybrid remote Auth / local Data production contract (2026-07-30 KST, UTC+09:00)
  - 2026-07-29 local-first 초기 배포의 `원격 프로젝트 삭제`, `실제 사용자 없음`, `local auth.users 단일 barrier` 전제를 대체한다.
  - Google/Naver/Kakao와 session identity는 remote Supabase Auth에 남기고 application DB/Storage는 서버 Mac의 local Supabase로 이전한다.
  - local `auth.users=0`, private identity epoch mirror, session-liveness HMAC binding, exact JWT claim guard, 기존 409/503 error mapping, remote Hook control-plane, service-role user path 0, semantic restore와 off-Mac rollback evidence를 final cutover gate로 둔다.
  - 이 계약으로 다시 잠근 successor verifier는 `verify-*-hybrid.mjs` 이름을 사용해 local application Data와 remote Auth control-plane을 분리 검증한다. 기존 `verify-*-local-first.mjs` 예약은 해당 workpack이 hybrid relock되기 전까지의 역사적 계획이며 완료 증거가 아니다.

- `v2` cooking/meal-log prepared-food search relevance closeout (2026-07-26 KST, UTC+09:00)
  - Stage 1 PR #1074, backend/data PRs #1097/#1099/#1100/#1101, merged-exact remote verifier PRs #1103/#1104, frontend Stage 4/5/6 PR #1105, official tuple consistency PR #1108이 모두 병합됐다.
  - exact frontend head `0bcdc998`는 독립 Codex quality/security/test review P0-P3 0과 모든 최신 current-head check를 통과한 뒤 merge `19f25aae`로 병합됐다. production read-only smoke는 cursor v1/v2, current nutrition, moderation, owner-private, legacy compatibility, ACL과 remote write/provider-request 0을 확인했다.

- `v2` cooking plan / meal log contract-evolution roadmap (2026-07-23 KST, UTC+09:00)
  - 사용자가 승인한 `요리 계획·식사 기록 분리, 커스텀 레시피, 완제품 검색` 마스터 계획을 정확히 15개 successor workpack(`F0` + #1~#14)과 release train A~F로 고정했다.
  - Stage -1 SECURITY DEFINER 권한 hotfix의 production 배포·8개 anon mutation 무변경 검증·closeout merge를 계약 gate의 선행 증거로 고정한다.
  - 각 successor는 별도 Stage 1 docs PR과 mandatory internal 1.5 gate가 merge되기 전 구현할 수 없으며, `MEAL_LOG`, `PLANNER_WEEK`, `COOK_MODE`, `RECIPE_DETAIL` 변경은 해당 Stage 1에서 요구되는 wireframe/design critique/authority evidence 계획을 먼저 잠근다.

- `v2` cooking/meal-log local-first MacBook relock (2026-07-29 KST, UTC+09:00; 2026-07-30 hybrid 계약으로 대체된 역사적 기록)
  - 초기 production은 서버 MacBook의 local Next.js + local Supabase stack이고, staging은 서버 MacBook 또는 격리된 검증 MacBook의 local rehearsal stack으로 재정의됐다.
  - 초기 배포에서는 remote verifier, remote provider barrier, remote migration apply가 `N/A`이며, F0+#3 joint activation은 local Postgres `auth.users SHARE ROW EXCLUSIVE` write barrier와 서버 MacBook 재설치 LaunchAgent/secret/heartbeat를 authority로 사용한다. 이 lock은 전체 read freeze가 아니므로 Auth Admin/import/dashboard 동결, external attempt 0, 15분 간격 Storage inventory 2회 일치를 별도로 요구한다.
  - 다른 MacBook에서는 저장소 안의 `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`를 portable entry로 사용하고, 그 문서에 잠긴 master plan SHA-256을 원본 외부 계획 파일과 대조한다. 사용자별 절대 경로는 계획의 위치 힌트일 뿐 배포 계약이 아니다.
  - 실제 사용자가 없으므로 최초 quiet window는 일회성 cutover 창으로 고정하고 기간 연장만으로 재승인을 요구하지 않는다. 다만 lock 상실, digest 불일치, 새 auth/external write, restart/restore, secret 교체, Auth 동결 해제는 현재 증거를 무효화하며 quiet 관측과 Storage inventory를 처음부터 다시 수집한다. legacy old-path/unknown-data delete는 자동 승인하지 않고 별도 Manual Only irreversible gate로 남긴다. 향후 remote provider는 별도 contract-evolution이 선행된다.
  - 당시 successor 문서의 `verify-*-local-first.mjs`는 해당 Stage 2가 TDD로 만들 planned artifact였다. 2026-07-30 hybrid relock 대상은 위 `verify-*-hybrid.mjs` 규칙으로 교체하며, 어느 이름이든 파일 부재는 검증 완료를 뜻하지 않고 구현·RED/GREEN 증거 없이 N/A로 닫을 수 없다.

- `v2` nutrition products/planner release QA Stage 2/3 (2026-07-19 KST, UTC+09:00)
  - repair PR #1052 merge `a3301e16` 이후 exact repaired head에서 ingredient `845`, recipe `34`, public products `287,041`, auth A/B anonymization/pin retention, SQL/route 성능을 처음부터 재검증했다.
  - Stage 2/3 evidence PR #1053 merge `05290f65`와 independent code/security/performance/integrated review `0` findings를 반영해 slice 상태를 `in-progress`로 전환한다. Stage 4 real Chrome/authority와 Stage 5/6 closeout은 계속 pending이다.

- `v2` nutrition products/planner release QA Stage 1 (2026-07-18)
  - `nutrition-products-cross-slice-release-qa`를 `docs`로 전환하고 verification-only 최종 release gate를 잠갔다. 기준 ancestry는 master `58a3f805864af9627616c50c117eb3c7f94f72a2`이며 predecessor/closeout는 모두 merged 상태다.
  - Stage 2/3은 fresh local Supabase full migrations/RLS/PostgREST/security/performance와 ingredient `845`, recipe `34`, public products `287,041` 실측 검증 lane, Stage 4는 real Chrome 320/390/desktop + authority evidence lane으로 정의했다. defect는 inline fix가 아니라 separate TDD repair PR 뒤 exact repaired head 재검증 규칙을 따른다.

- `v2` nutrition products/planner standard-basis UX closeout (2026-07-19 KST, UTC+09:00)
  - `prepared-food-standard-basis-ux`의 Stage 1 docs PR #1048과 Stage 4/5/6 frontend PR #1049가 모두 병합됐다.
  - exact implementation head `eae12222`는 independent code review와 authority PASS `0/0/0`, exploratory eval 97, local Supabase·Chrome 100→101g 재계산, 320/390/1280 evidence, current-head 13 success를 통과한 뒤 merge `1976ecc3`로 병합됐다. full-regression/Lighthouse는 정책상 intentional skip이고 production/staging/provider write는 계속 0이다.

- `v2` nutrition products/planner community catalog closeout (2026-07-19 KST, UTC+09:00)
  - `community-prepared-food-catalog`의 Stage 1 docs PR #1043, Stage 2/3 backend PR #1044, performance PR #1045, Stage 4/5/6 frontend PR #1046이 모두 병합됐다.
  - exact frontend head `db9b70d4`는 independent review와 authority PASS blocker 0, exploratory eval 100, local Supabase auth A/B·Chrome account-deletion/anonymized-pin flow, 13개 current-head success를 통과한 뒤 merge `5c88cdae`로 병합됐다. full-regression/Lighthouse는 정책상 skip이고 production/staging/provider write는 계속 0이다.

- `v2` nutrition products/planner public prepared-food closeout (2026-07-18)
  - `public-prepared-food-catalog-import` exact implementation head `7cea8644`가 independent Stage 3 review와 current-head checks를 통과한 뒤 PR #1035 merge `903e7082`로 병합됐음을 canonical closeout에 반영했다.
  - official snapshot 298,288 rows 중 287,041개를 local public catalog로 승격했고, same-input replay `0` write, public external-key duplicate `0`, attribution missing `0`, secret/raw leak `0`을 고정했다. production/staging promotion은 Manual Only다.

- `v2` nutrition products/planner all-recipe closeout (2026-07-18)
  - `all-recipe-nutrition-recalculation` implementation PR #1040의 exact head `3abfb2f6`가 모든 current-head check와 fresh independent repair-final review를 통과한 뒤 merge `a001f53d`로 병합됐다.
  - local inventory `34 = complete 8 + partial 23 + unavailable 3`, same-input replay `0` write, rollback `34`, current aggregate 복원, Meal pin 불변을 closeout 근거로 고정했다. production/staging writes는 계속 `0`이며 Manual Only다.

- `v2` nutrition products/planner all-recipe Stage 1 docs (2026-07-18)
  - `ingredient-nutrition-full-coverage`는 PR #1038 merge `3c737eae` 근거로 `merged`이며, `all-recipe-nutrition-recalculation`은 Stage 1 docs PR #1039 merge 뒤 Stage 2/3 구현·독립 리뷰·수동 local lifecycle을 닫고 Draft implementation PR #1040의 current-head CI를 추적한다.
  - current recipe schema에는 active/deleted marker가 없으므로 checkpoint 시점 `public.recipes` 전체를 전수 재계산 분모로 사용한다.

- `v2` nutrition/products/planner cross-slice closeout (2026-07-17)
  - recipe nutrition, prepared-food catalog/planner entry와 planner nutrition implementation이 PR #1024 merge `39f0e158486d00bfcef51de1b4690b51ed9d5ca3`까지 master ancestry에 있음을 확인했다.
  - Docker Desktop runtime 재시작과 volume 보존 컨테이너 재생성 뒤 local Supabase 12개 구성요소가 running/healthy로 회복됐다. 실제 local auth/PostgREST/browser read-only smoke가 user row·기본 3 columns·영양 GET 200·두 화면 확정 상태·target table digest 불변·외부 write 0으로 통과했다.
  - local demo seed의 unavailable 중심 한계는 isolated PostgreSQL 17.10 mixed/old-pin 증거와 함께 판정한다. physical device/실제 screen reader와 production-scale query 측정은 Manual Only로 남긴다.

- `v2` planner nutrition summary Stage 4 pending review (2026-07-17)
  - `PLANNER_WEEK` compact range/day kcal와 `MEAL_SCREEN` 핵심 5종·quality/warning을 exact read-only 계약에 연결하고 loading/error/empty/stale-response를 기존 content/CTA와 분리했다.
  - targeted Vitest 99/99, fixture Playwright 12/12, frontend PR gate, full a11y/visual/security와 320/390/1280 before-after evidence를 확보했다. Design Status는 `pending-review`이며 fresh authority/Stage 5/6, Linux current-head CI, physical device/screen reader가 pending이다.
  - full local Supabase browser smoke는 Docker daemon이 현재 프로젝트 DB 컨테이너를 시작하지 못해 최종 cross-slice QA 재시도로 넘겼다. Stage 2 isolated PostgreSQL과 fixture browser를 이 항목의 대체 증거로 보지 않는다.

- `v2` planner nutrition summary Stage 3 backend approval (2026-07-17)
  - `planner-nutrition-summary`의 exact read-only `GET /planner/nutrition` backend를 별도 fresh Codex reviewer가 exact head `624c57ed7ba2b154cabbb949d09732eed406b273`에서 `STAGE3_APPROVED`, Blocker/Important/Suggestion `0/0/0`으로 승인했다.
  - targeted Vitest 55/55, isolated PostgreSQL 17.10 2/2, backend gate product 1,560 passed/24 intended skipped와 security 12/12, current-head PR checks 0 fail/0 pending을 기록했다. lifecycle은 `in-progress`, Design Status는 `temporary`이며 Stage 4 이후 UI/authority는 아직 pending이다.

- `v2` planner nutrition summary Stage 1 (2026-07-17)
  - `recipe-nutrition-calculation`과 `prepared-food-planner-entry`의 merged pin 계약을 predecessor로 고정하고 `planner-nutrition-summary`를 `docs`로 전환했다.
  - 공식 `GET /planner/nutrition` 하나, 최대 7일 range/day/column pinned aggregate, PLANNER_WEEK compact kcal, MEAL_SCREEN 핵심 5종 상세, missing-not-zero, bounded batch, read-only, authority pending 계약을 잠갔다.
- `v2` recipe nutrition default selection and availability contract repair (2026-07-16)
  - 사용자가 recipe row에 손질·크기·가식 상태를 추가하지 않고 실제 투입 가식부 사용량과 exactly-one 승인 profile/conversion 선택을 사용하는 최소 contract-evolution을 명시 승인했다.
  - `개/장` exact `size_code + preparation_state` fail-closed와 Recipe Detail `availability_reason`의 missing/temporary/null 의미를 잠갔다. endpoint/status/error code와 target 49 tables는 늘리지 않으며 coverage 13/124, 21/30을 그대로 보존한다.
- `v2` recipe nutrition snapshot attribution contract repair (2026-07-15)
  - 사용자가 recipe snapshot의 계산 결과와 실제 기여 source를 함께 불변 pin하는 최소 contract-evolution을 명시 승인했다.
  - 미구현 target의 `nutrition_profile_id`를 제거하고 exact 6-field `sources_json`을 추가했다. `nutrition_profiles`/`nutrition_values`는 read-only를 유지하며 public API shape·endpoint/status와 target 49 tables는 늘리지 않는다.
- `v2` recipe nutrition calculation Stage 1 (2026-07-15)
  - PR #1005 public-data pilot merge `3866952c3e81bedfd80593f576e5ed6183ec7538`와 PR #1006 공식 계약 merge `6d01d8ac9f4861036ade4e6b97b20275c7f2a6c8`를 exact predecessor로 고정했다.
  - `recipe-nutrition-calculation`을 `docs`로 전환하고 deterministic calculator, immutable snapshot, nullable Meal pin, additive Recipe Detail API와 최소 상태 UI/authority 계약을 잠갔다. 제품 catalog/entry와 planner aggregate는 후속 slice에 남긴다.
- `v2` nutrition predecessor canonical closeout repair (2026-07-15)
  - `public-nutrition-source-acquisition`은 PR #995 merge `f87ae75016a9b709ffc3b706e7ca3720a0940982`와 exact PR head `e88d7c7a6daf51d958c5f63e314c2d98fcadb066`을 근거로 `merged` projection으로 정정했다.
  - `ingredient-nutrition-conversion-model`은 PR #1004 merge `574c078e98a080d0f4812bc593f4a6aa524efcf2`, PR #1005 merge `3866952c3e81bedfd80593f576e5ed6183ec7538`, retained local-pilot evidence, 격리 PostgreSQL migration reset 2회 및 admin viewer denial을 근거로 `merged` projection으로 정정했다. Supabase/PostgreSQL 17 동등성은 남은 위험으로 보존한다.
- `v2` ingredient nutrition conversion Stage 1 (2026-07-14)
  - 당시에는 roadmap canonical projection의 `public-nutrition-source-acquisition` `in-progress`를 보존했고, `ingredient-nutrition-conversion-model` Stage 1을 `docs`로 열었다. 위 2026-07-15 closeout repair가 실제 merge·검증 근거로 현재 projection을 대체한다.
- `v2` nutrition/products/planner extension (2026-07-13)
  - 영양 source 수집 → 재료 영양/대표 환산 → 레시피 계산/표시 → 완제품 catalog/플래너 → 계획 영양 합계를 7개 planned slice로 분리했다.
  - 이 기능군에 한해 기존 Claude 담당 단계를 역할이 분리된 별도 Codex 앱 작업으로 대체하는 사용자 승인 예외를 기록했다.
- `v2` (2026-03-27)
  - slice workflow / OMO pilot 이후 기준으로 planned slice를 다시 검토해 기능 누락, 과대 슬라이스, 선후 의존성을 재정렬했다.
  - `05/06` 순서를 실제 UX 의존성에 맞게 교정했다. 플래너 shell/column이 먼저 잠기고, 그 다음 상세에서 플래너 추가가 온다.
  - `08`, `15`, `17`의 "착수 시점 분할" 메모를 제거하고 stable slice ID로 미리 분할했다.
  - 빠져 있던 `SETTINGS + logout + account actions`를 독립 slice로 추가했다.
  - `MENU_ADD`의 레시피북/팬트리 경로, `RECIPEBOOK_DETAIL` 제거 경로, `manual/youtube`의 조리방법/플래너 연계를 roadmap goal에 명시했다.

## Status 정의

| Status | 의미 |
|--------|------|
| `bootstrap` | 초기 설정 슬라이스 (`01` 전용, 별도 SOP 없이 직접 투입). **의존성 gate에서는 `merged`와 동등하게 간주한다.** |
| `planned` | 착수 전 |
| `docs` | Stage 1 Codex 문서 작업의 README + acceptance.md 작업 중 또는 완료, 구현 착수 전 |
| `in-progress` | 2~4단계 구현 진행 중 |
| `merged` | 모든 브랜치 main merge 완료 |

**Status 전이 규칙**

| 전이 | 시점 |
|------|------|
| `planned` → `docs` | Stage 1 docs PR 오픈 시 |
| `docs` → `in-progress` | Stage 1 merge + Stage 2 착수 시 |
| `in-progress` → `merged` | Stage 6 frontend closeout이 merge까지 반영된 시점 |

Slice Order 표의 Status 값은 위 이벤트가 발생한 PR 또는 closeout bookkeeping update에 포함해 갱신한다.

## Operating Rules

- **Stage 1(Codex 새 작업)**: `stage1-docs-author` 역할의 별도 Codex 작업이 `docs/workpacks/<slice>/README.md`와 `acceptance.md`를 작성하고 main에 merge한다. 단계별 절차는 `docs/engineering/slice-workflow.md`와 `docs/engineering/codex-task-handoff.md`를 참조한다.
- **2단계 시작 조건**: 1단계 문서 PR이 main에 **merge된 후**에만 백엔드 구현(2단계)을 시작한다.
- Slice Order에서 선행 슬라이스 Status가 전부 `merged`인지 확인한 뒤 착수한다.
- **전역 GPT-only 규칙**: Claude는 사용하지 않는다. Stage 1/2/4 작성·구현 작업과 internal 1.5/Stage 3/5/final authority/Stage 6 검토 작업을 역할별 별도 Codex task ID로 분리하고, 작성·구현 작업은 자기 변경을 최종 승인하지 않는다. 같은 작업 안의 서브에이전트는 이 독립 작업 분리를 대신하지 않는다.
- **Launch blocker 예외**: `launch-readiness-blockers`는 광고/배포를 직접 막는 release-hotfix workpack이다. 선행 slice 일부가 미완료여도 fake contact/legal 404, hydration/console error, missing security headers, mixed-content, audit failure를 먼저 닫기 위해 진행한다. 이 예외는 해당 workpack에만 적용되며 product contract, required checks, authority evidence, current-head CI green gate를 완화하지 않는다.
- 과거 slice별 `Codex-only` 승인 기록은 당시 예외가 적용된 이유를 설명하는 merged evidence로 보존한다. 2026-07-30 이후에는 위 전역 GPT-only 규칙이 모든 신규·재개 Stage에 적용되므로 slice별 예외를 새로 추가하지 않는다.
- `workflow-v2` / `OMO` 대상 product slice는 Stage 1 전에 **slice ID / goal / 분기 경로를 고정**한다.
- `planned` 상태 slice에 `착수 시점에 분할 여부 결정` 메모를 남기지 않는다. 분할이 필요하면 roadmap PR에서 `08a/08b`처럼 먼저 쪼갠다.
- 예외: `docs/engineering/` 아래의 repo-engineering automation, workflow tooling, agent 운영 규칙 변경은 제품 workpack roadmap 바깥이다.
- 이런 engineering 작업은 `docs/workpacks/<slice>/README.md` 대신 관련 `docs/engineering/*.md`를 source of truth로 사용한다.
- engineering 작업에서도 관련 governing doc과 검증 문서를 먼저 갱신한 뒤 구현/자동화를 진행한다.
- 백엔드 브랜치는 API, 권한, 상태 전이, 테스트를 먼저 닫는다.
- 프론트엔드 브랜치는 백엔드 계약을 기준으로 `loading / empty / error / read-only / 로그인 게이트` 흐름을 닫는다.
- 디자인이 아직 없어도 기능 가능한 임시 UI로 먼저 개발한다.
- 디자인 확정 후에는 `CSS 변수`, `Tailwind 클래스`, 공용 화면 컴포넌트 중심으로 스타일을 교체한다.

## Branch Convention

- 백엔드: `feature/be-<slice>`
- 프론트엔드: `feature/fe-<slice>`

## Slice Order

| Slice                          | Status    | Goal                                                                                                             |
| ------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `01-discovery-detail-auth`     | bootstrap | 레시피 탐색, 상세 조회, 로그인 게이트, 소셜 로그인 복귀                                                          |
| `02-discovery-filter`          | merged      | HOME 재료 필터 모달과 필터 조회 계약                                                                           |
| `03-recipe-like`               | merged      | RECIPE_DETAIL 좋아요 토글과 로그인 복귀                                                                        |
| `04-recipe-save`               | merged      | 저장 모달, 저장 대상 책 조회/생성, `saved/custom` 제한                                                           |
| `05-planner-week-core`         | merged      | 위클리 플래너 조회, 컬럼 CRUD, 상단 CTA와 상태 뱃지                                                              |
| `06-recipe-to-planner`         | merged    | 상세에서 날짜/끼니/인분 선택 후 Meal 생성                                                                        |
| `07-meal-manage`               | merged    | `MEAL_SCREEN` 조회/수정/삭제와 409 예외 상태                                                                     |
| `08a-meal-add-search-core`     | merged           | `MENU_ADD` shell, `RECIPE_SEARCH_PICKER`, 검색 기반 일반 식사 추가                                               |
| `08b-meal-add-books-pantry`    | merged     | 레시피북에서 추가, 팬트리 기반 추천에서 추가                                                                     |
| `09-shopping-preview-create`   | merged     | 장보기 preview, 대상 검증, 리스트 생성, 상세 이동                                                                |
| `10a-shopping-detail-interact` | merged        | 장보기 상세 조회, 체크 토글, 제외/되살리기 (`exclude→uncheck` 규칙 포함)                                         |
| `10b-shopping-share-text`      | merged      | 장보기 공유 텍스트 생성 (`is_pantry_excluded=false` 항목만 포함)                                                 |
| `11-shopping-reorder`          | merged | 장보기 순서 변경과 미완료 리스트 reorder persistence                                                             |
| `12a-shopping-complete`        | merged   | 장보기 완료 core, `shopping_done` 전이, `is_completed=true`, 완료 직후 read-only lock, 멱등성                   |
| `12b-shopping-pantry-reflect`  | merged        | 팬트리 반영 선택 팝업, `null/[]/선택값` 3-way 처리, 4단계 서버 검증                                              |
| `13-pantry-core`               | merged | 팬트리 조회, 직접 추가, 묶음 추가, 삭제 (`h8` future-screen gate merge 후 착수)                                  |
| `14-cook-session-start`        | merged      | `COOK_READY_LIST`, 요리 세션 시작/취소                                                                           |
| `15a-cook-planner-complete`    | merged | 플래너 경유 `COOK_MODE`, pantry 소진, `cook_done` 전이                                                           |
| `15b-cook-standalone-complete` | merged | 상세 직행 `COOK_MODE`, standalone complete, pantry 소진, leftover 저장                                            |
| `16-leftovers`                 | merged | 남은요리 저장, 재등록, 다먹은 목록                                                                               |
| `17a-mypage-overview-history`  | merged | `MYPAGE` shell, 내 정보, 레시피북 목록/생성/수정/삭제, 장보기 기록 목록                                          |
| `17b-recipebook-detail-remove` | merged | `RECIPEBOOK_DETAIL` 조회, saved/custom 제거, liked 책에서 좋아요 해제                                            |
| `17c-settings-account`         | merged | `SETTINGS`, 로그아웃, 화면 꺼짐 방지, 닉네임 변경, 회원 탈퇴                                                     |
| `18-manual-recipe-create`      | merged      | 직접 레시피 등록, 조리방법 선택, 상세/플래너 연계, `my_added` 반영                                               |
| `19-youtube-import`            | merged | 유튜브 검증/추출/등록, 신규 조리방법 반영, 플래너 연계, `my_added` 반영                                          |
| `20-youtube-real-import`       | merged        | 유튜브 실제 YouTube API description-first 추출, 3-way classification, 서버 세션, RPC 원자적 등록, 슬라이스 19 stub 교체 |
| `21-ingredient-dictionary`     | merged        | ingredient synonym 매칭 연결 + 소량 synonym 시딩으로 YouTube 추출 재료 매칭률 개선 (BE-only, Phase 1+2)           |
| `22-youtube-ingredient-registration` | merged | YT_IMPORT unresolved 재료를 사용자 확인으로 새 표준 재료/동의어에 등록하고 현재 추출 row를 resolved로 전환 |
| `23-youtube-quality-corpus` | merged | YouTube 설명란 파서 품질 코퍼스 fixture + 결정론 채점 하네스 + baseline 측정 (docs + BE/test tooling, UI 변경 없음) |
| `24-youtube-parser-dictionary-hardening` | merged | 결정론 파서 규칙 개선 + 소량 증거 기반 사전 시딩으로 in-corpus F1을 0.80 이상으로 개선 (BE/test/data-only, UI 변경 없음) |
| `25-youtube-bulk-ingredient-resolution` | merged | YT_IMPORT 검수 화면에서 미등록 재료 여러 건을 한 화면에서 일괄 확인·등록하는 bulk resolution sheet (FE-only, 기존 API 순차 호출) |
| `26-youtube-dictionary-seed-uplift` | merged | 코퍼스 증거 기반 재료·동의어 seed migration + dictionary-resolution 채점 레이어 (BE/test/data-only, UI 변경 없음) |
| `pre-27-taxonomy-consumer-alignment` | merged | slice 27 선행: ingredient category shared mapping source + cooking method helper 통합으로 현재 MVP 소비 경로를 같은 기준에 정렬 (BE+FE shared, 신규 DB table 없음) |
| `27-youtube-import-quality-uplift` | merged | YouTube 설명란 파서 추출 품질 + import readiness >= 0.80 달성. 결정론 파서 규칙/사전 시딩/50건 corpus evidence + fixture-backed full-flow E2E (LLM 없음) |
| `27b-youtube-source-fallback` | merged | YouTube 설명란에서 재료만 추출된 영상에 caption/transcript fallback으로 조리 과정 보충 + 부분 추출 draft UX (LLM 없음) |
| `28-external-ingredient-data-ingest-gate` | merged | 식약처/농식품올바로 등 외부 재료 데이터를 production 직적재 없이 file batch -> staging/review -> approved seed artifact 경로로만 유입 |
| `taxonomy-v2-contract-evolution` | in-progress | 재료 8대분류/21소분류와 조리법 6그룹/20대표 method로 확장하는 v2 taxonomy 계약을 v1 label 호환, additive DB/API, migration/reclassification, frontend consumer sweep 기준으로 잠금 |
| `29-youtube-author-comment-fallback` | merged | YouTube 설명란이 비어 있거나 부족한 영상에서 영상 작성자 top-level 댓글만 보조 source로 사용해 레시피 draft 보강. 일반 댓글/reply/LLM 없음 |
| `31-recipe-media-tags` | in-progress | YouTube 등록 레시피 썸네일 영속화, 직접 등록 이미지 업로드, YouTube/직접 등록 공용 서버 태그 자동 생성 |
| `32-youtube-visual-quantity-enrichment` | in-progress | YouTube 공개 텍스트 추출 이후 화면 속 수량 텍스트 기반 보강, quantity review fields, register confirmation contract, visual cache/events |
| `33-youtube-i031-direct-extraction` | merged | 기존 YT_IMPORT에서 exact cv-goal-i031-ocr selector/final 추출을 localhost strict mode로 직접 실행하고 기존 재료 표준명 검수 흐름에 연결 |
| `youtube-async-extraction-notification` | merged | request-independent worker, durable 알림·재진입, 검수/등록, non-manual implementation과 독립 Stage 6 검토를 완료하고 PR #1362로 병합. production 설치·rollout·physical-device 확인은 기존 Manual Only 경계 유지 |
| `youtube-extraction-truthful-progress-eta` | in-progress | 실제 stage floor + gated ETA range 구현 진행 중. Stage 1, Phase A/B DB/RPC/schema-v2, Phase C worker IPC, Phase D ETA/API를 병합했고 Phase E frontend 구현·브라우저 evidence는 완료, 최종 closeout은 pending |
| `admin-foundation` | merged | 런칭 초기 운영용 최소 내부 관리 기반. /admin 읽기 전용 shell, 사용자 조회, 운영 이벤트/감사 로그 조회. admin_members 기반 접근 제어, service-role fail-closed, PII 최소화 |
| `planner-column-customization` | merged        | 끼니 컬럼 기본 3개 + 설정 커스터마이징(이름 변경/추가/삭제/순서 변경), 최소 1~최대 5, PLANNER_WEEK 동적 컬럼               |
| `wave1-port-foundation` | merged | 공통 shell, 공용 UI 프리미티브(Button/Chip/Card/Modal/Sort Dropdown), CTA 위계, spacing/safe-area 정비 — Phase4 foundation re-audit PR #432 merged |
| `wave1-port-discovery-detail` | merged | Historical closeout은 merged 상태로 보존. 다음 작업은 fixed prototype 기준 Slice B Phase4 prep 후 HOME/RECIPE_DETAIL/save modal/login 재포팅 |
| `wave1-port-planner-meal-add` | merged | PLANNER_WEEK 주간 이동/이모지·배지 제거/CTA 정리, MENU_ADD 2열 옵션, MANUAL_CREATE 재료 모달, MEAL_SCREEN 레시피 클릭/삭제 아이콘/status selector 제거 |
| `wave1-port-shopping-cooking` | merged | SHOPPING_FLOW 프리뷰 정리, SHOPPING_DETAIL 구매/제외 섹션·버튼 배치·title 표시, COOK_MODE 단일 스크롤 뷰·control 제거·하단 sticky |
| `wave1-port-pantry` | merged | PANTRY 추가/묶음 추가 CTA, category chip rail, 보유 재료 카드, delete mode checkbox, selected items bottom `제거하기` CTA |
| `wave1-port-account-library-leftovers` | merged | MYPAGE/SETTINGS polish, LEFTOVERS/ATE_LIST 버튼·문구 정리, RECIPEBOOK_DETAIL custom book menu |
| `wave1-prototype-repair` | merged | service 재포팅 전 `claude-design-260505-wave1` prototype의 navigation, modal/interaction, visual, functional-logic 문제를 repair하고 fixed prototype을 freeze |
| `wave1-derived-state-ui-prep` | merged | Phase4 재진행 전 prototype에 직접 없는 loading/skeleton/empty/error/unauthorized/not-found/submitting 상태 UI를 `prototype-derived design`으로 분류하고, 공통 규칙 + 공통 컴포넌트 + HOME/RECIPE_DETAIL/PLANNER_WEEK 대표 적용을 잠갔다 |
| `design-polish-slice1-typography-tokens` | merged | 앱 전역 font-weight 경량화, `--olive` 직접 사용 제거, 레거시 브랜드/olive hex→역할 토큰 교체. 웹 토큰 변경 없음, Jua 미복원 |
| `design-polish-slice2-app-shell-home` | merged | 앱 셸 하단 탭 지속성·플래너 아이콘 밀도·헤더 정렬 확인, HOME 재료 필터 모달 2열 그리드·팬트리 시트 패밀리 정합·버튼 색상 토큰 정리 |
| `design-polish-slice3-recipe-detail` | merged | RECIPE_DETAIL 인분 stepper −/+ 버튼 크기 축소·균형, 히어로 메트릭 숫자 font-weight 경량화, 인분 아이콘·메트릭 컨트롤·stepper 색상 wave1 prototype 정합 |
| `design-polish-slice4-planner-meal-add` | merged | PLANNER_WEEK/MEAL_SCREEN 식사추가 full-page→modal/sheet 전환, LeftoverPicker 카드 버튼 우측 배치·텍스트·메타데이터 형식 개선, RecipeSearchPicker 검색 아이콘 교체·확대. anchor-extension, Codex fallback authority pass |
| `design-polish-slice5-manual-youtube` | merged | MANUAL_RECIPE_CREATE / YT_IMPORT 재료 행 밀도·조리법 입력 UX·조리방법 색상·재료 validation 문구 polish. API/DB 변경 없음 |
| `design-polish-slice6-shopping-cooking-pantry` | merged | MEAL_SCREEN 개별 요리 진입 시 선택 meal planned_servings 보존, COOK_MODE 재료 compact list를 조리 단계 바로 위로 이동. API/DB 변경 없음 |
| `design-polish-slice7-mypage-settings-account` | merged | MYPAGE 레시피북 목록/장보기 기록에서 상세 진입 후 뒤로가기를 누를 때 원래 목록 맥락으로 직접 복귀. API/DB 변경 없음 |
| `mvp2-polish-mypage-return-loading` | merged | MYPAGE loading 헤더 정렬 안정화, 레시피북/장보기 상세 뒤로가기 MyPage 홈 flash 제거, 장보기 상세 loading skeleton 도입. API/DB 변경 없음 |
| `mvp2-polish-planner-meal-add-modal` | merged | PLANNER_WEEK/MEAL_SCREEN 식사추가 follow-up: 검색/레시피북/팬트리/유튜브 modal entry, picker 뒤로가기 버튼 공용화, 남은요리 뒤로가기, 유튜브/직접등록 option typography 정리. API/DB 변경 없음 |
| `mvp2-polish-manual-recipe-form` | merged | MANUAL_RECIPE_CREATE follow-up: 기준인분 stepper, 조리방법 선택 필수화, 저장 클릭 후 필드별 validation, 재료 선택 모달 선택 요약/취소/active 버튼 정리. API/DB 변경 없음 |
| `ux-latency-resolution` | merged | 주요 화면 진입·모달/시트 열기의 >0.2s 체감 대기 개선. FE-only, targeted warm-up/cache reuse/prefetch. API/DB/auth 변경 없음 |
| `cook-mode-whole-board` | implementation | PR #711 exact head `55b93ad7`가 merge `2f8569cb`로 병합되어 whole-board runtime predecessor는 존재하지만, roadmap closeout status는 broader lifecycle 증거와 분리해 계속 `implementation`으로 유지한다. API/DB 변경 없음 |
| `recipebook-diary-port` | implementation | 레시피북을 작은 책/다이어리처럼 느끼게 하는 FE-only 포팅. `MYPAGE` 책장형 목록과 `RECIPEBOOK_DETAIL` desktop 목차 rail + recipe area split, mobile 목차형 상세를 적용하며, full page-turn reader는 read-only preview 계약이 승인될 때까지 scope 밖 |
| `33a-user-progress-foundation` | merged | 전용 progress ledger/read model과 `GET /users/me/progress` contract를 backend-first로 구현. 4개 canonical event writer/backfill/reconcile. `GET /users/me`는 profile-only 유지 |
| `33b-mypage-progress-ui` | merged | MYPAGE 하드코딩 레벨 subtitle을 실제 `GET /users/me/progress` 기반 compact progress UI로 교체. progress soft-fail. 390px/320px evidence 확보 |
| `33c-badges-quests-toasts-tutorial` | merged | 33a ledger/progress 기반 배지, 퀘스트, XP toast, 튜토리얼 퀘스트 experience 설계 및 구현. leaderboard/competitive rank/pressure streak 제외. 운영 배포 환경의 service-role/migration smoke는 Manual Only follow-up |
| `34a-growth-model-contract-evolution` | merged | 33c 이후 성장/레벨링 v2 공식 계약 잠금. `planner_registered` XP source, non-XP activity ledger, 레벨 곡선 v2, 등급명, toast stack, archive, MYPAGE profile integration, badge shape/image concept 원칙 |
| `34b-growth-backend-model` | merged | 34a 계약 기반 backend model 구현. XP writer v2, `user_growth_activity_events`, level curve v2/grade, backfill no-toast, notification priority/archive server logic |
| `34c-growth-notification-ui` | merged | priority toast stack, `level_up`/badge/quest/XP UI, archive client/surface, 장보기 안내 문구 적용 |
| `34d-mypage-growth-profile-assets` | merged | MYPAGE 프로필 영역 안에 등급/레벨/XP/대표 배지 통합, 잠긴 배지 hint, badge/grade concept image artifact와 SVG/CSS production component 검토 |
| `34e-growth-profile-visual-polish` | in-progress | 34d 후속 polish: MYPAGE 성장 프로필을 실제 통합 header로 재구성하고 desktop blank-card regression, badge emblem 품질, `집밥 러너` no-footwear visual을 수정 |
| `35a-growth-achievement-album-contract-evolution` | docs | 퀘스트를 튜토리얼 전용으로 축소하고, Clay→Titanium 등급/업적 앨범/stamp 수집/MYPAGE modal button entry 계약을 공식화 |
| `35b-growth-achievement-album-backend` | merged | 35a 계약 기반 `user_achievement_awards`, 업적 앨범 projection, tutorial category, grade fields, silent backfill backend 구현 |
| `35c-mypage-achievement-album-ui` | in-progress | MYPAGE profile header 안에 성장 상태를 통합하고 등급/업적/튜토리얼/알림을 modal/bottom sheet로 제공 |
| `36a-recipe-tags-contract-evolution` | docs | 레시피 태그를 서버 추천 + 사용자 검수 기능으로 승격하고 `tags`/`recipe_tags` 정규화 모델, 검색, HOME theme seed, P0 의미 태그 목록을 공식 계약으로 잠금 |
| `36b-recipe-tags-model-write` | merged | `tags`/`recipe_tags` additive migration, P0 seed, tag normalization, YouTube/manual write path, `recipes.tags` projection writer 구현 |
| `36c-recipe-tags-search-themes` | merged | `GET /recipes?tag=`, 제목+승인 태그 검색, `GET /tags`, HOME theme generation을 cursor-stable dedupe 전략으로 구현 |
| `36d-recipe-tags-rules-backfill` | merged | P0 의미 태그 rule fixture와 기존 레시피 backfill dry-run/report, usage count reconcile, P1 후보 승인 정책 구현 |
| `36e-recipe-tags-frontend` | ready-for-review | MANUAL_RECIPE_CREATE/YT_IMPORT 태그 추천·검수 UI와 HOME 태그 검색/filter/theme chip UX 구현 |
| `launch-readiness-blockers` | docs | 광고/배포 차단 release-hotfix 예외: legal/trust/SEO 404와 fake contact, HOME hydration/guest console noise, security headers, FoodSafety mixed-content, PostCSS audit blocker를 Codex-only 세션 분리로 닫음 |
| `hybrid-auth-local-data-production` | superseded | 2026-08-01 full-local 계약이 active authority를 대체했다. 기존 구현/migration은 14일 recovery·dependency inventory용 역사 artifact로 보존 |
| `full-local-supabase-production` | docs | PR #1263 Stage 3 deployable app/runtime authority가 OAuth flow ledger, callback/refresh/guarded Data/Storage/logout, loopback admin, request attestation과 secret boundary를 병합했다. activation은 explicit env+DB control이며 provider live callback/link, Cloudflare, remote final backup, off-Mac restore 2회, first local mutation/cutover는 Manual Only/pending |
| `auth-provider-memory-linking` | merged | 세 provider 이메일 필수, built-in Kakao/Naver 표준 claim gate, 최근 provider 기억/전환 확인, same-user identity linking과 different-user conflict 보호, 수동 provider 연결. PR #967 merge |
| `service-about-guide` | merged | 공개 `/about` 서비스 가이드, `PRIMARY_WEB_NAV_ITEMS` 웹 공통 5메뉴, HOME `집밥 둘러보기` guide+theme rail, MYPAGE 임시 도움말 제거. docs PR #978 + FE PR #979 merge. 커뮤니티/제안 게시판은 후속 슬라이스 |
| `service-brand-rebrand` | merged | 정식명 `무엇을 먹든`, 짧은명 `무먹`, 신규·빈 nickname `무먹러`, system notification read-time copy 호환을 API/DB shape와 기술 식별자 변화 없이 잠금 |
| `service-brand-home-lockup` | merged | HOME mobile `HomeAppBar`와 desktop HOME `WebTopNav` brand area에 큰 `무먹` 아래 작은 `무엇을 먹든`을 세로 2단으로 표시. non-HOME 단독 표시와 nav geometry/interaction 보존 |
| `service-brand-image-assets` | merged | 선택한 파란 `무먹` 심볼을 HOME/non-HOME header, favicon, 설치/Apple 아이콘, OG/Twitter metadata에 적용하고 authority·탐색 QA·current-head 전체 CI를 통과 |
| `service-brand-icon-edge-treatment` | merged | favicon은 투명 외곽, 설치/PWA·Apple 아이콘은 full-bleed 파란 배경으로 분리하고 source/header/OG/Twitter 승인본을 보존 |
| `public-nutrition-source-acquisition` | merged | 공공 영양 source를 versioned raw snapshot + manifest로 수집하고 schema/pagination/license/key 비노출을 fail-closed 검증한 뒤 approved promotion 입력을 만든다 |
| `ingredient-nutrition-conversion-model` | merged | 핵심 영양 profile과 15mL당 약 6/10/15/20/25g 대표 환산 등급, 분리된 원문 evidence/assignment, 개당 중량을 승인 기반 immutable model로 구현한다 |
| `recipe-nutrition-calculation` | merged | 레시피 재료·인분·대표 환산으로 completeness/quality와 scalable/fixed vectors를 계산하고 immutable snapshot을 생성/pin/backfill하며 Recipe Detail additive API와 최소 상태 UI를 제공한다 |
| `prepared-food-catalog` | merged | 승인 public 완제품 + 사용자 private manual 제품 catalog, immutable nutrition version, owner/public read-only/soft-delete 정책을 구현한다 |
| `prepared-food-planner-entry` | merged | 완제품을 Recipe Meal과 분리해 플래너에 추가/수정/삭제하고 shopping/cooking/leftover/XP에서 구조적으로 제외한다 |
| `planner-nutrition-summary` | merged | pin된 recipe/product snapshot만 끼니·날짜·주간 `계획 영양`으로 합산하고 결측/partial/quality를 보존한다. PR #1024 merge, authority·전체 QA·real local Supabase browser smoke를 통과했으며 수동 기기/규모 측정만 Manual Only로 남는다 |
| `ingredient-nutrition-full-coverage` | merged | local inventory 845개를 approved exactly once 838 + strict excluded 7로 전수 분류하고 `unclassified=0`/replay 0-write를 닫았다. PR #1038 merge `3c737eae` |
| `all-recipe-nutrition-recalculation` | merged | 전체 `public.recipes`를 bounded checkpoint로 재계산하고 partial/unavailable을 보존한 채 replay 0-write·rollback·Meal pin 불변을 닫았다. PR #1040 merge `a001f53d` |
| `public-prepared-food-catalog-import` | merged | 검수된 공공 완제품 287,041개를 local catalog로 승격하고 stable key, attribution, rollback과 검색 경로를 닫았다. PR #1035 merge |
| `community-prepared-food-catalog` | merged | 공공 영양DB·사용자 등록·비공개 보관을 구분하고 공동 검색, owner-only 수정·삭제, 신고, 탈퇴 후 익명 read-only·기존 pin 보존을 구현했다. PR #1046 merge |
| `prepared-food-standard-basis-ux` | merged | 고형 100g·액상 100mL 비교, source/label, 추정 금지를 교차 잠그고 MEAL_SCREEN g/mL 수량을 1g/1mL 단위로 안전하게 편집하도록 수리했다. PR #1049 merge `1976ecc3` |
| `nutrition-products-cross-slice-release-qa` | merged | 영양 데이터, 권한, UI, 계산을 실제 local DB/browser/current-head checks 기준으로 교차 검증했다. Stage 2/3 #1053, historical evidence #1059, TDD repairs #1060/#1063, final evidence/authority/Stage 5/6 #1064 merge `c9315520` 완료 |
| `prepared-food-search-relevance` | merged | 브랜드+제품명 통합 정규화, public/private 분리 index, typed relevance·정수 tuple cursor·IME 최신 요청 제어를 구현하고 287,041건 품질·성능 및 retained production read-only smoke를 통과했다. 원본 apply/concurrent-index provenance 미보존으로 canonical external-smoke projection은 pending Manual Only다. PR #1105 merge `19f25aae` |
| `account-session-generation-foundation` | merged | JWT session-bound account generation, lifecycle watermark, DB cutover fence/Auth Hook/quarantine/outbox와 personal-writer inventory를 feature-off foundation으로 잠근다 |
| `product-ingredient-link-foundation` | merged | 승인 Contract Evolution PR #1254와 Stage 2/3 backend/data PR #1255 merge `d30ee2c8` 완료. PR #1256은 Stage 4 HOME/PANTRY consumer TDD, 독립 code/security/Stage 5 findings `0/0/0`, exact head `27fc07c4` 전체 checks green 뒤 `5e9773f5`로 merge됐다. Stage 6 closeout PR #1262도 merge `5cf91557`로 완료됐다. 기존-schema/full-local/query-plan 운영 증거는 Manual Only |
| `recipe-visibility-read-hardening` | merged | PR #1228로 Stage 2~6 runtime/client/review/current-head closeout 완료. private personal recipe soft delete/public fork/tag visibility, quarantine visibility upper bound, generation-aware image registry·private storage·outbox를 먼저 잠근다 |
| `recipe-snapshot-authority-foundation` | in-progress | PR #1218/#1219 구현과 PR #1231/#1232/#1233/#1251 hybrid evidence를 역사로 보존한다. Full-local Stage 3 deployable app/runtime authority PR #1263은 병합됐고 Stage 2 fail-closed verifier를 구현했지만 merged-exact 실행, activation과 Manual Only 증거는 pending이다 |
| `personal-recipe-editor-decoupling` | in-progress | PR #1238 backend 경계와 PR #1243 capability-off shell/UI evidence, PR #1246 hybrid verifier는 역사로 보존한다. Full-local Stage 2 verifier PR #1271은 `27572ac9` 병합 및 merged-exact local fixture 검증을 통과했고, existing shell/consumer Stage 4 재검증과 독립 Stage 5 no-visual-drift review도 완료됐다. Stage 6 lifecycle closeout과 activation/Manual Only 증거는 pending이다 |
| `personal-recipe-customization-write-core` | in-progress | Stage 3 backend runtime merge checkpoint: PR #1274 head `a27be0c7`는 독립 code/quality 및 security/DB 재리뷰 APPROVE 0/0/0과 latest unique Ready checks 15/15 success를 거쳐 `05683e4d`로 merge됐고 exact-merge verifier도 `POSTMERGE_VERIFIED YES`, P0/P1/P2 0/0/0을 확인했다. 서버 MacBook/local rehearsal, route/service·통합 E2E, terminal workpack closeout review, #7/#8와 R+2 activation은 pending이다 |
| `recipe-content-snapshot-future-propagation` | in-progress | Stage 2/3 PR #1278 merge `ef5903b1`와 PR #1281 exact head `aab9a65e` merge `2173737e`로 actual owner editor, additive recipe/Meal revision, owner-only edit_context와 server-only joint capability projection runtime이 병합됐다. Design Status는 confirmed지만 Manual/server-Mac/OAuth, #8 R/R+1 gate와 R+2 activation이 남아 전체 lifecycle은 `in-progress`; approval/verification projection도 완료로 올리지 않는다 |
| `cooked-batch-weight-ledger` | in-progress | cooked batch content-only nutrition, 전체/잔량 중량, append-only quantity/lifecycle event, weighted/unweighed/unrecoverable와 RPC-only mutation을 구현한다 |
| `meal-log-core` | in-progress | Stage 2 backend PR #1319 exact head `be93bfc4`가 독립 Stage 3 P0/P1/P2 `0/0/0`, current-head checks 25(23 success + 2 intended historical skips) 후 base `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`로 merge됐다. Manual/server-Mac/OAuth, merged-exact server-production/local-rehearsal, capability, R/R+1/R+2와 activation은 pending이므로 전체 lifecycle은 `in-progress`다 |
| `planner-shell` | in-progress | PR #1331 merge `2185b59d1b460dac916aa4a4a4a5e061c8b795f0`로 Stage 4~6 runtime delivery가 merged-green이고 OMO report가 완료됐다. 전체 lifecycle은 in-progress이며 Manual/server-Mac/OAuth, merged-exact server-production/local-rehearsal, physical-device/AT, capability R/R+1/R+2, production/activation은 pending이다 |
| `cooked-batch-weight-ui` | in-progress | UI-only Stage 4, fresh Stage 5·final authority·Stage 6 `APPROVE 0/0/0`와 current-head checks를 거쳐 PR #1323이 merge `7c7d25a1d4deb930ddcf85611bb57f5fe14f00a0`로 병합됐다. Manual/actual-device·AT/full-WCAG, server-Mac/OAuth, R/R+1/R+2와 activation은 pending이므로 전체 lifecycle은 `in-progress`다 |
| `meal-log-ui` | merged | #12 runtime delivery merged/completed. PR #1361 merge `4264fe6bd5b3429029ba895a6b79cd32a5d3fa35`, final reviewed/source head `c9b7ef56febc485df69d5ffd144dfab8ffa1330a`, repair PR #1364 merge/tree `358450e44da691256b0eeb51d8ae131a520b6cbd` / `0682a30d9d5aba11ae7e0ae706e2b13797d0d167`, final postmerge raw 13 = 12 success + 1 intended skip와 bad/pending/rerun 0을 잠갔다. OMO report closeout PR #1365 merge/tree는 `4f3e8522ebbb6faaf48509154f04bc3e9d7d9d98` / `270e6f8c8d7b1fe2cb3c77233ad44f1753f452e8`이고 retained evidence는 `docs/workpacks/meal-log-ui/omo-report.md`다. Manual/device/AT/full WCAG/server-Mac/OAuth/merged-exact rehearsal/R/R+1/R+2/production activation은 pending이다 |
| `legacy-product-compat` | in-progress | #13 Stage 2/3 backend는 PR #1369 merge `50e31293e6740b3fdc56d022e12d3b9fe8be4cf7`로 merged-green이다. Draft PR #1371의 Stage 4/5와 exact `6387052439623cebef90176944aa5aee7f5ca17a` Stage 6 final review는 APPROVE P0/P1/P2 `0/0/0`, blocker/major/minor `0/0/0`, drift `0`, checks `12` success + `2` intended Draft skip, merge state `CLEAN`이다. Canonical phase는 `projecting`, approval `codex_approved`, verification/evaluation `passed`, Design confirmed, non-Manual `40/40`, Manual `0/7`, auto-merge false다. Internal 6.5, Ready/merge, Manual/server-Mac/OAuth, device/AT/full WCAG, drain/fence/revoke, capability R/R+1/R+2와 production/activation은 pending이다 |
| `cooking-meal-log-cross-slice-release-qa` | in-progress | approved disposable isolated rehearsal only 범위의 PR #1412 Stage 4 exact-tree evidence, fresh Stage 5 `APPROVE 0/0/2`, final authority `PASS 0/0/2`, Stage 6 `APPROVE 0/0/0`가 완료되어 Design Status는 confirmed다. P2 M01/M02는 waive 없이 유지한다. Ready/internal 6.5/merge, Stage 2 residual, controlled full-local과 Manual/server-Mac/OAuth/device/AT/full-WCAG/local-production/backup-restore/cutover/capability/R/R+1/R+2/required-key/activation은 pending이다 |

## Nutrition / Products / Planner Dependency Chain

| Slice | Status | Required predecessors | Note |
| --- | --- | --- | --- |
| `public-nutrition-source-acquisition` | merged | `28-external-ingredient-data-ingest-gate` = merged, nutrition contract-evolution official docs = merged | Historical predecessor retained as merged |
| `ingredient-nutrition-conversion-model` | merged | `public-nutrition-source-acquisition` = merged at `f87ae75016a9b709ffc3b706e7ca3720a0940982` | Historical predecessor retained as merged |
| `recipe-nutrition-calculation` | merged | `ingredient-nutrition-conversion-model` + PR #1005 pilot + PR #1006 official contract = merged | Historical predecessor retained as merged |
| `prepared-food-catalog` | merged | `ingredient-nutrition-conversion-model` = merged | Historical predecessor retained as merged |
| `prepared-food-planner-entry` | merged | `prepared-food-catalog` = merged, `05-planner-week-core` = merged | Historical predecessor retained as merged |
| `planner-nutrition-summary` | merged | predecessors와 PR #1024 merged | Design Status confirmed; backend Stage 3, Stage 5, final authority와 Stage 6 모두 `0/0/0`; final local frontend product `1,587/24 skipped`, regression `872/112 skipped`, Lighthouse 6, a11y `18/15`, visual `23/22`, security `12/12`와 real local Supabase auth/PostgREST/browser read-only smoke green. physical device/screen reader와 production-scale query는 Manual Only |
| `ingredient-nutrition-full-coverage` | merged | 2026-07-17 public-sharing official docs = merged, `public-nutrition-source-acquisition` = merged, `ingredient-nutrition-conversion-model` = merged, PR #1038 merge `3c737eae` | Successor 1; local inventory 845개 전수 검수·apply·0-write replay와 current-head 독립 review/CI/merge 완료 |
| `all-recipe-nutrition-recalculation` | merged | `ingredient-nutrition-full-coverage` = merged, `recipe-nutrition-calculation` = merged | Successor 2; exact implementation head `3abfb2f6` independent APPROVE/blocker 0, current-head checks green, PR #1040 merge `a001f53d`; local replay 0-write·rollback 복원·Meal pin 불변 완료 |
| `public-prepared-food-catalog-import` | merged | 2026-07-17 public-sharing official docs = merged, `prepared-food-catalog` = merged | Successor 3; PR #1035 merged. local public products 287,041, replay 0-write, independent Stage 3/current-head checks green |
| `community-prepared-food-catalog` | merged | `public-prepared-food-catalog-import` = merged, `prepared-food-catalog` = merged | Successor 4; PR #1043/#1044/#1045/#1046 merged. local A/B browser, authority, security/performance/current-head checks green |
| `prepared-food-standard-basis-ux` | merged | `community-prepared-food-catalog` = merged, `prepared-food-planner-entry` = merged, `planner-nutrition-summary` = merged | Successor 5; PR #1048/#1049 merged. local Supabase/Chrome 100→101g, 320/390/1280, independent review/authority, current-head checks green |
| `nutrition-products-cross-slice-release-qa` | merged | `ingredient-nutrition-full-coverage` = merged, `all-recipe-nutrition-recalculation` = merged, `public-prepared-food-catalog-import` = merged, `community-prepared-food-catalog` = merged, `prepared-food-standard-basis-ux` = merged | Successor 6; local DB/real Chrome/security/performance/authority/Stage 5/6와 PR #1064 current-head checks green, merge `c9315520` 완료 |

> 위 dependency chain의 2026-07-17 successor slice 순서는 새 공식 SOT와 `nutrition-products-public-data-expansion-20260717.md` 계획을 따른다. 기존 merged slice는 historical predecessor 기록으로 유지하며 planned로 되돌리지 않는다.
>
> 각 slice는 자신의 별도 Stage 1 `docs/workpacks/<slice>/README.md` + `acceptance.md` + 필요 시 `automation-spec` PR이 main에 merge되고 internal 1.5 gate가 닫힌 뒤에만 구현 stage를 시작한다. `recipe-nutrition-calculation`의 additive Recipe Detail UI와 `prepared-food-planner-entry`/`planner-nutrition-summary`, `prepared-food-standard-basis-ux`의 PLANNER_WEEK 변경은 anchor-extension authority-required다.

## Cooking Plan / Meal Log Dependency Chain

| Order | Release train | Slice | Status | Required predecessors |
| ---: | --- | --- | --- | --- |
| F0 | B | `account-session-generation-foundation` | merged | contract gate; security hotfix merged and deployed |
| 1 | A | `prepared-food-search-relevance` | merged | PR #1074/#1097/#1099/#1100/#1101/#1103/#1104/#1105/#1108 merged; retained production read-only subset and current-head gates passed; original apply provenance remains pending Manual Only |
| 2 | B | `product-ingredient-link-foundation` | merged | F0 + #3, link-only subset/verifier, Contract Evolution과 Stage 2/3 PR #1255 merge `d30ee2c8` 완료. PR #1256은 exact head `27fc07c4` 독립 review와 current-head checks green 뒤 `5e9773f5`로 merge됐고 Stage 6 closeout PR #1262도 merge `5cf91557`로 완료됐다. production account cleanup·기존-schema/full-local/query-plan은 Manual Only |
| 3 | B | `recipe-visibility-read-hardening` | merged | PR #1228 Stage 2~6 merged; F0 runtime, `31-recipe-media-tags`, `36e-recipe-tags-frontend` merged |
| 4 | B | `recipe-snapshot-authority-foundation` | in-progress | #2 PR #1256 implementation + PR #1262 Stage 6 closeout, #3 Storage/outbox runtime, full-local Stage 3 deployable app/runtime authority PR #1263 merged. 기존 hybrid evidence는 역사로 보존하며 activation, snapshot Stage 2 verifier, Train B와 Manual Only 검증은 미완료 |
| 5 | C | `personal-recipe-editor-decoupling` | in-progress | #3; `31-recipe-media-tags` merged; `36e-recipe-tags-frontend` merged; #4는 predecessor 아님. PR #1238, capability-off PR #1243 merge `6565c2a8`, hybrid verifier PR #1246은 historical evidence. Full-local Stage 2/3, existing shell Stage 4, independent no-visual-drift Stage 5, exact master `bb870dd0` automated Stage 6 merged-exact gate 완료. Manual Only와 #6/#8 capability-on activation 및 overall verification은 pending |
| 6 | C | `personal-recipe-customization-write-core` | in-progress | #2 + #3 + #4 + #5 runtime merged. Stage 3 backend checkpoint PR #1274 head `a27be0c7` dual APPROVE와 Ready checks 15/15 success 후 merge `05683e4d`; exact-merge verifier `POSTMERGE_VERIFIED YES`, P0/P1/P2 0/0/0. 서버 MacBook/local rehearsal, route/service·통합 E2E, terminal workpack closeout review, #7/#8 및 R+2 activation은 pending |
| 7 | C | `recipe-content-snapshot-future-propagation` | in-progress | #4 PR #1218 + #6 PR #1274 + `cook-mode-whole-board` PR #711 runtime merged; Stage 2/3 PR #1278 merge `ef5903b1`; Contract Evolution PR #1282 + re-lock PR #1283 이후 PR #1281 exact head `aab9a65e`가 merge `2173737e`로 병합되어 actual owner editor, additive revision/edit_context와 server-only joint projection runtime이 존재한다. final authority와 fresh Stage 6는 `0/0/0`, Design Status confirmed지만 Manual/server-Mac/OAuth, #8 gate와 activation이 남아 overall lifecycle은 in-progress다 |
| 8 | D | `cooked-batch-weight-ledger` | in-progress | #7; `cook-mode-whole-board` merged |
| 9 | D | `meal-log-core` | in-progress | #1 + #2 + #4 + #8 |
| 10 | E | `planner-shell` | in-progress | #9. PR #1331 merge `2185b59d1b460dac916aa4a4a4a5e061c8b795f0`; Stage 4~6 merged-green runtime 및 OMO report 완료. broader Manual/activation lifecycle pending |
| 11 | E | `cooked-batch-weight-ui` | in-progress | #8와 `cook-mode-whole-board` merged. UI-only Stage 4, fresh Stage 5·final authority·Stage 6 `APPROVE 0/0/0`와 current-head checks를 거쳐 PR #1323이 merge `7c7d25a1d4deb930ddcf85611bb57f5fe14f00a0`로 병합됐다. Manual/actual-device·AT/full-WCAG, server-Mac/OAuth, R/R+1/R+2와 activation은 pending |
| 12 | E | `meal-log-ui` | merged | #9 + #10. Stage 1 merge `d5164357e85772833518c5e4766cef020735b7f1`부터 Stage 6까지의 UI-only runtime delivery는 merged/completed다. PR #1361 merge `4264fe6bd5b3429029ba895a6b79cd32a5d3fa35`, final reviewed/source head `c9b7ef56febc485df69d5ffd144dfab8ffa1330a`, repair PR #1364 merge/tree `358450e44da691256b0eeb51d8ae131a520b6cbd` / `0682a30d9d5aba11ae7e0ae706e2b13797d0d167`, final postmerge raw 13 = 12 success + 1 intended skip와 bad/pending/rerun 0을 잠갔다. OMO report closeout PR #1365 merge/tree `4f3e8522ebbb6faaf48509154f04bc3e9d7d9d98` / `270e6f8c8d7b1fe2cb3c77233ad44f1753f452e8` 및 `docs/workpacks/meal-log-ui/omo-report.md`를 retained evidence로 둔다. Manual/device/AT/full WCAG/server-Mac/OAuth/merged-exact rehearsal/R/R+1/R+2/production activation은 pending이다 |
| 13 | E | `legacy-product-compat` | in-progress | #10 + #12 runtime dependency fulfilled; Stage 6 exact-head APPROVE, internal 6.5/Ready와 broader Manual/activation pending |
| 14 | F | `cooking-meal-log-cross-slice-release-qa` | in-progress | approved disposable isolated rehearsal only 범위의 PR #1412 Stage 4/Stage 5/final authority/Stage 6이 distinct Codex tasks로 완료됐고 Stage 6 exact a2 bundle은 `APPROVE 0/0/0`이다. Design Status는 confirmed이고 P2 M01/M02는 unwaived다. Ready/internal 6.5/merge, Stage 2 residual, controlled full-local과 Manual/server-Mac/OAuth/device/AT/full-WCAG/local-production/rehearsal/backup-restore/cutover/capability/R/R+1/R+2/required-key/activation은 pending이다 |

> 이 표가 cooking/meal-log successor의 exact ID·dependency authority다. 실행 순서는 foundation F0 → 독립 Train A → Train B→C→D→E→F이며 `#1`은 stable successor 번호다. `recipebook-diary-port`는 선행조건이 아니며, #3/#5는 `31-recipe-media-tags`와 `36e-recipe-tags-frontend`를 되돌리거나 진행 중 MYPAGE/RECIPEBOOK_DETAIL 파일을 소유하지 않는다. 각 행은 독립 Stage 1 `README.md` + `acceptance.md` + `automation-spec.json` + workflow-v2 work item/status PR과 mandatory internal 1.5 pass가 main에 merge된 뒤에만 구현 상태로 전환한다.
>
> #9 PR #1319 implementation은 `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`로 merge됐고 checkpoint projection `4597ca835ba81307d0bdf9e1b1c41806b17e7a68`, security repair `16cfce44d32d5b618742a0e20460df4772a19142`, historical post-merge raw 14/14 success가 뒤따랐다. #10 PR #1331 runtime은 `2185b59d1b460dac916aa4a4a4a5e061c8b795f0`로 merge되어 Stage 4~6 merged-green이며 `docs/workpacks/planner-shell/omo-report.md`가 OMO completion을 기록한다. 따라서 #12의 Stage 2 implementation dependency is available after Stage 1 independent reviews and the design prerequisite. 다만 #9/#10의 Manual/server-Mac/OAuth, merged-exact server-production/local-rehearsal, physical-device/AT, capability R/R+1/R+2, production/activation은 pending이고 전체 lifecycle을 완료로 올리지 않는다.
>
> #11 PR #1323은 fresh Stage 6와 current-head checks를 통과해 merge `7c7d25a1d4deb930ddcf85611bb57f5fe14f00a0`로 병합됐다. 이 merge는 UI-only delivery 사실이며 Manual/actual-device·AT/full-WCAG, server-Mac/OAuth, R/R+1/R+2와 activation을 완료하거나 전체 lifecycle을 `merged`로 올리지 않는다.

### Cooking / Meal Log Design Gate

- `MEAL_LOG`는 신규 화면이므로 `meal-log-ui` Stage 1에서 mobile-first wireframe, design-critic 결과, product-design-authority evidence 계획을 필수로 잠근다.
- `PLANNER_WEEK` 변경은 high-risk anchor extension이고 `COOK_MODE`와 `LEFTOVERS` 변경은 공식 anchor가 아닌 high-risk required screen 변경이므로 `planner-shell`과 `cooked-batch-weight-ui` Stage 1에서 mobile default+narrow evidence와 rollback-safe interaction을 잠근다.
- owner edit CTA가 추가되는 `RECIPE_DETAIL`은 `personal-recipe-editor-decoupling` Stage 1에서 공개/개인/비로그인/삭제 상태별 CTA wireframe과 authority 계획을 잠근다.

## Design Decision Gates

High-Risk Redesign 항목은 구현 슬라이스 전에 **Design Decision Gate**를 통과해야 한다.
Gate는 Stage 1 전용 workpack으로 관리되며, 사용자 승인이 완료되어야 후속 구현 슬라이스를 시작할 수 있다.

| Gate ID | 대상 | 결정 내용 | 승인 상태 | 후속 슬라이스 |
|---------|------|-----------|-----------|--------------|
| `H4-planner-week-v2-direction` | `PLANNER_WEEK` | table/grid vs day-card interaction model | ✅ 승인 (2026-04-16) | `H2-planner-week-v2-redesign` |
| `H1-home-first-impression` | `HOME` | D1 정렬=섹션헤더 유지, D2 테마=carousel strip, D3 재료필터=discovery 단독행, D4 안C | ✅ 승인 (2026-04-17) | `h1-home-first-impression` |
| `h5-modal-system-direction` | `RECIPE_DETAIL`, `HOME` | D1 olive accent, D2 eyebrow 제거, D3 icon close, D4 날짜 chip=요일+4/17, D5 save title=레시피 저장, D6 modal family 통일 | ✅ 승인 (2026-04-17) | `h5-modal-system-redesign` |
| `h6-baemin-style-direction` | app-wide visual system, `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` | 배민 스타일 공식 채택, visual-only 범위, token/component/anchor retrofit 순서 | ✅ 방향 채택 / 문서 승인 대기 (2026-04-26) | `baemin-style-tokens-additive`, `baemin-style-token-values`, `baemin-style-shared-components`, `baemin-style-home-retrofit`, `baemin-style-recipe-detail-retrofit`, `baemin-style-planner-week-retrofit` |
| `h7-baemin-prototype-parity-direction` | `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`, modal family | Baemin prototype near-100% parity program. PLANNER_WEEK planner-level "가로 스크롤 없음" lock 제거 승인(2026-04-27) | ✅ 승인 / merged (2026-04-27) | `baemin-prototype-parity-foundation`, `baemin-prototype-home-parity`, `baemin-prototype-recipe-detail-parity`, `baemin-prototype-planner-week-parity-contract`, `baemin-prototype-planner-week-parity`, `baemin-prototype-modal-overlay-parity`, `baemin-prototype-parity-polish-closeout` |
| `h8-baemin-prototype-reference-future-screens-direction` | `PANTRY`, `PANTRY_BUNDLE_PICKER`, `COOK_READY_LIST`, `COOK_MODE`, `LEFTOVERS`, `ATE_LIST`, `MYPAGE`, future management/import screens | slice 13-19 future-screen prototype authority matrix. `PANTRY`/`MYPAGE` are screen-level parity candidates; other listed surfaces remain prototype-derived by default | ✅ 승인 / merged (2026-04-28) | `13-pantry-core`, `14-cook-session-start`, `15a-cook-planner-complete`, `15b-cook-standalone-complete`, `16-leftovers`, `17a-mypage-overview-history`, `17b-recipebook-detail-remove`, `17c-settings-account`, `18-manual-recipe-create`, `19-youtube-import` |

## High-Risk Redesign Slices

Design Decision Gate 승인 이후 진행하는 anchor screen 리디자인 슬라이스다.
일반 Slice Order 표와 별도로 관리하며, contract-evolution PR이 merge된 후 FE 구현을 시작한다.

| Slice | Status | Gate | Goal |
|-------|--------|------|------|
| `H2-planner-week-v2-redesign` | merged / superseded in part | H4 ✅ | PLANNER_WEEK day-card 리디자인, 가로 스크롤 제거, 2일 이상 mobile overview. Planner-level no-horizontal lock은 `docs/화면정의서-v1.5.1.md`에서 supersede |
| `h3-planner-add-sync` | merged | H4 ✅ | RECIPE_DETAIL planner-add 바텀시트 × day-card baseline sync, 성공 후 동작 확정 |
| `h1-home-first-impression` | merged | H1 ✅ | HOME compact carousel hybrid(안 C) — 테마 carousel strip, 정렬=섹션헤더 유지, first viewport에 "모든 레시피 [정렬▾]" 진입 |
| `h5-modal-system-redesign` | merged | H5 ✅ | PlannerAdd/Save/IngredientFilter/Sort modal chrome 통일 (Quiet Kitchen Sheets) — eyebrow 제거, icon close, olive accent, 화면정의서 v1.5.0 |
| `baemin-style-tokens-additive` | merged | h6 ✅ | 배민 스타일 후속 전환용 additive CSS token foundation — 기존 C2 값 변경 없음, 컴포넌트 적용 없음 |
| `baemin-style-token-values` | merged | h6 ✅ | 사용자 승인 brand 토큰 값 변경 — `--brand` #ED7470, `--brand-deep` #C84C48, `--brand-soft` #FDEBEA; 컴포넌트/레이아웃 수정 없음 |
| `baemin-style-shared-components` | merged | h6 ✅ | 배민 스타일 공유 UI 프리미티브(Button, Chip, Card, Badge, EmptyState, ErrorState, Skeleton) 생성 및 기존 shared 컴포넌트 리스타일; 후속 anchor screen retrofit 소비용 |
| `baemin-style-home-retrofit` | merged | h6 ✅ | HOME anchor screen 배민 스타일 시각적 리트로핏 — H1 정보 구조(D1-D4) 보존, 토큰 교체, 공유 프리미티브 소비 |
| `baemin-style-recipe-detail-retrofit` | merged | h6 ✅ | RECIPE_DETAIL anchor screen 배민 스타일 시각적 리트로핏 — 정보 구조 보존, 토큰 교체, COOKING_METHOD_TINTS color-mix() 전환, H5 modal decisions 보존 |
| `baemin-style-planner-week-retrofit` | merged / superseded in part | h6 ✅ | PLANNER_WEEK anchor screen 배민 스타일 시각적 리트로핏 — 당시 H2/H4 day-card contract 보존. Planner-level no-horizontal lock은 `docs/화면정의서-v1.5.1.md`에서 supersede |
| `baemin-style-modal-system-fit` | merged | h6 ✅ | Modal/sheet 오버레이 패밀리 배민 스타일 시각 정합 — LoginGateModal H5 합류(ModalHeader, eyebrow 제거, icon-only close), interaction modal surface/shadow/radius/footer 토큰 일관성 |
| `h7-baemin-prototype-parity-direction` | merged | h7 | 프로토타입 near-100% parity 공식 방향 게이트 — supersession matrix, scoring method, exclusions, rollout lock |
| `baemin-prototype-parity-foundation` | merged | h7 | 3-way capture, fixture, material/reference foundation |
| `baemin-prototype-home-parity` | merged | h7 | HOME body prototype parity — target score `>=95`, blocker 0 |
| `baemin-prototype-home-porting` | merged | h7 | HOME prototype direct porting — hero, promo strip, inline chips, HOME bottom tab까지 HOME에 승격 |
| `baemin-prototype-recipe-detail-parity` | merged | h7 | RECIPE_DETAIL body prototype parity — score `96.56`, blocker 0, Stage 5 + final authority gate passed |
| `baemin-prototype-planner-week-parity-contract` | merged | h7 | PLANNER_WEEK prototype-priority contract/evidence target sync |
| `baemin-prototype-planner-week-parity` | merged | h7 | PLANNER_WEEK body prototype parity — score `96.99`, blocker 0, Stage 5 + final authority gate passed |
| `baemin-prototype-modal-overlay-parity` | merged | h7 | Modal/sheet overlay prototype parity — target score `>=93`, blocker 0 |
| `baemin-prototype-parity-polish-closeout` | merged | h7 | Final docs/evidence closeout — body avg 96.85 >= 95, modal avg 95.2 >= 93, blocker 0, exclusion ledger aligned, 11 PRs merged |
| `h8-baemin-prototype-reference-future-screens-direction` | merged | h8 | Future-screen prototype authority gate — slice 13-19 matrix, screen-level promotion, generic `frontend.design_authority` artifact fields |
| `desktop-planner-parity` | merged | h7 | Desktop prototype planner 주간 요약 parity — 모바일 요약 카드(total/cooked/shopped/registered)를 DesktopPlanner에 추가, 날짜 범위 seed 정합. 프로토타입 전용 |
| `desktop-mypage-parity` | merged | h7 | Desktop prototype mypage 모바일 메뉴 parity — 모바일 MyPageScreen의 9개 메뉴(emoji 아이콘, onGoPage 라우팅)를 DesktopMyPage aside에 추가. 프로토타입 전용 |
| `desktop-home-pantry-parity` | merged | h7 | Desktop prototype 홈+팬트리 모바일 기능 parity — DesktopHome에 검색/INGREDIENT_FILTERS/THEMES 카러셀/플래너 프로모/정렬 키 수정, DesktopPantry에 검색/추가 버튼 연결. 프로토타입 전용 |

**Gate workpack 규칙**:
- workflow-v2 JSON에서는 schema-valid 값인 `execution_mode: "manual"`을 사용하고, design-decision 의미는 workpack / roadmap / status notes에 기록한다
- 구현 없음
- Stage 1 산출물(비교 문서 + wireframe draft + authority 계획)만 생성한다
- 사용자 승인 이후에만 후속 구현 slice를 시작할 수 있다
- 공식 계약(화면정의서/유저플로우) 변경은 후속 slice의 contract-evolution PR에서 실행한다
- `docs/engineering/` 아래 tooling 작업과 달리, Design Decision Gate는 제품 UX 계약을 확정하므로 이 Roadmap에 등록한다

## Slice Notes

- `02`부터는 한 슬라이스를 더 작은 기능 단위 하나로 제한한다.
- `04`는 공식 저장 플로우를 닫기 위해 `POST /recipes/{id}/save`뿐 아니라 저장 대상 책 조회와 **커스텀 책 quick-create**까지 포함한다.
- `05`는 planner shell과 column contract를 먼저 닫고, `06`에서 상세 화면의 planner add flow를 그 계약 위에 얹는다.
- `08a`는 `MENU_ADD`의 공통 shell + 검색 path만 닫는다. leftovers path는 `16`, manual path는 `18`, youtube path는 `19`가 담당한다.
- `08b`는 `GET /recipe-books/{id}/recipes`와 `GET /recipes/pantry-match`를 사용한 식사 추가 path를 닫는다.
- 장보기 슬라이스에서는 `exclude -> uncheck`, read-only, `add_to_pantry_item_ids`, `pantry_added` 규칙을 항상 테스트로 고정한다.
- `11`은 reorder만 담당한다. 완료 후 read-only UX는 `12a`와 `17a`/`SHOPPING_DETAIL` 재열람에서 닫는다.
- 요리 슬라이스에서는 플래너 경유 요리와 독립 요리의 상태 전이를 절대 섞지 않는다.
- `15a`/`15b`는 shared `COOK_MODE`를 쓰더라도 workpack과 acceptance를 분리한다.
- `17a`/`17b`/`17c`는 각각 overview/list, detail/remove, account/settings를 닫는 별도 slice다.
- `SETTINGS`와 `POST /auth/logout`은 기존 roadmap 누락 항목이었고 `17c`에서 닫는다.
- `GET /cooking-methods`는 `18`에서 manual recipe 작성용으로 먼저 소비하고, `19`가 youtube import에서 재사용한다.
- `SHOPPING_DETAIL` 상단의 `[쿠팡/컬리(검색 링크)]`는 공식 문서상 선택 구현이므로 core roadmap에서는 잠그지 않고 필요 시 후속 low-risk slice로 분리한다.
- `13-pantry-core` 프론트엔드 착수 전에는 `h8-baemin-prototype-reference-future-screens-direction`이 merge되어야 한다. `PANTRY`는 screen-level `prototype parity` 후보지만 `PANTRY_BUNDLE_PICKER`는 별도 증거가 없는 한 `prototype-derived design`이다.
- `planner-column-customization`은 contract-evolution PR #367(2026-05-10)에 의한 정책 변경 슬라이스다. 기본 끼니를 4고정에서 3개(아침/점심/저녁)로 줄이고 사용자 설정에서 1~5개 범위로 관리. `PLANNER_WEEK`는 anchor-extension이므로 authority review가 필요하다. 2026-06-16 addendum으로 SETTINGS 컬럼 순서 변경(reorder)을 공식 범위에 포함한다.
