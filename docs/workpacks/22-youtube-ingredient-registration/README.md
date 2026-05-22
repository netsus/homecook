# Slice: 22-youtube-ingredient-registration

## Goal

YouTube 설명란에서 새 재료가 추출됐을 때 매번 migration을 추가하지 않고, 사용자가 검수 화면에서 확인 후 표준 재료로 등록할 수 있게 한다. 등록된 재료는 현재 추출 draft의 해당 행을 `resolved`로 전환해 기존 레시피 등록 흐름을 계속 탈 수 있어야 한다.

이 슬라이스는 public API와 YT_IMPORT 화면 계약을 바꾸므로, Stage 1 docs/contract-evolution PR에서 공식 문서(v1.6.9 / v1.5.6 / v1.3.6 / DB v1.3.5 / API v1.2.7)를 먼저 잠근 뒤 구현한다.

## Branches

- 계약/백엔드: `feature/be-22-youtube-ingredient-registration`
- 프론트엔드: `feature/fe-22-youtube-ingredient-registration`

## In Scope

- 화면:
  - `YT_IMPORT` 검수 단계의 unresolved / needs_review 재료 행
  - 새 재료 등록 sheet 또는 modal (기존 재료 검색 모달 패턴 재사용)
- API:
  - 기존 `POST /api/v1/recipes/youtube/extract` 응답의 extracted ingredient에 `draft_ingredient_id` 추가
  - 신규 계약 후보: `POST /api/v1/recipes/youtube/ingredient-registration`
  - 기존 `POST /api/v1/recipes/youtube/register` 저장 차단 규칙 유지
  - 기존 `GET /api/v1/ingredients` 검색/교체 흐름 유지
- 상태 전이:
  - unresolved / needs_review row → 사용자 확인 등록 성공 → resolved
  - resolved row만 최종 레시피 등록 가능
