# Workpack Roadmap v2

## Purpose

- 앞으로의 구현은 `작은 세로 슬라이스` 단위로 진행한다.
- 각 슬라이스는 공식 문서 기준의 사용자 가치 하나를 닫아야 한다.
- 같은 슬라이스에서도 개발 브랜치는 `백엔드`와 `프론트엔드`로 분리한다.

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
| `10b-shopping-share-text`      | planned   | 장보기 공유 텍스트 생성 (`is_pantry_excluded=false` 항목만 포함)                                                 |
| `11-shopping-reorder`          | planned   | 장보기 순서 변경과 미완료 리스트 reorder persistence                                                             |
| `12a-shopping-complete`        | planned   | 장보기 완료 core, `shopping_done` 전이, `is_completed=true`, 완료 직후 read-only lock, 멱등성                   |
| `12b-shopping-pantry-reflect`  | planned   | 팬트리 반영 선택 팝업, `null/[]/선택값` 3-way 처리, 4단계 서버 검증                                              |
| `13-pantry-core`               | planned   | 팬트리 조회, 직접 추가, 묶음 추가, 삭제                                                                          |
| `14-cook-session-start`        | planned   | `COOK_READY_LIST`, 요리 세션 시작/취소                                                                           |
| `15a-cook-planner-complete`    | planned   | 플래너 경유 `COOK_MODE`, pantry 소진, `cook_done` 전이                                                           |
| `15b-cook-standalone-complete` | planned   | 상세 직행 `COOK_MODE`, standalone complete, pantry 소진, leftover 저장                                            |
| `16-leftovers`                 | planned   | 남은요리 저장, 재등록, 다먹은 목록                                                                               |
| `17a-mypage-overview-history`  | planned   | `MYPAGE` shell, 내 정보, 레시피북 목록/생성/수정/삭제, 장보기 기록 목록                                          |
| `17b-recipebook-detail-remove` | planned   | `RECIPEBOOK_DETAIL` 조회, saved/custom 제거, liked 책에서 좋아요 해제                                            |
| `17c-settings-account`         | planned   | `SETTINGS`, 로그아웃, 화면 꺼짐 방지, 닉네임 변경, 회원 탈퇴                                                     |
| `18-manual-recipe-create`      | planned   | 직접 레시피 등록, 조리방법 선택, 상세/플래너 연계, `my_added` 반영                                               |
| `19-youtube-import`            | planned   | 유튜브 검증/추출/등록, 신규 조리방법 반영, 플래너 연계, `my_added` 반영                                          |

## Design Decision Gates

High-Risk Redesign 항목은 구현 슬라이스 전에 **Design Decision Gate**를 통과해야 한다.
Gate는 Stage 1 전용 workpack으로 관리되며, 사용자 승인이 완료되어야 후속 구현 슬라이스를 시작할 수 있다.

| Gate ID | 대상 | 결정 내용 | 승인 상태 | 후속 슬라이스 |
|---------|------|-----------|-----------|--------------|
| `H4-planner-week-v2-direction` | `PLANNER_WEEK` | table/grid vs day-card interaction model | ✅ 승인 (2026-04-16) | `H2-planner-week-v2-redesign` |
| `H1-home-first-impression` | `HOME` | D1 정렬=섹션헤더 유지, D2 테마=carousel strip, D3 재료필터=discovery 단독행, D4 안C | ✅ 승인 (2026-04-17) | `h1-home-first-impression` |
| `h5-modal-system-direction` | `RECIPE_DETAIL`, `HOME` | D1 olive accent, D2 eyebrow 제거, D3 icon close, D4 날짜 chip=요일+4/17, D5 save title=레시피 저장, D6 modal family 통일 | ✅ 승인 (2026-04-17) | `h5-modal-system-redesign` |
| `h6-baemin-style-direction` | app-wide visual system, `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` | 배민 스타일 공식 채택, visual-only 범위, token/component/anchor retrofit 순서 | ✅ 방향 채택 / 문서 승인 대기 (2026-04-26) | `baemin-style-tokens-additive`, `baemin-style-token-values`, `baemin-style-shared-components`, `baemin-style-home-retrofit`, `baemin-style-recipe-detail-retrofit`, `baemin-style-planner-week-retrofit` |

## High-Risk Redesign Slices

Design Decision Gate 승인 이후 진행하는 anchor screen 리디자인 슬라이스다.
일반 Slice Order 표와 별도로 관리하며, contract-evolution PR이 merge된 후 FE 구현을 시작한다.

| Slice | Status | Gate | Goal |
|-------|--------|------|------|
| `H2-planner-week-v2-redesign` | merged | H4 ✅ | PLANNER_WEEK day-card 리디자인, 가로 스크롤 제거, 2일 이상 mobile overview |
| `h3-planner-add-sync` | merged | H4 ✅ | RECIPE_DETAIL planner-add 바텀시트 × day-card baseline sync, 성공 후 동작 확정 |
| `h1-home-first-impression` | merged | H1 ✅ | HOME compact carousel hybrid(안 C) — 테마 carousel strip, 정렬=섹션헤더 유지, first viewport에 "모든 레시피 [정렬▾]" 진입 |
| `h5-modal-system-redesign` | merged | H5 ✅ | PlannerAdd/Save/IngredientFilter/Sort modal chrome 통일 (Quiet Kitchen Sheets) — eyebrow 제거, icon close, olive accent, 화면정의서 v1.5.0 |
| `baemin-style-tokens-additive` | merged | h6 ✅ | 배민 스타일 후속 전환용 additive CSS token foundation — 기존 C2 값 변경 없음, 컴포넌트 적용 없음 |

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
