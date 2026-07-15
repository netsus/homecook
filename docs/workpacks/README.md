# Workpack Roadmap v2

## Purpose

- 앞으로의 구현은 `작은 세로 슬라이스` 단위로 진행한다.
- 각 슬라이스는 공식 문서 기준의 사용자 가치 하나를 닫아야 한다.
- 같은 슬라이스에서도 개발 브랜치는 `백엔드`와 `프론트엔드`로 분리한다.
- Wave1 프로토타입을 실제 서비스로 포팅하는 후속 계획은 `docs/workpacks/wave1-service-porting-plan.md`를 기준으로 한다.
- 2026-05-11 이후 Wave1 모바일 앱 재포팅의 디자인 기준은 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`다. 기존 Wave1 porting PR의 screenshot/authority evidence는 historical evidence이며, 모바일 목표는 fixed prototype reference 대비 100% parity다.

## Revision Notes

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
| `docs` | 1단계(Claude) README + acceptance.md 작업 중 또는 완료, 구현 착수 전 |
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

- **1단계(Claude)**: `docs/workpacks/<slice>/README.md`와 `acceptance.md`를 작성하고 main에 merge한다. 단계별 절차는 `docs/engineering/slice-workflow.md` 참조.
- **2단계 시작 조건**: 1단계 문서 PR이 main에 **merge된 후**에만 백엔드 구현(2단계)을 시작한다.
- Slice Order에서 선행 슬라이스 Status가 전부 `merged`인지 확인한 뒤 착수한다.
- **Launch blocker 예외**: `launch-readiness-blockers`는 광고/배포를 직접 막는 release-hotfix workpack이다. 선행 slice 일부가 미완료여도 fake contact/legal 404, hydration/console error, missing security headers, mixed-content, audit failure를 먼저 닫기 위해 진행한다. 이 예외는 해당 workpack에만 적용되며 product contract, required checks, authority evidence, current-head CI green gate를 완화하지 않는다.
- **Codex-only 예외**: `launch-readiness-blockers`는 사용자 지시에 따라 Claude를 사용하지 않는다. 기존 Claude 담당 Stage 1/3/4/final authority 역할은 같은 세션이 아니라 별도 Codex 세션으로 분리하고, 구현 세션은 자기 작업을 approve하지 않는다.
- **Codex docs-owner 예외**: `auth-provider-memory-linking`은 사용자가 Claude 사용을 중단하고 별도 Codex 세션이 Stage 1 docs-owner 역할을 대신하도록 명시적으로 승인했다. 이후 구현과 리뷰도 역할별 별도 Codex 세션으로 분리하며, 구현 세션은 자기 변경을 최종 승인하지 않는다.
- **Codex-only 서비스 가이드 예외**: `service-about-guide`는 사용자가 Claude 사용 중단과 기존 Claude 담당 단계의 새 Codex 세션 대체를 명시적으로 승인했다. 공식 계약 PR 병합 후 Stage 1 docs owner, Stage 4 구현 owner, internal docs repair/final authority owner를 서로 다른 Codex 세션으로 분리하고, Stage 1/4 작성 세션은 자기 변경을 최종 승인하지 않는다.
- **Codex-only 서비스 브랜드 예외**: `service-brand-rebrand`는 사용자가 Claude 미사용과 기존 Claude 담당의 Stage 1 docs owner, Stage 3 backend review, Stage 4 frontend implementation, internal docs repair/final owner, authority-required final authority를 각각 역할 분리된 새 Codex 세션으로 대체하도록 명시 승인했다. Stage 1/4 작성·구현 세션은 자기 변경을 최종 승인하지 않는다. 이 예외는 `service-brand-rebrand`에만 적용하며 전역 workflow actor 규칙을 바꾸지 않는다.
- **Codex-only HOME lockup 예외**: `service-brand-home-lockup`은 사용자가 Claude 미사용을 유지하고 Stage 1 docs owner, Stage 4 frontend implementation, internal docs repair/final owner, authority-required final authority를 역할 분리된 새 Codex 세션으로 대체하도록 승인했다. Stage 1/4 작성·구현 세션은 자기 변경을 최종 승인하지 않는다. 이 예외는 해당 workpack에만 적용한다.
- **Codex-only 이미지 브랜드 자산 예외**: `service-brand-image-assets`는 사용자가 기존 브랜드 Codex-only 연속 작업에서 공식 계약 갱신과 실제 서비스 적용을 함께 요청한 후속 슬라이스다. Stage 1 docs owner, Stage 4 frontend implementation, internal docs repair/final owner, authority reviewer를 역할 분리된 Codex 작업으로 나누고 작성·구현 작업은 자기 변경을 최종 승인하지 않는다. 이 예외는 해당 workpack에만 적용하며 전역 workflow actor 규칙을 바꾸지 않는다.
- **Codex-only 아이콘 외곽 처리 예외**: `service-brand-icon-edge-treatment`는 사용자가 실제 favicon 흰 모서리를 확인하고 수정을 요청한 `service-brand-image-assets`의 연속 후속 슬라이스다. Stage 1 docs owner, Stage 4 frontend implementation, 독립 Stage 5/6 reviewer를 역할 분리하고 작성·구현 작업은 자기 변경을 최종 승인하지 않는다. 이 예외는 해당 workpack에만 적용하며 전역 workflow actor 규칙을 바꾸지 않는다.
- **Codex-only nutrition/products/planner 예외**: `public-nutrition-source-acquisition`, `ingredient-nutrition-conversion-model`, `recipe-nutrition-calculation`, `prepared-food-catalog`, `prepared-food-planner-entry`, `planner-nutrition-summary`는 사용자가 기존 Claude 담당 단계를 역할이 분리된 **별도 Codex 앱 작업**으로 대체하도록 승인했다. Stage 1 docs owner, internal 1.5 review/repair-final owner, Stage 2/3, Stage 4, authority precheck/Stage 5/final authority/Stage 6은 필요한 역할별 새 작업으로 분리하고, 작성·구현 작업은 자기 변경을 최종 승인하지 않는다. 같은 작업 안의 서브에이전트는 이 역할 분리의 대체물이 아니다. 이 예외는 위 6개 nutrition 관련 신규 slice에만 적용하며 전역 stage owner 규칙은 바꾸지 않는다.
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
| `cook-mode-whole-board` | implementation | COOK_MODE를 현재 단계 중심에서 전체 재료 + 전체 조리순서 whole-board로 변경. API/DB 변경 없음 |
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
| `auth-provider-memory-linking` | merged | 세 provider 이메일 필수, built-in Kakao/Naver 표준 claim gate, 최근 provider 기억/전환 확인, same-user identity linking과 different-user conflict 보호, 수동 provider 연결. PR #967 merge |
| `service-about-guide` | merged | 공개 `/about` 서비스 가이드, `PRIMARY_WEB_NAV_ITEMS` 웹 공통 5메뉴, HOME `집밥 둘러보기` guide+theme rail, MYPAGE 임시 도움말 제거. docs PR #978 + FE PR #979 merge. 커뮤니티/제안 게시판은 후속 슬라이스 |
| `service-brand-rebrand` | merged | 정식명 `무엇을 먹든`, 짧은명 `무먹`, 신규·빈 nickname `무먹러`, system notification read-time copy 호환을 API/DB shape와 기술 식별자 변화 없이 잠금 |
| `service-brand-home-lockup` | merged | HOME mobile `HomeAppBar`와 desktop HOME `WebTopNav` brand area에 큰 `무먹` 아래 작은 `무엇을 먹든`을 세로 2단으로 표시. non-HOME 단독 표시와 nav geometry/interaction 보존 |
| `service-brand-image-assets` | merged | 선택한 파란 `무먹` 심볼을 HOME/non-HOME header, favicon, 설치/Apple 아이콘, OG/Twitter metadata에 적용하고 authority·탐색 QA·current-head 전체 CI를 통과 |
| `service-brand-icon-edge-treatment` | merged | favicon은 투명 외곽, 설치/PWA·Apple 아이콘은 full-bleed 파란 배경으로 분리하고 source/header/OG/Twitter 승인본을 보존 |
| `public-nutrition-source-acquisition` | merged | 공공 영양 source를 versioned raw snapshot + manifest로 수집하고 schema/pagination/license/key 비노출을 fail-closed 검증한 뒤 approved promotion 입력을 만든다 |
| `ingredient-nutrition-conversion-model` | merged | 핵심 영양 profile과 15mL당 약 6/10/15/20/25g 대표 환산 등급, 분리된 원문 evidence/assignment, 개당 중량을 승인 기반 immutable model로 구현한다 |
| `recipe-nutrition-calculation` | docs | 레시피 재료·인분·대표 환산으로 completeness/quality와 scalable/fixed vectors를 계산하고 immutable snapshot을 생성/pin/backfill하며 Recipe Detail additive API와 최소 상태 UI를 제공한다 |
| `prepared-food-catalog` | planned | 승인 public 완제품 + 사용자 private manual 제품 catalog, immutable nutrition version, owner/public read-only/soft-delete 정책을 구현한다 |
| `prepared-food-planner-entry` | planned | 완제품을 Recipe Meal과 분리해 플래너에 추가/수정/삭제하고 shopping/cooking/leftover/XP에서 구조적으로 제외한다 |
| `planner-nutrition-summary` | planned | pin된 recipe/product snapshot만 끼니·날짜·주간 `계획 영양`으로 합산하고 결측/partial/quality를 보존한다 |

## Nutrition / Products / Planner Dependency Chain

| Slice | Status | Required predecessors |
| --- | --- | --- |
| `public-nutrition-source-acquisition` | merged | `28-external-ingredient-data-ingest-gate` = merged, nutrition contract-evolution official docs = merged |
| `ingredient-nutrition-conversion-model` | merged | `public-nutrition-source-acquisition` = merged at `f87ae75016a9b709ffc3b706e7ca3720a0940982` |
| `recipe-nutrition-calculation` | docs | `ingredient-nutrition-conversion-model` + PR #1005 pilot + PR #1006 official contract = merged |
| `prepared-food-catalog` | planned | `ingredient-nutrition-conversion-model` = merged |
| `prepared-food-planner-entry` | planned | `prepared-food-catalog` = merged, `05-planner-week-core` = merged |
| `planner-nutrition-summary` | planned | `recipe-nutrition-calculation` = merged, `prepared-food-planner-entry` = merged |

> 각 slice는 자신의 Stage 1 workpack/acceptance/automation-spec이 별도 Codex docs-owner 작업에서 main에 merge되고 internal 1.5 gate가 닫힌 뒤에만 다음 stage를 시작한다. `recipe-nutrition-calculation`의 additive Recipe Detail UI와 `prepared-food-planner-entry`/`planner-nutrition-summary`의 PLANNER_WEEK 변경은 anchor-extension authority-required다.

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
