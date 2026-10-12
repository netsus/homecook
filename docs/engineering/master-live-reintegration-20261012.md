# Master·운영 웹 재통합 기록

상태: 로컬 통합 후보 작성 및 검증 중. 운영 DB·웹·worker 미반영.

## 고정 입력과 제외 범위

- master 기준: `7e466b170ba39795220ef64e67eac3fab4429420`
- 현재 운영 웹 이력: `f970bc1d1f1e981d8947e852a9b51ada4a74570a`
- 공통 조상: `5d9c5b09624dff83b43d91983704cec3171087da`
- 운영 worktree의 미커밋 Gabia·법적 문서 변경은 포함하지 않았다.
- 미완성 leftovers, 보류 `444fe1f6f`, P5 평가 43커밋과 source-bound quantity worker 후보는 포함하지 않는다.

운영 전용 25커밋의 기능은 master의 기존 PR과 후속 리팩터링에 이미 동일하거나 동등하게 반영돼 있다. 운영 웹과 master가 공유하는 migration source는 byte 차이가 없고, master에만 운영 원장에 이미 적용된 source closure 두 개가 더 있다. 따라서 merge는 운영 커밋을 조상으로 연결하되, 아래 47개 충돌에서는 검증된 최신 master 구현을 유지했다.

충돌을 해결한 직후 새 문서를 추가하기 전 `git diff --cached --quiet HEAD`가 0을 반환해 merge tree가 master tree와 동일함을 확인했다. 운영 동작의 동등성은 아래 대응 커밋과 통합 후보의 회귀 검사로 다시 검증한다.

## 파일별 충돌 결정

### 규칙과 애플리케이션 코드

| 파일 | 결정 근거 |
| --- | --- |
| `AGENTS.md` | `74f312061`의 최신 로컬 Anti Slop 개발 규칙을 유지한다. |
| `app/api/v1/food-catalog/search/route.ts` | `9f8f16e83`의 typed RPC 경계가 운영 beta 조회 계약을 보존하면서 cast를 제거한다. |
| `app/api/v1/ingredients/route.ts` | `979c58961`의 통합 검색 순위 구현이 운영 canonical search의 후속 구현이다. |
| `app/api/v1/planner/route.ts` | `c4091efa7`의 product planner RPC 검증이 운영 응답 계약의 후속 구현이다. |
| `components/recipe/manual-recipe-create-screen.tsx` | `3c0ea2b8c`의 명시적 payload가 운영 수동 레시피 흐름을 보존한다. |
| `components/recipe/recipe-food-catalog-picker.tsx` | `0f084fcff`의 catalog projection 정리가 운영 picker 동작의 후속 구현이다. |
| `components/recipe/youtube-import-screen.tsx` | `c66f8d8e5`의 multi-recipe promoted child 저장·반복 클릭 보호가 운영 v63 화면보다 최신이다. |
| `lib/api/leftovers.ts` | `10e3bfbe4`에서 사용하지 않는 surface만 제거했으며 새 미완성 leftovers 작업은 포함하지 않는다. |
| `lib/nutrition/recipe-nutrition-display.ts` | `9697dace5`의 순수 표시 변환이 운영 calorie/macro 표시 계약의 후속 구현이다. |
| `lib/recipe-detail.ts` | `2bf786d59`의 product field projection이 운영 recipe detail 계약의 후속 구현이다. |
| `lib/recipe-editor-ingredients.ts` | `883465abc`의 step ingredient 교체 정리가 운영 편집 동작의 후속 구현이다. |
| `lib/server/cooked-batches.ts` | `75981abb4`의 optional projection 보존 구현을 유지한다. |
| `lib/server/ingredient-ai-nutrition-worker.ts` | `2e881445d`의 worker RPC row 검증을 유지하며 worker 배포나 설정은 변경하지 않는다. |
| `lib/server/meal-log.ts` | `44aa30236`의 optional projection 정리가 운영 식사 기록 계약의 후속 구현이다. |
| `lib/server/planner-meal-nutrition-view.ts` | `257c46d8a`의 nutrition view projection 정리를 유지한다. |
| `lib/server/recipe-ingredient-search.ts` | `f7f1afe4c`의 검색 matching 정리가 운영 canonical ingredient search의 후속 구현이다. |

### 배포·검증 도구

| 파일 | 결정 근거 |
| --- | --- |
| `scripts/deploy-prelaunch-web.mjs` | `717c15a6f`의 최신 DB/worker 경계와 rollback 차단을 유지한다. |
| `scripts/lib/mext-nutrition-snapshot.mjs` | `64ca7faa0`의 lint·파서 정리를 유지한다. |
| `scripts/lib/prelaunch-feedback-readiness.mjs` | `57cf351e8`의 고정 source pair와 DB 이력 검증을 유지한다. |
| `scripts/lib/prelaunch-web-deploy.mjs` | `717c15a6f`의 최신 분류·DB 비호환 rollback 보호를 유지한다. |
| `scripts/validate-security-function-authorization.mjs` | `2c920141b`의 최신 unit/security manifest 계약을 유지한다. |

### 공식 문서

다음 문서는 운영 후보의 중간 기록 대신 master에 병합된 실제 적용·후속 검증 기록을 유지했다.

- `docs/api문서-v1.2.43.md`
- `docs/db설계-v1.3.38.md`
- `docs/engineering/feedback-ui-polish-20261008.md`
- `docs/engineering/ingredient-ai-nutrition-20261008.md`
- `docs/engineering/ingredient-piece-unit-runtime-20261009.md`
- `docs/engineering/ingredient-unit-evidence-review-20261009.md`
- `docs/engineering/meal-log-dialog-fixes-20261009.md`
- `docs/engineering/planner-meal-log-redesign-20261006.md`
- `docs/engineering/prelaunch-web-deployment.md`
- `docs/engineering/recipe-nutrition-ui-20261009.md`
- `docs/engineering/youtube-resolution-release-20261010.md`
- `docs/engineering/youtube-user-trial-release-20261009.md`
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`

### 테스트

다음 충돌은 운영 후보의 이전 assertion 대신 master에서 제품 코드와 함께 갱신된 테스트를 유지했다. 운영 acceptance 동작은 통합 후보에서 관련 묶음과 브라우저 흐름으로 다시 실행한다.

- `tests/ingredient-ai-nutrition-worker.test.ts`
- `tests/ingredient-catalog-policy.test.ts`
- `tests/meal-log-add-sheet.test.tsx`
- `tests/meal-log-core.test.ts`
- `tests/meal-log-prelaunch-ui.test.tsx`
- `tests/mext-nutrition-snapshot.test.ts`
- `tests/planner-meal-nutrition-server.test.ts`
- `tests/prelaunch-ai-nutrition-readiness.test.ts`
- `tests/recipe-api-contracts.test.ts`
- `tests/recipe-food-catalog-picker.test.tsx`
- `tests/recipe-product-display.test.ts`
- `tests/youtube-result-first.ui.test.tsx`
- `tests/youtube-v63-runtime-integration.test.ts`

## 남은 통합 순서

1. 운영 이력 연결 merge commit을 고정한다.
2. master 기반 YouTube 레시피북·공개 검색·플래너 bridge 커밋을 적용한다.
3. 관련 회귀, post-218 대상 migration, 브라우저, build와 배포 plan을 검증한다.
4. 운영 DB 쓰기·백업·배포·push·PR은 별도 승인 전 실행하지 않는다.
