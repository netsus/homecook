# 수동 레시피 공개 준비의 기존 세션 컨텍스트 재사용

상태: `9c00ceeb096a23af2c52ff6e8854b5f34808af25` 기반의 별도 로컬 후보. 운영 반영·실제 저장 재시도는 이 문서 작성자의 검사 범위 밖이다. 수량 조회·표시 보완 묶음과 분리한다.

## 실패 경계와 수정

수동 저장은 먼저 `create_manual_recipe_recoverable`로 비공개 레시피와 영수증을 만들고, 영양 준비 후 `publish_manual_recipe`에서 공개와 runtime을 함께 완료한다. 준비가 실패하면 동일 영수증을 보존하며 `RECIPE_PREPARATION_PENDING`을 반환한다. 결과 확인 GET은 읽기만 수행하고, 화면의 후속 재시도는 원 POST 본문·키를 사용한다.

기존 `prepareRecipeNutritionSnapshot`은 수량 계산 모드를 알아내기 위해 `recipe-future-propagation` client에서 `build_recipe_nutrition_input_guard`를 HTTP 호출했다. 해당 경로는 이 scope에 등록돼 있지 않다. 새 scope·RPC·grant를 추가하지 않고 다음 기존 경로를 사용한다.

1. recoverable 수동 저장과 명시적 공개 route가 이미 검증한 `sessionAuthority`를 준비 함수에 전달한다. 요청 본문에서 authority나 모드를 받지 않는다.
2. 준비 함수는 기존 사용자 client로 읽은 소유자와 양의 정수 revision을 확인한다.
3. 기존 `readRecipeQuantityMode` → `read_recipe_snapshot_entrypoint_context`가 owner·generation·session과 같은 revision을 검증한다. 이 HTTP 경로는 기존 `20260919000000` migration의 정확 허용 경로다.
4. 확인된 v3/v4 모드에 따라 기존 영양 hydration·계산·input guard를 사용한다. 원량·분수·context hash와 최종 snapshot writer의 동시 수정 검증은 유지한다.

authoritative 모드는 현재 원문 행 유무나 env로 추측하지 않는다. 마지막 원문 행이 없어져도 서명 reader가 v4를 반환하면 v4를 유지하며, 원문이 있는데 v3로 반환되면 거절한다. 밀도 부족은 기존 `DENSITY_REQUIRED`·부분 영양으로 남는다. 공개 준비를 위해 밀도나 영양값을 만들지 않는다.

서명 reader의 `RecipeQuantityModeError`는 기존 파생 레시피 경로와 같은 `fail(code, message, status)` 응답으로 전달한다. recoverable 저장과 명시적 공개 모두 `ACCOUNT_SESSION_STALE`·`RECIPE_REVISION_CONFLICT`·`UNIT_CONTEXT_STALE`은 409, `RESOURCE_NOT_FOUND`는 404와 기존 안전 문구를 유지한다. 일반 준비 실패의 503 pending과 명시적 공개의 일반 오류 처리는 유지한다. 오류 문구를 검색해 권한을 추정하거나 raw DB 문구를 전달하지 않는다.

이 수정은 소스에서 재현한 비허용 호출을 제거한다. 기존 운영 로그 두 건의 정확한 RPC 이름을 관측했다는 주장은 하지 않는다. 실제 pending 레시피의 공개 완료와 추가 실행 오류 여부는 총괄의 별도 운영 확인 대상이다.

## 직접 호출자와 입력 원천

| 호출자 | 모드의 권위 원천 | 이번 변경 |
| --- | --- | --- |
| recoverable 수동 저장 | 기존 검증 세션과 owner/revision reader | verified authority 전달 |
| `POST /recipes/{id}/publish` | 기존 검증 세션·작성 영수증과 owner/revision reader | verified authority 전달 |
| AI 새로고침 | 기존 job-scoped 읽기로 받은 `bundle.input_guard` | 메모리 adapter의 해당 recipe guard 조회만 로컬 반환 |
| generation-legacy 수동 저장 2경로 | 기존 recalculate client | 기존 동작 보존, authority를 새로 합성하지 않음 |
| legacy YouTube 등록 | 기존 owned nutrition client | 기존 동작 보존, 실제 실행 복구를 주장하지 않음 |

AI adapter 보완은 네트워크 읽기가 아니다. 이미 받은 job bundle을 반환하고, 기존 코드가 독립 재구성한 guard와 전체 canonical 일치를 검사한 뒤에만 기존 writer를 호출한다. supplied guard의 수량 변조는 계속 거절한다. 기존 product 실패 fixture는 product-only의 `ingredient_id:null`과 빈 generic 후보로 정정했다. generic AI 후보로 제품 영양을 대체하는 기대를 추가하지 않았다.