- DB 영향:
  - `ingredients` INSERT 또는 기존 row 재사용
  - `ingredient_synonyms` INSERT 또는 conflict skip
  - `youtube_extraction_sessions` owner/status/expiry 검증용 read
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/<timestamp>_register_youtube_ingredient_rpc.sql` 생성 필요

### 구현 범위

- 새 재료 등록 API route + Postgres RPC 연결
- YouTube extract 단계에서 각 추출 재료에 서버 생성 `draft_ingredient_id`를 부여하고 `youtube_extraction_sessions.draft_json`과 extract 응답에 저장
- 등록 입력 validation: 표준명, 카테고리, 기본 단위, 원문 synonym
- 중복 표준명 idempotency: 이미 같은 `standard_name`이 있으면 새 row를 만들지 않고 기존 ingredient를 반환
- synonym 안전 처리: 같은 synonym이 다른 재료에 이미 붙어 있으면 자동 연결하지 않고 warning 반환
- YT_IMPORT UI: unresolved / needs_review에서 "새 재료로 등록" 액션 추가
- 등록 성공 후 클라이언트가 해당 row를 `resolved`로 갱신하고, 수량/단위/원문은 보존
- 테스트: API 정책, DB 무결성, UI 상태 전환, 실제 저장 가능 여부

## Out of Scope

- 사용자 확인 없는 자동 등록
- 대량 ingredient seed / migration 추가
- fuzzy / LLM 기반 자동 표준명 추정
- 전역 재료 관리 화면 또는 관리자 moderation queue
- 이미 저장된 레시피의 재료 재매핑
- YouTube 추출 session draft의 장기 재개/복구 UX
- ingredient category taxonomy 개편
- 사용자가 `+ 재료 추가`로 만든 client-only row의 새 표준 재료 등록 (이 슬라이스는 서버 추출 row의 `draft_ingredient_id`가 있는 항목만 대상)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `19-youtube-import` | merged | [x] |
| `20-youtube-real-import` | merged | [x] |
| `21-ingredient-dictionary` | merged | [x] |
| contract-evolution 공식 문서 PR | required-before-implementation | [ ] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 구현을 시작하지 않는다. 이 슬라이스는 공식 문서에 없는 API와 화면 상태를 추가하므로, Stage 2 구현 전에 contract-evolution PR을 먼저 merge한다.

## Backend First Contract

### 계약 상태

Stage 1 docs/contract-evolution PR에서 공식 문서를 v1.6.9 / v1.5.6 / v1.3.6 / DB v1.3.5 / API v1.2.7로 갱신한다. 이 PR이 main에 merge되기 전에는 Stage 2 구현을 시작하지 않는다.

### Proposed Endpoint

`POST /api/v1/recipes/youtube/ingredient-registration`

사용자가 특정 YouTube 추출 session 안의 unresolved / needs_review 재료를 새 표준 재료 또는 기존 표준 재료로 확정한다.

### Extract Response Extension

기존 `POST /api/v1/recipes/youtube/extract` 응답의 각 extracted ingredient에 서버 생성 `draft_ingredient_id`를 추가한다. 같은 값은 `youtube_extraction_sessions.draft_json.ingredients[]`에도 저장한다.

```json
{
  "draft_ingredient_id": "uuid",
  "standard_name": "연겨자",
  "raw_text": "연겨자 0.2스푼",
  "resolution_status": "unresolved"
}
```

이 ID는 registration endpoint의 draft row 식별자로만 사용한다. 사용자가 검수 화면에서 이름, 수량, 단위, 순서를 수정해도 `draft_ingredient_id`는 유지한다.

**Request body 후보:**

```json
{
  "extraction_id": "uuid",
  "draft_ingredient_id": "uuid",
  "standard_name": "연겨자",
  "category": "양념",
  "default_unit": null,
  "synonym": "연겨자"
}
```

**Validation:**

- `extraction_id`: UUID 필수
- `draft_ingredient_id`: UUID 필수. session `draft_json.ingredients[]` 안의 unresolved / needs_review row와 매칭되어야 함
- `standard_name`: trim 후 1~100자, 제어문자 금지, 내부 연속 공백 collapse
- `category`: 채소 / 육류 / 해산물 / 양념 / 유제품 / 곡류 / 기타 중 하나
- `default_unit`: null 또는 20자 이하 문자열
- `synonym`: null 가능. 값이 있으면 trim + 영어 lower-case 저장

**Response body 후보:**

```json
{
  "success": true,
  "data": {
    "ingredient": {
      "ingredient_id": "uuid",
      "standard_name": "연겨자",
      "category": "양념",
      "default_unit": null,
      "resolution_status": "resolved"
    },
    "synonym_status": "attached",
    "warnings": []
  },
  "error": null
}
```

`synonym_status` 값:

- `attached`: synonym이 현재 ingredient에 연결됨
- `already_attached`: 이미 같은 ingredient에 연결돼 있었음
- `skipped_same_as_standard`: `lower(trim(synonym)) === lower(trim(standard_name))`이면 저장하지 않음
- `skipped_ambiguous`: 같은 synonym이 다른 ingredient에 이미 연결돼 있어 저장하지 않음
- `not_requested`: synonym 입력이 없음

### Permission / State / Idempotency

- 인증된 사용자만 호출 가능. 미인증은 401.
- `youtube_extraction_sessions.user_id`가 현재 사용자와 다르면 404.
- session이 없으면 404.
- session이 만료됐으면 410.
- session status가 더 이상 등록 가능한 draft 상태가 아니면 409.
- 요청의 `draft_ingredient_id`가 session draft의 unresolved / needs_review 재료와 맞지 않으면 409.
- 같은 `standard_name`이 이미 있으면 기존 ingredient를 반환하고 새 row를 만들지 않는다.
- 같은 요청을 두 번 보내도 ingredient / synonym 중복 row가 생기지 않는다.
- DB 작업은 Postgres RPC `register_youtube_ingredient(...)`로 묶는다. RPC는 표준 재료 upsert/reuse, ingredient 조회, optional synonym 처리, `synonym_status` 반환을 하나의 transaction 안에서 수행한다.
- registration API는 `youtube_extraction_sessions.draft_json`을 수정하지 않는다. `draft_json`은 원본 추출 snapshot/provenance로 유지한다.
- registration API가 반환한 `ingredient_id`와 canonical `standard_name`을 사용해 클라이언트가 현재 검수 화면의 로컬 row를 `resolved`로 업데이트한다.

### Error Codes

- 400 `BAD_REQUEST`: JSON 형식 오류
- 401 `UNAUTHORIZED`: 로그인 필요
- 404 `NOT_FOUND`: session 없음 또는 소유자 불일치
- 409 `CONFLICT`: session 상태 불일치, draft row 불일치, 이미 resolved row
- 410 `SESSION_EXPIRED`: 추출 session 만료
- 422 `VALIDATION_ERROR`: 표준명/카테고리/default_unit/synonym 입력 오류
- 500 `INTERNAL_ERROR`: DB/RPC 실패

## Frontend Delivery Mode

- 디자인 확정 전: 기존 `RecipeIngredientAddModal` / bottom sheet 패턴에 맞춘 기능 가능한 임시 UI
- 필수 상태:
  - `loading`: 등록 제출 중 row 또는 modal submit disable
  - `empty`: 기존 검색 결과가 없을 때 새 등록 CTA 노출
  - `error`: validation/API 실패 메시지와 재시도
  - `unauthorized`: 로그인 안내 후 원래 import 흐름 복귀
  - `conflict`: session 만료/row 불일치 시 재추출 안내
- 로그인 보호 액션이면 return-to-action 포함

## Design Authority

- UI risk: `low-risk`
- Anchor screen dependency: 없음
- Visual artifact: Stage 4에서 `ui/designs/evidence/22-youtube-ingredient-registration/` screenshot evidence 생성
- Authority status: `not-required`
- Notes: 새 화면이 아니라 기존 YT_IMPORT 검수 행과 modal 패턴의 확장이다. 다만 모바일 좁은 폭에서 row validation, 액션 버튼, 등록 sheet가 겹치지 않는지는 Stage 5 public review에서 확인한다.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, Tailwind/공용 컴포넌트 정리 완료
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/19-youtube-import/README.md`
- `docs/workpacks/20-youtube-real-import/README.md`
- `docs/workpacks/21-ingredient-dictionary/README.md`
- `docs/api문서-v1.2.7.md` — `draft_ingredient_id`, ingredient-registration endpoint, YouTube extract/register 계약
- `docs/화면정의서-v1.5.6.md` — `YT_IMPORT` 검수 단계와 새 재료 등록 UI
- `docs/요구사항기준선-v1.6.9.md` — YouTube URL 등록, 재료 검수, 미등록 재료 등록 정책
- `docs/유저flow맵-v1.3.6.md` — YouTube 등록 flow
- `docs/db설계-v1.3.5.md` — `ingredients`, `ingredient_synonyms`, `youtube_extraction_sessions`, registration RPC
- [lib/server/youtube-import.ts](../../../lib/server/youtube-import.ts)
- [app/api/v1/ingredients/route.ts](../../../app/api/v1/ingredients/route.ts)
- [components/recipe/youtube-import-screen.tsx](../../../components/recipe/youtube-import-screen.tsx)
- [components/recipe/recipe-ingredient-add-modal.tsx](../../../components/recipe/recipe-ingredient-add-modal.tsx)

