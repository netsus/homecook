# Slice: 25-youtube-bulk-ingredient-resolution

## Goal

YouTube 설명란 추출 시 여러 재료가 동시에 `unresolved` / `needs_review` 상태일 때, 하나씩 모달을 열고 닫는 대신 한 화면에서 일괄 확인·등록·해소할 수 있게 한다. 사용자가 미등록 재료가 많더라도 흐름이 끊기지 않고 빠르게 검수를 마칠 수 있어야 한다.

## Branches

- 프론트엔드: `feature/fe-25-youtube-bulk-ingredient-resolution`

## In Scope

- 화면:
  - `YT_IMPORT` 검수 단계에 "일괄 등록" 진입 CTA 추가 (unresolved/needs_review row가 2건 이상일 때 노출)
  - Bulk Resolution Sheet/Modal: unresolved / needs_review row 목록을 한 화면에 나열, 행별 표준명·카테고리 확인/수정, skip 가능, "선택 항목 등록" 일괄 제출
  - 행별 등록 결과: 성공 row는 resolved 전환, 실패 row는 error 표시 + 재시도
  - 기존 단건 등록 flow(`IngredientRegisterModal`)도 그대로 유지
- API:
  - 기존 `POST /api/v1/recipes/youtube/ingredient-registration` 순차 호출 (public API 계약 변경 없음)
  - 프론트엔드 내부 helper: 선택된 row를 순차적으로 기존 endpoint에 제출하고 행별 결과를 수집
- 상태 전이:
  - bulk sheet에서 등록 성공 → 해당 row `resolved` 전환 (기존 단건 flow와 동일)
  - bulk sheet에서 등록 실패 → 해당 row 기존 상태 유지, 행별 error 표시
  - bulk sheet 닫기 → 검수 화면의 전체 ingredient 상태 반영
- DB 영향:
  - 이 슬라이스에서 새 schema, migration, endpoint, RPC를 추가하지 않는다.
  - 이 슬라이스에서 새 DB write path를 도입하지 않는다.
  - 런타임에 선택된 row는 기존 `POST /api/v1/recipes/youtube/ingredient-registration` 경로를 통해 `ingredients` INSERT/재사용 및 `ingredient_synonyms` INSERT/skip을 수행한다 (슬라이스 22에서 정의된 기존 write path).
  - `youtube_extraction_sessions`는 session 소유권·만료·상태 검증용 read-only 참조.
- Schema Change:
  - [x] 없음 (이 슬라이스에서 새 migration / schema 변경 없음)
  - [ ] 있음

## Out of Scope

- 새 public API endpoint (bulk registration endpoint) 추가 — 기존 단건 API 순차 호출로 충분
- 백엔드 API 또는 RPC 변경
- DB schema 변경 또는 migration 추가
- 파서 정확도 개선 (슬라이스 24에서 종료)
- LLM / caption / ASR / OCR 기반 추출
- `needs_review` row의 candidate 자동 선택 또는 AI 기반 자동 매핑
- 기존 단건 등록 modal(`IngredientRegisterModal`) 삭제 또는 대체
- `+ 재료 추가`로 만든 client-only row의 bulk 등록 (서버 추출 row의 `draft_ingredient_id`가 있는 항목만 대상)
- 전역 재료 관리 화면 또는 관리자 moderation queue
- ingredient category taxonomy 개편

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `22-youtube-ingredient-registration` | merged | [x] |
| `24-youtube-parser-dictionary-hardening` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태다.

## Backend First Contract

### 계약 상태

기존 공식 문서 계약을 그대로 사용한다. 새 API endpoint, 새 RPC, schema 변경이 없다.

### 사용할 기존 Endpoint

`POST /api/v1/recipes/youtube/ingredient-registration` (API v1.2.10 §6-3)

프론트엔드 bulk helper가 선택된 N건의 unresolved/needs_review row를 순차적으로 이 endpoint에 제출한다.

**Request body** (건별, 기존과 동일):

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

**Response body** (건별, 기존과 동일):

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

### Permission / State / Idempotency

기존 단건 등록과 동일한 서버 검증을 통과한다:
- 인증된 사용자만 호출 가능 (401)
- session 소유권 검증 (404)
- session 만료 검증 (410)
- session draft 상태 검증 (409)
- `draft_ingredient_id` row 상태 검증 (409)
- 같은 `standard_name` 중복 → 기존 ingredient 재사용
- 같은 요청 2회 → ingredient/synonym 중복 row 없음

