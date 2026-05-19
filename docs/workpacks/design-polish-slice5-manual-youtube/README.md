# design-polish-slice5-manual-youtube

## Goal

MANUAL_RECIPE_CREATE / YT_IMPORT의 모바일 입력 폼을 더 좁은 화면에서도 안정적으로 읽고 조작할 수 있게 정리한다. 재료 행은 한 줄 밀도를 회복하고, 조리법 입력은 모달을 거치지 않고 화면 안에서 바로 작성하게 하며, 조리방법 색상 구분을 복구한다. API, DB, 인증, 저장 계약은 이미 merged된 `18-manual-recipe-create`, `19-youtube-import` 계약을 그대로 사용한다.

## Branches

- 백엔드: N/A (FE-only visual/interaction polish)
- 프론트엔드: `feature/fe-design-polish-slice5-manual-youtube`

## In Scope

- 화면: `MANUAL_RECIPE_CREATE`, `YT_IMPORT`
- API: 기존 API 소비만 유지
  - `POST /recipes`
  - `GET /cooking-methods`
  - `POST /recipes/youtube/validate`
  - `POST /recipes/youtube/extract`
  - `POST /recipes/youtube/register`
- 상태 전이: 변경 없음
  - `recipes.source_type = 'manual' | 'youtube'` 자동 설정 유지
  - `recipes.created_by = current_user.id` 기반 `my_added` 가상 책 반영 유지
  - 등록 후 끼니 추가 시 `meals.status='registered'` 유지
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (기존 테이블 읽기/쓰기 계약 그대로 사용)

## Out of Scope

- API request/response/error 구조 변경
- `recipe_ingredients`, `recipe_steps`, `cooking_methods`, `recipe_sources` DB 스키마 변경
- 실제 YouTube Data API, OCR, ASR, estimation 연동
- 레시피 수정/삭제, 이미지 업로드
- MENU_ADD 옵션 구조 재변경
- 웹 색상 토큰(`--web-*`) 또는 앱 글로벌 브랜드 토큰 값 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `design-polish-slice1-typography-tokens` | merged | [x] |
| `design-polish-slice2-app-shell-home` | merged | [x] |
| `design-polish-slice3-recipe-detail` | merged | [x] |
| `design-polish-slice4-planner-meal-add` | merged | [x] |
| `18-manual-recipe-create` | merged | [x] |
| `19-youtube-import` | merged | [x] |

## Classification

- **UI risk: `high-risk`**
- 이유: 신규 화면은 아니지만, `MANUAL_RECIPE_CREATE`의 조리법 입력 방식을 모달 중심에서 화면 내 직접 입력으로 바꾸는 폼 interaction 변경이다. 저장 계약은 그대로지만 모바일 작성 흐름의 핵심 입력 모델이 달라지므로 Stage 4 screenshot evidence와 Stage 5 design review를 요구한다.
- Anchor screen dependency: 없음 (`HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` 직접 변경 없음)
- design-generator / design-critic: 기존 확정 화면 산출물 재사용
  - `ui/designs/MANUAL_RECIPE_CREATE.md`
  - `ui/designs/YT_IMPORT.md`
  - `ui/designs/critiques/MANUAL_RECIPE_CREATE-critique.md`
  - `ui/designs/critiques/YT_IMPORT-critique.md`
- product-design-authority: Stage 4 구현 후 screenshot evidence 기반 authority review 필수

## User Findings (4건)

### Finding 1: 재료 카드 한 줄 정렬

추가된 재료 카드에서 재료명, 수량 input, `g/ml` 단위, 삭제 버튼이 한 줄에 정렬되어야 한다. 모바일 320px에서도 줄바꿈으로 카드 높이가 과도하게 늘어나지 않도록 각 영역의 최소/최대 폭과 삭제 버튼 터치 타겟을 고정한다.

### Finding 2: 조리법 입력을 화면 안으로 이동

조리법 입력을 모달에서 하는 방식은 작성 흐름을 끊으므로, `MANUAL_RECIPE_CREATE` 화면 본문에서 바로 입력하게 변경한다. 조리방법 선택은 가로 스크롤 칩으로 제공하고, 선택한 조리방법이 각 step row에 즉시 반영되어야 한다.

### Finding 3: 조리방법 색상 복구

조리방법별 색상 구분이 사라진 상태를 복구한다. `GET /cooking-methods`의 `color_key`와 기존 `docs/design/design-tokens.md`의 조리방법 색상 규칙을 기준으로, chip과 step row에서 색상 구분이 일관되게 보여야 한다.

### Finding 4: 재료 validation 문구 밀도 조정

`재료를 1개 이상 추가해주세요` 문구가 화면 공간을 과하게 차지하지 않도록 배경색을 제거하고 폰트 크기와 여백을 줄인다. 오류임은 읽히되, 입력 폼의 주된 시각 위계를 방해하지 않아야 한다.