## QA / Test Data Plan

- **Fixture baseline**:
  - YouTube extraction session owner / non-owner / expired / consumed fixture
  - unresolved ingredient: `연겨자 0.2스푼`
  - needs_review ingredient: ambiguous synonym 후보가 있는 `파`
  - existing ingredient duplicate: `간장`
  - synonym conflict: 같은 synonym이 다른 ingredient에 이미 연결된 케이스
- **Real DB smoke 경로**:
  - `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
  - 실제 실패 설명란에서 `연겨자` 같은 미등록 재료 등록 후 row resolved 확인
  - 이어서 `POST /api/v1/recipes/youtube/register`로 저장 가능 확인
- **Seed / reset 명령**:
  - `pnpm local:reset:demo`
  - 필요 시 `pnpm dlx supabase migration up`
- **Bootstrap 선행 조건**:
  - `ingredients`, `ingredient_synonyms`, `youtube_extraction_sessions` 테이블 존재
  - 21번 재료 사전 migration merge 완료
- **Blocker 조건**:
  - 공식 문서 contract-evolution 미완료
  - RPC 경계 없이 partial insert 가능성이 남아 있음
  - category validation 기준 불명확
  - `draft_ingredient_id`가 extract 응답과 session `draft_json`에 동시 저장되지 않음

## Key Rules

- 새 재료 자동 등록 금지. 반드시 사용자 확인 후 등록한다.
- 등록은 현재 YouTube extraction session과 사용자 소유권을 검증한 뒤에만 허용한다.
- `ingredients`는 global master data이므로 표준명 validation을 강하게 적용한다.
- 기존 `standard_name`이 있으면 새 row를 만들지 않고 기존 row를 재사용한다.
- synonym이 표준명과 같은지는 `lower(trim(synonym)) === lower(trim(standard_name))`로 비교한다.
- ambiguous synonym 검사는 best-effort advisory query다. `SELECT ... WHERE synonym = $normalized AND ingredient_id != $ingredient_id` 결과가 있으면 insert를 skip하고 `skipped_ambiguous` warning을 반환한다.
- schema에는 global `UNIQUE(synonym)`을 추가하지 않는다. 경합으로 같은 synonym이 여러 ingredient에 연결돼도 기존 `findIngredientIds`가 multi-candidate를 `needs_review`로 처리하므로 데이터 오염이 아니라 검수 대상으로 귀결된다.
- 현재 row를 `resolved`로 바꾸는 동작은 클라이언트 로컬 상태 업데이트다. 수량, 단위, `display_text`, `raw_text`는 보존한다.
- 서버는 registration 성공 시 `youtube_extraction_sessions.draft_json`을 update하지 않는다.
- `needs_review` 상태에서 임의 첫 후보를 자동 선택하지 않는다.
- session 만료/상태 불일치/row 불일치는 조용히 성공 처리하지 않고 409/410으로 드러낸다.
- 최종 recipe register API는 기존처럼 unresolved / needs_review가 남아 있으면 저장을 차단한다.

## Contract Evolution Decisions

| 기존 계약 | 확정 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- |
| `GET /ingredients`만 존재, 새 재료 생성 API 없음 | `POST /api/v1/recipes/youtube/ingredient-registration` 추가 | migration 없이 미등록 재료를 사용자 확인으로 등록하고 현재 추출을 계속 진행 | `docs/api문서-v1.2.7.md`, `docs/화면정의서-v1.5.6.md`, `docs/요구사항기준선-v1.6.9.md`, `docs/유저flow맵-v1.3.6.md`, `docs/db설계-v1.3.5.md` | approved-in-docs-pr |
| extract 응답 재료에 stable row id 없음 | 각 extracted ingredient에 `draft_ingredient_id` 추가하고 `draft_json`에도 저장 | 검수 중 이름/순서가 바뀌어도 안전하게 대상 row 식별 | `docs/api문서-v1.2.7.md`, `docs/db설계-v1.3.5.md`, `docs/화면정의서-v1.5.6.md` | approved-in-docs-pr |
| YT_IMPORT unresolved는 검색 교체만 명시 | unresolved / needs_review row에서 "새 재료로 등록" 액션 추가 | 검색 결과가 없는 신규 재료도 흐름 중단 없이 처리 | `docs/화면정의서-v1.5.6.md`, `docs/유저flow맵-v1.3.6.md` | approved-in-docs-pr |
| DB 문서에는 table만 명시 | `register_youtube_ingredient(...)` RPC contract 추가 | ingredient + synonym 부분 성공 방지 | `docs/db설계-v1.3.5.md`, `docs/api문서-v1.2.7.md` | approved-in-docs-pr |

## Primary User Path

1. 사용자가 YouTube URL을 추출한다.
2. 검수 화면에서 `연겨자` 같은 새 재료가 `재료를 찾지 못했어요` 상태로 보인다.
3. 사용자가 "새 재료로 등록"을 누른다.
4. 등록 sheet에서 표준명, 카테고리, optional synonym을 확인하고 제출한다.
5. 클라이언트는 해당 row의 `draft_ingredient_id`와 사용자가 확인한 표준명/카테고리를 registration API로 보낸다.
6. 서버가 session 소유권과 `draft_ingredient_id` row 상태를 검증한 뒤 ingredient를 생성하거나 기존 ingredient를 재사용한다.
7. 서버는 `ingredient_id`와 canonical `standard_name`을 반환하고, `draft_json`은 수정하지 않는다.
8. 클라이언트가 현재 row를 `resolved`로 바꾸고, 다른 차단 항목이 없으면 레시피 저장 버튼이 활성화된다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 계약/백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

- [ ] contract-evolution 공식 문서 PR merge 완료 <!-- omo:id=delivery-contract-evolution-merged;stage=1;scope=shared;review=3,5,6 -->
- [ ] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] API route + RPC 연결 <!-- omo:id=delivery-api-rpc;stage=2;scope=backend;review=3,6 -->
- [ ] 프론트 타입 반영 <!-- omo:id=delivery-types;stage=4;scope=shared;review=5,6 -->
- [ ] YT_IMPORT row UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 새 재료 등록 modal/sheet UI 연결 <!-- omo:id=delivery-register-sheet;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / conflict / unauthorized` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