### Error Codes (기존과 동일)

- 400 `BAD_REQUEST`: JSON 형식 오류
- 401 `UNAUTHORIZED`: 로그인 필요
- 404 `NOT_FOUND`: session 없음 또는 소유자 불일치
- 409 `CONFLICT`: session 상태 불일치, draft row 불일치, 이미 resolved row
- 410 `SESSION_EXPIRED`: 추출 session 만료
- 422 `VALIDATION_ERROR`: 표준명/카테고리/default_unit/synonym 입력 오류
- 500 `INTERNAL_ERROR`: DB/RPC 실패

### Bulk Helper 동작 (프론트엔드 내부)

1. 사용자가 bulk sheet에서 등록 대상 row를 선택하고 "선택 항목 등록" 제출
2. 프론트엔드 helper가 선택된 row를 **순차적으로** 기존 `registerYoutubeIngredient()` 호출
3. 각 호출 결과를 행별로 수집: 성공 → resolved 전환, 실패 → error 상태로 전환
4. 모든 호출 완료 후 결과 요약 표시 (N건 성공, M건 실패)
5. 실패 row는 bulk sheet에 남아 재시도 가능

> 순차 호출이므로 N건 등록 시 N번의 네트워크 왕복이 발생한다. 일반적인 YouTube 추출에서 unresolved 재료는 1~10건 수준이므로 순차 호출로 충분하다.

## Frontend Delivery Mode

- 디자인 확정 전: 기존 `IngredientRegisterModal` bottom sheet 패턴을 확장한 기능 가능한 임시 UI
- 필수 상태:
  - `loading`: bulk 등록 제출 중 전체 sheet disable + 현재 처리 중인 row에 spinner
  - `empty`: unresolved/needs_review row가 없으면 bulk CTA 미노출 (진입 불가)
  - `error`: 행별 등록 실패 메시지 + 재시도, 전체 실패 시 sheet-level error
  - `read-only`: session consumed/expired 시 bulk sheet 비활성
  - `unauthorized`: 로그인 안내 후 원래 import 흐름 복귀
- 로그인 보호 액션이면 return-to-action 포함

## Design Authority