## Affected Components

| Component | File | 변경 사유 |
| --- | --- | --- |
| ManualRecipeCreateScreen | `components/recipe/manual-recipe-create-screen.tsx` | 재료 행 밀도, 조리법 직접 입력, 조리방법 칩/색상, validation 문구 |
| YouTubeImportScreen | `components/recipe/youtube-import-screen.tsx` | 검수/수정 단계의 재료 행/조리방법 색상 회귀 확인 |
| Cooking method color helpers | 기존 helper 또는 화면 내부 mapping | `color_key` 기반 색상 복구 |
| Manual recipe E2E / component tests | `tests/*manual*`, `tests/e2e/*manual*`, `tests/e2e/*youtube*` | 폼 입력 회귀 고정 |

## Backend First Contract

- Backend 변경 없음.
- 기존 응답 래퍼 `{ success, data, error }` 유지.
- 기존 validation 유지:
  - 직접 등록: title, base_servings, ingredients 최소 1개, steps 최소 1개, cooking_method_id 필수
  - YouTube 등록: URL validate/extract/register 단계와 검수 편집 계약 유지
  - `ingredient_type='QUANT'`는 amount/unit 필수, `TO_TASTE`는 amount/unit 없음
- 기존 권한 유지: 등록/YouTube import는 로그인 필수, 비로그인 시 login gate + return-to-action 유지.
- 멱등성 변경 없음: validate는 side-effect 없음, create/register/extract는 기존 정책 유지.

## Frontend Delivery Mode

- 디자인 상태: 기존 confirmed 화면의 high-risk interaction polish
- 필수 상태:
  - `loading`: cooking methods 로딩, 저장/검증/추출/등록 중
  - `empty`: 조리방법 목록 없음, 재료/스텝 미입력 안내
  - `error`: validation/API 실패
  - `read-only`: 등록 완료 후 결과 화면 또는 완료 상태에서 기존 정책 유지
  - `unauthorized`: 비로그인 저장/import 시 login gate
