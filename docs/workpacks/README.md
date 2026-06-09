# Workpack Roadmap v2

## Purpose

- 앞으로의 구현은 `작은 세로 슬라이스` 단위로 진행한다.
- 각 슬라이스는 공식 문서 기준의 사용자 가치 하나를 닫아야 한다.
- 같은 슬라이스에서도 개발 브랜치는 `백엔드`와 `프론트엔드`로 분리한다.
- Wave1 프로토타입을 실제 서비스로 포팅하는 후속 계획은 `docs/workpacks/wave1-service-porting-plan.md`를 기준으로 한다.
- 2026-05-11 이후 Wave1 모바일 앱 재포팅의 디자인 기준은 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`다. 기존 Wave1 porting PR의 screenshot/authority evidence는 historical evidence이며, 모바일 목표는 fixed prototype reference 대비 100% parity다.

## Revision Notes

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
| `planner-column-customization` | merged        | 끼니 컬럼 기본 3개 + 설정 커스터마이징(이름 변경/추가/삭제), 최소 1~최대 5, PLANNER_WEEK 동적 컬럼               |
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
| `recipebook-diary-port` | docs | 레시피북을 작은 책/다이어리처럼 느끼게 하는 FE-only 포팅 계획. `MYPAGE` 책장형 목록과 `RECIPEBOOK_DETAIL` desktop 목차 rail + recipe area split을 잠그며, full page-turn reader는 read-only preview 계약이 승인될 때까지 scope 밖 |

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
- `planner-column-customization`은 contract-evolution PR #367(2026-05-10)에 의한 정책 변경 슬라이스다. 기본 끼니를 4고정에서 3개(아침/점심/저녁)로 줄이고 사용자 설정에서 1~5개 범위로 관리. `PLANNER_WEEK`는 anchor-extension이므로 authority review가 필요하다. 컬럼 순서 변경(reorder)은 1차 범위 밖이다.