- UI risk: `low-risk`
- Anchor screen dependency: 없음 (`YT_IMPORT`는 anchor screen이 아님)
- Visual artifact: Stage 4에서 mobile default + mobile narrow screenshot evidence 촬영 예정
- Authority status: `not-required`
- Notes: 새 화면이 아니라 기존 확정된 `YT_IMPORT` 검수 화면과 `IngredientRegisterModal` sheet 패턴의 확장이다. 슬라이스 22에서 단건 등록 sheet가 low-risk로 확정(`confirmed`)되었고, 이 슬라이스는 같은 패턴의 bulk 버전이므로 low-risk로 분류한다. design-generator/design-critic 생략 근거: 기존 confirmed YT_IMPORT sheet 패턴 재사용, 새 interaction model 도입 없음.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, Tailwind/공용 컴포넌트 정리 완료
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/22-youtube-ingredient-registration/README.md`
- `docs/workpacks/24-youtube-parser-dictionary-hardening/README.md`
- `docs/api문서-v1.2.10.md` — §6-3 `POST /recipes/youtube/ingredient-registration`
- `docs/화면정의서-v1.5.7.md` — §10 `YT_IMPORT` 검수 단계
- `docs/요구사항기준선-v1.7.0.md` — §2-4 YouTube 미등록 재료 등록 정책
- `docs/db설계-v1.3.6.md` — `ingredients`, `ingredient_synonyms`, `youtube_extraction_sessions`
- [components/recipe/youtube-import-screen.tsx](../../../components/recipe/youtube-import-screen.tsx)
- [lib/api/youtube-import.ts](../../../lib/api/youtube-import.ts)

## QA / Test Data Plan

- **Fixture baseline**:
  - YouTube extraction session with 5+ unresolved/needs_review ingredients (bulk 테스트용)
  - 기존 22번 슬라이스 fixture 재사용: owner/non-owner/expired/consumed session, 단건 등록 케이스
  - bulk 등록 시 일부 성공 + 일부 실패 (validation error, ambiguous synonym) 혼합 시나리오
- **Real DB smoke 경로**:
  - `pnpm dev:demo` 또는 `pnpm dev:local-supabase`
  - 실제 YouTube 추출에서 3건 이상 미등록 재료 발생 시 bulk sheet 열고 일괄 등록 → resolved 확인
  - 이어서 `POST /api/v1/recipes/youtube/register`로 레시피 저장 가능 확인
- **Seed / reset 명령**:
  - `pnpm local:reset:demo`
- **Bootstrap 선행 조건**:
  - `ingredients`, `ingredient_synonyms`, `youtube_extraction_sessions` 테이블 존재
  - 슬라이스 21/22/24 merge 완료
  - `register_youtube_ingredient` RPC 존재
- **Blocker 조건**:
  - bulk sheet에서 순차 호출 중 session 만료 시 나머지 row 처리 정책 미확정 → session 만료 감지 시 남은 row 중단 + 전체 재추출 안내

## Key Rules

- 기존 단건 등록 flow는 유지한다. bulk sheet는 추가 경로이며 대체가 아니다.
- bulk sheet에서도 등록은 사용자 확인 후에만 실행한다. 자동 등록 금지.
- bulk helper는 기존 `POST /api/v1/recipes/youtube/ingredient-registration` endpoint를 순차 호출한다. 병렬 호출하지 않는다 (race condition 방지, session state 일관성).
- 개별 row 등록 실패가 다른 row 등록을 막지 않는다. 실패 row는 남기고 성공 row는 resolved로 전환한다.
- session 만료(410) 감지 시 남은 row 순차 호출을 중단하고 전체 재추출 안내를 표시한다.
- `draft_ingredient_id`가 없는 client-only row는 bulk sheet 대상에서 제외한다.
- `resolved` 상태 전환은 기존 단건 flow와 동일하게 클라이언트 로컬 상태 업데이트다. `draft_json`은 수정하지 않는다.
- bulk sheet 닫을 때 변경된 ingredient 상태를 검수 화면에 반영한다.

## Primary User Path

1. 사용자가 YouTube URL을 추출하고 검수 화면에 진입한다.
2. 추출된 재료 중 3건이 `unresolved`로 표시된다.
3. 검수 화면 상단 또는 재료 섹션에 "3건의 미등록 재료 일괄 등록" CTA가 보인다.
4. 사용자가 CTA를 누르면 bulk resolution sheet가 열린다.
5. sheet에 3건의 미등록 재료가 나열되고, 각 행에 표준명·카테고리·synonym 입력이 pre-fill되어 있다.
6. 사용자가 1건의 표준명을 수정하고, 1건은 skip 체크한다.
7. "2건 등록"을 누른다.
8. 순차적으로 2건이 등록되고, 각 행에 성공 결과가 표시된다.
9. sheet를 닫으면 검수 화면에서 2건은 resolved로 바뀌고, skip한 1건은 여전히 unresolved다.
10. 남은 1건은 기존 단건 flow나 재료 검색으로 교체하거나 다시 bulk sheet에서 처리한다.

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.
> 이 슬라이스는 FE-only이므로 백엔드 계약 고정은 기존 슬라이스 22에서 완료됨.
> Stage 4에서 프론트 관련 항목을, Stage 5~6에서 QA/디자인/closeout 항목을 닫는다.

- [ ] 백엔드 계약 고정 — 기존 API 재사용, 변경 없음 <!-- omo:id=delivery-backend-contract;stage=4;scope=shared;review=5,6 -->
- [ ] 프론트 타입 반영 (bulk helper 타입) <!-- omo:id=delivery-types;stage=4;scope=frontend;review=5,6 -->
- [ ] YT_IMPORT bulk CTA 진입점 UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] Bulk Resolution Sheet UI 구현 <!-- omo:id=delivery-bulk-sheet;stage=4;scope=frontend;review=5,6 -->
- [ ] 순차 호출 helper 구현 + 행별 결과 수집 <!-- omo:id=delivery-bulk-helper;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=4;scope=frontend;review=5,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=4;scope=frontend;review=5,6 -->
- [ ] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=4;scope=shared;review=5,6 -->
- [ ] `loading / empty / error / read-only / unauthorized` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