- 로그인 보호 액션은 기존 return-to-action을 유지한다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음
- Visual artifact: Stage 4에서 아래 screenshot evidence 제공 예정
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/MANUAL_RECIPE_CREATE-ingredients-mobile.png`
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/MANUAL_RECIPE_CREATE-steps-mobile.png`
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/MANUAL_RECIPE_CREATE-narrow.png`
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/YT_IMPORT-review-mobile.png`
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/YT_IMPORT-review-narrow.png`
- Authority status: `reviewed`
- Authority report path:
  - `ui/designs/authority/DESIGN_POLISH_SLICE5_MANUAL_YOUTUBE-authority.md`
- Notes: 기존 확정 화면의 입력 UX를 바꾸는 polish이므로 generator/critic은 기존 산출물을 재사용했다. Claude final authority는 provider limit으로 수행하지 못했고, 사용자 지시에 따라 Codex fallback authority를 수행했다. blocker/major/minor 0.

## Design Status

- [ ] 임시 UI (temporary) -- Stage 1 문서 잠금 상태. Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) -- Stage 4 완료 후, screenshot evidence 준비 상태
- [x] 확정 (confirmed) -- Stage 5 review + authority blocker 0개 확인 후
- [ ] N/A -- BE-only 슬라이스 아님

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/18-manual-recipe-create/README.md`
- `docs/workpacks/19-youtube-import/README.md`
- `docs/화면정의서-v1.5.4.md` -- §9 MANUAL_RECIPE_CREATE, §10 YT_IMPORT
- `docs/유저flow맵-v1.3.4.md` -- ⑨ 유튜브 등록, ⑩ 직접 등록
- `docs/api문서-v1.2.5.md` -- §6, §7, §14
- `docs/db설계-v1.3.3.md` -- ingredients, cooking_methods, recipe_ingredients, recipe_steps
- `docs/design/design-tokens.md` -- 조리방법 색상
- `docs/design/mobile-ux-rules.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- fixture baseline: 기존 manual/youtube fixture, 조리방법 seed 8종, 재료 마스터, YouTube stub fixture 사용.
- real DB smoke: API/DB 변경이 없으므로 필수 신규 smoke 없음. 기존 `18`/`19` real smoke 경로가 깨지지 않는지만 regression으로 확인한다.
- seed/reset: 신규 seed 없음.
- bootstrap: `my_added` 시스템 책, `meal_plan_columns`, cooking methods seed는 기존 owning flow 유지.
- blocker 조건:
  - 조리방법 목록이 비어 색상/칩 선택을 검증할 수 없음
  - 모바일 320px에서 재료 행 텍스트/버튼 겹침
  - 조리법 직접 입력에서 step 저장 payload가 기존 계약과 달라짐

### 검증 전략

- `pnpm lint`
- `pnpm typecheck`
- `pnpm vitest run` targeted manual/youtube tests
- `pnpm verify:frontend`
- Manual/Youtube registration E2E targeted run
- mobile default/narrow screenshot evidence + authority report
- `pnpm validate:workflow-v2`
- `pnpm validate:workpack -- --slice design-polish-slice5-manual-youtube`
- `pnpm validate:authority-evidence-presence`

## Key Rules

1. API/DB 계약을 바꾸지 않는다.
2. `steps[].cooking_method_id`는 계속 필수이며, 화면 내 직접 입력으로 바뀌어도 payload 구조는 기존과 동일하다.
3. `GET /cooking-methods`의 `color_key`를 UI 색상 구분의 기준으로 삼는다.
4. 모바일 320px에서 재료 행, step row, method chip, 삭제 버튼이 겹치지 않아야 한다.
5. 터치 타겟은 가능한 44px 기준을 유지한다.
6. 웹 토큰 및 글로벌 앱 브랜드 토큰 값은 변경하지 않는다.

## Contract Evolution Candidates

없음. 이번 작업은 기존 화면/계약 내 입력 UX와 시각 polish이며 공식 문서 변경이 필요하지 않다.

## Primary User Path

1. 사용자가 `MEAL_SCREEN` 식사추가에서 직접등록 또는 유튜브 등록으로 진입한다.
2. 직접등록 화면에서 재료를 추가하고, 조리법을 화면 안에서 바로 입력하며, 가로 칩으로 조리방법을 선택한다.
3. 재료와 조리법이 기존 payload 계약대로 저장되고, 등록 후 기존 후속 행동(끼니 추가/상세 이동/my_added 반영)이 유지된다.

## Delivery Checklist

- [x] MANUAL_RECIPE_CREATE 재료 행을 재료명/input/unit/delete 한 줄 구조로 정리 <!-- omo:id=dp5-manual-ingredient-row;stage=4;scope=frontend;review=5,6 -->
- [x] MANUAL_RECIPE_CREATE 조리법 입력을 모달이 아닌 화면 본문 직접 입력으로 전환 <!-- omo:id=dp5-manual-inline-steps;stage=4;scope=frontend;review=5,6 -->
- [x] 조리방법 선택을 가로 스크롤 칩으로 제공 <!-- omo:id=dp5-method-chip-rail;stage=4;scope=frontend;review=5,6 -->
- [x] 조리방법 `color_key` 기반 색상 구분을 chip과 step row에 복구 <!-- omo:id=dp5-method-colors;stage=4;scope=frontend;review=5,6 -->
- [x] `재료를 1개 이상 추가해주세요` 안내의 배경 제거, 폰트/여백 축소 <!-- omo:id=dp5-ingredient-validation-density;stage=4;scope=frontend;review=5,6 -->
- [x] YT_IMPORT 검수/수정 단계에서도 재료 행과 조리방법 색상 회귀 없음 확인 <!-- omo:id=dp5-youtube-review-regression;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 manual/youtube API payload 구조 유지 <!-- omo:id=dp5-payload-contract-preserved;stage=4;scope=shared;review=6 -->
- [x] `loading / empty / error / read-only / unauthorized` 상태 회귀 없음 확인 <!-- omo:id=dp5-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] mobile default/narrow screenshot evidence 생성 <!-- omo:id=dp5-authority-screenshots;stage=4;scope=frontend;review=5,6 -->
- [x] authority report 작성 및 blocker 0 확인 <!-- omo:id=dp5-authority-report;stage=4;scope=frontend;review=6 -->
- [x] targeted Vitest / Playwright manual-youtube 회귀 테스트 통과 <!-- omo:id=dp5-targeted-tests;stage=4;scope=frontend;review=6 -->
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm verify:frontend` 통과 <!-- omo:id=dp5-frontend-verification;stage=4;scope=frontend;review=6 -->

## Stage 5/6 Closeout Evidence

- Authority report: `ui/designs/authority/DESIGN_POLISH_SLICE5_MANUAL_YOUTUBE-authority.md`
- Screenshot evidence:
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/MANUAL_RECIPE_CREATE-ingredients-mobile.png`
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/MANUAL_RECIPE_CREATE-steps-mobile.png`
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/MANUAL_RECIPE_CREATE-narrow.png`
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/YT_IMPORT-review-mobile.png`
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/YT_IMPORT-review-narrow.png`
- QA reports:
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/exploratory-report.json`
  - `ui/designs/evidence/design-polish-slice5-manual-youtube/eval-result.json`
- Claude status: Stage 1 and Stage 4/final authority were requested through resume session `b475ec3a-c10b-42ae-9c38-1df94982e645`; provider limit blocked execution, so Codex completed fallback per user instruction.