AI job bundle의 모든 v4 소비나 legacy recalculate 경로의 실제 실행까지 이번 수정으로 검증한 것은 아니다. 새 AI 작업·worker 변경·과거 레시피 자동 재계산은 수행하지 않았다.

## 변경 파일과 단순화

- `lib/server/recipe-nutrition-service.ts`: 수동 공개의 모드 조회에 이미 있는 signed reader를 재사용한다.
- `app/api/v1/recipes/route.ts`, `app/api/v1/recipes/[id]/publish/route.ts`: 이미 확인한 authority를 전달한다.
- `lib/server/ingredient-ai-nutrition-refresh.ts`: 이미 보유한 guard를 로컬 adapter에서 반환한다.
- 위 경계의 기존 테스트 5개 파일: 허용 RPC·분수·unknown·소유자·세션·revision·원 키 재시도와 기존 SQL 원자성을 검사한다.

새 정책·환경 플래그·DB 함수·테이블·migration·의존성은 추가하지 않았다. 영양 공식, 양 계산식, 공개 transaction, receipt, 실제 운영 기록은 변경하지 않았다.

## 검증

검증 로그는 `/tmp/mumeok-manual-publication-context-evidence/`에 보존했다. 실제 키·운영 DB·브라우저·외부 AI·추출 API를 사용하지 않았다.

- RED: base `9c00ceeb`의 service 원문을 별도 `/tmp` alias로 읽어 새 수동 회귀 4개가 실패함을 재현했다. 첫 실패는 비허용 `build_recipe_nutrition_input_guard` 호출이며, 작업 소스를 되돌려 검사하지 않았다. `manual-red.log`.
- AI RED: 메모리 adapter 수정 전 기존 8개 중 4개가 비허용 adapter 호출로 실패했다. `ai-refresh-red.log`.
- 독립 리뷰 후 HTTP RED: 실제 `RecipeQuantityModeError` 4종을 두 공개 경계에 전달하는 8개 회귀가 수정 전 모두 실패했다. recoverable 저장은 503, 명시적 공개는 500으로 잘못 접혔다. 두 경계의 좁은 타입 매핑으로 보완했다. `error-boundary-red.log`·`error-boundary-green.log`.
- GREEN: HTTP 오류 회귀를 포함한 아래 관련 13개 파일, **193 PASS·실패 0·skip 0**, exit 0. `related-green.log`.
- `pnpm typecheck`: exit 0. `typecheck.log`.
- 변경 TypeScript 9개 파일 ESLint: exit 0, 경고·오류 0. `eslint.log`.
- `pnpm verify:anti-slop`: exit 0, 신규 finding 0·baseline 수정 0. `anti-slop.log`.
- `git diff --check`: exit 0.
- 가짜 loopback 환경의 기본 `pnpm build`: 정적 페이지 94/94 생성, exit 0. 변경 밖 기존 경고 4개는 유지한다. `build.log`. 별도 workerThreads 실행 설정은 compile/type 이후 정적 생성에서 `DataCloneError`로 실패했고 `build-workerthreads-failed.log`에 분리했다.

관련 검사 명령:

```sh
pnpm exec vitest run \
  tests/recipe-nutrition-service.test.ts \
  tests/manual-recipe-public-runtime-route.test.ts \
  tests/manual-recipe-publish-route.test.ts \
  tests/recipe-quantity-mode.test.ts \
  tests/ingredient-ai-nutrition-refresh.test.ts \
  tests/manual-recipe-publication.test.ts \
  tests/manual-recipe-publication-postgres.test.ts \
  tests/manual-recipe-create-client.test.ts \
  tests/manual-recipe-create-screen.test.tsx \
  tests/manual-recipe-publish-action.test.tsx \
  tests/manual-recipe-create.backend.test.ts \
  tests/youtube-register-tags-route.test.ts \
  tests/recipe-product-nutrition.test.ts
```

PostgreSQL 검사는 테스트가 새로 소유한 임시 schema-only cluster와 Unix socket을 사용했다. 실제 운영 DB 접근, 운영 migration 적용, 권한 확대를 뜻하지 않는다. 영양/이미지/runtime 실패 시 비공개 상태와 영수증을 함께 보존하는 기존 transaction·다른 owner 거절·중복 완료·정확 scope 거절을 확인했다.

기존 계약은 [수량 입력 v4](ingredient-quantity-policy-v4-20261013.md), [현재 v9 진행 기록](mumeok-beta-v9-progress-20261013.md), [공식 문서 경로](../sync/CURRENT_SOURCE_OF_TRUTH.md)를 따른다. 커밋·PR·머지·배포와 실제 pending 재시도는 총괄이 별도로 진행한다.
