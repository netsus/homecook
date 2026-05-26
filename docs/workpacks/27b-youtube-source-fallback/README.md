# Slice: 27b-youtube-source-fallback

## Goal
YouTube 설명란에서 재료는 추출했지만 구체적인 조리 과정(steps)이 없는 영상에 대해, (1) transcript provider adapter 경계를 설계하고 compliant no-LLM transcript source 사용 가능 여부를 검증하며, (2) compliant source가 있으면 조리 단계를 결정론 파서로 보충하고, (3) provider 미가용 시에도 부분 추출 draft UX를 명시적으로 지원하여 사용자가 빈칸 채우기로 레시피를 완성할 수 있게 한다. LLM 기반 추출은 범위 밖이다.

## Branches

- 백엔드: `feature/be-27b-youtube-source-fallback`
- 프론트엔드: `feature/fe-27b-youtube-source-fallback`

## In Scope
- 화면: `YT_IMPORT` (Step 2 추출 결과에 사용된 소스 표시, Step 3 부분 추출 draft 검수 UX)
- API:
  - `POST /recipes/youtube/extract` — transcript fallback 경로 추가, `extraction_methods` 배열에 `caption` 추가 가능 (compliant provider가 step을 실제로 제공한 경우에만), 응답 shape 불변
  - `POST /recipes/youtube/register` — 부분 draft 등록 허용 조건 변경 없음 (기존 blocking issue 정책 유지)
- 상태 전이: 변경 없음 (`draft` → `consumed` / `expired` 유지)
- DB 영향:
  - `youtube_extraction_sessions.extraction_methods` — `["description"]` 외에 `["description", "caption"]` 조합 기록 가능 (기존 text[] 컬럼, DDL 변경 없음). `caption`은 compliant provider가 실제 step 텍스트를 제공한 경우에만 기록
  - `youtube_extraction_sessions.extraction_meta_json` — transcript 가용성/provider 사용 여부/실패 사유 진단 정보 추가 (기존 jsonb, DDL 변경 없음)
  - `youtube_extraction_sessions.draft_json` — transcript에서 보충된 steps 포함 (기존 jsonb, DDL 변경 없음)
  - `youtube_extraction_sessions.raw_source_text` — transcript 텍스트 보존 가능 (기존 nullable text, DDL 변경 없음)
  - `ingredients` / `ingredient_synonyms` — 사전 시딩 추가 가능 (기존 seed migration 패턴)
- Schema Change:
  - [x] 없음 (DDL 변경 없음, 기존 text[]/jsonb 컬럼 활용, 필요 시 DML-only seed migration)
- 구현 구조:
  1. `videos.list` 응답의 `contentDetails.caption` 필드로 자막 존재 여부를 저비용 신호로 활용 (기존 extract 호출에 이미 포함, 추가 quota 없음)
  2. `TranscriptProvider` adapter 인터페이스를 설계하여 transcript source를 교체 가능하게 유지
  3. Stage 2에서 compliant no-LLM transcript source의 feasibility를 검증 (아래 Feasibility Risk 참조)
  4. compliant source가 없으면 provider adapter는 no-op으로 유지하고 부분 추출 draft UX + explicit non-ready handling만 출하

## Out of Scope
- LLM 기반 추출 기본 구현 (API 비용/제품 정책 미결정, feature-flag 후보로만 문서화)
- OCR / 영상 프레임 추출
- 외부 재료 데이터 인제스트 (slice 28 범위)
- 설명란/transcript에 구체적인 요리 텍스트가 없는 영상의 자동 registration-ready 주장
- public API response shape 변경 (`ingredients[]`, `steps[]` 필드 구조 불변)
- multi-recipe 선택 UI
- `ingredient_categories` / `cooking_method_categories` 신규 DB registry table
- legacy field 제거
- ingredient category 7종 확장
- 신규 화면 / 기존 화면 재설계 (YT_IMPORT 내부 상태 추가에 한정)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `27-youtube-import-quality-uplift` | merged | [x] |
| `pre-27-taxonomy-consumer-alignment` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.
> `28-external-ingredient-data-ingest-gate`는 이 슬라이스의 선행 조건이 아니다. source fallback은 외부 인제스트와 독립적으로 진행한다.

## Backend First Contract

### 기존 엔드포인트 (shape 변경 없음)
- `POST /recipes/youtube/validate` — URL 검증 + oEmbed preview (변경 없음)
- `POST /recipes/youtube/extract` — 추출 + 세션 생성 (transcript provider fallback 경로 추가)
- `POST /recipes/youtube/ingredient-registration` — 미등록 재료 등록 (변경 없음)
- `POST /recipes/youtube/register` — 레시피 등록 (변경 없음)

### Transcript Fallback 경로 (extract 내부)
- **트리거 조건**: description 파싱 결과 재료 >= 1건이지만 concrete step instruction == 0건
- **capability 신호**: 기존 `videos.list` 응답의 `contentDetails.caption` 필드 (`true`/`false`)로 자막 존재 여부를 저비용 확인 (추가 API 호출/quota 없음)
- **provider adapter**: `TranscriptProvider` 인터페이스로 transcript source를 추상화. Stage 2에서 compliant source 사용 가능 여부를 검증하고, 가능하면 구현체를 연결
- **step 파서**: transcript 텍스트에서 조리 과정을 결정론 규칙으로 추출 (LLM 없음)
- **응답 변경점**: `extraction_methods` 배열에 `"caption"` 추가 (compliant provider가 실제 step 텍스트를 제공한 경우에만, 기존 shape 내)
- **provider 미가용 시**: fallback 시도 없이 기존 description-only 결과 반환, `extraction_meta_json`에 provider 상태 기록

### 부분 추출 draft 상태
- description-only 결과에서 재료는 있지만 step이 없거나 불완전한 경우 → draft에 부분 추출 진단 기록
- transcript fallback 시도 후에도 step이 불완전한 경우 → 동일 부분 추출 진단
- provider adapter가 no-op인 경우에도 부분 draft는 세션에 저장되고 검수 화면에서 사용자가 수동 보완 가능
- 부분 추출 판단은 클라이언트에서 `blocking_issues`와 `steps` 길이로 유도

### 응답 envelope
- `{ success, data, error }` 기존 형식 유지
- `data.ingredients[]` shape 불변
- `data.steps[]` shape 불변
- `data.extraction_methods` = `["description"]` (기본) 또는 `["description", "caption"]` (compliant provider가 step을 제공한 경우에만)
- `data.blocking_issues` — 기존 배열 유지, step 부재 시 `missing_steps` blocking issue 포함

### 에러 응답 (기존)
| HTTP | code | 조건 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 미인증 |
| 404 | FEATURE_DISABLED | feature flag off |
| 404 | EXTRACTION_NOT_FOUND | 세션 없음 또는 cross-user |
| 409 | EXTRACTION_ALREADY_REGISTERED | 이미 consumed |
| 409 | EXTRACTION_MISMATCH | video ID 불일치 |
| 410 | EXTRACTION_EXPIRED | 24h TTL 초과 |
| 422 | INVALID_URL | URL 형식 오류 |
| 422 | NOT_RECIPE_VIDEO | non_recipe classification |
| 422 | VALIDATION_ERROR | 입력 검증 실패 |
| 429 | QUOTA_EXCEEDED | YouTube API quota 소진 |
| 502 | PROVIDER_ERROR | YouTube API 호출 실패 |

> Transcript provider 실패는 502를 반환하지 않고 graceful degradation: description-only 결과를 그대로 반환하고 `extraction_meta_json`에 provider 상태/실패 사유 기록.

### 권한 / 소유자 검증
- 기존 정책 유지: 🔒 로그인 필수, feature flag guard
- session ownership validation 변경 없음
- cross-user → 404, expired → 410, consumed → 409

### 멱등성
- extract 재호출 시 새 세션 생성 (기존 동작 유지)
- register 멱등성 유지 (consumed → 409)

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 로그인 보호 액션이면 return-to-action 포함
- FE 변경 범위:
  - Step 2 추출 결과에 `extraction_methods` 표시 (실제 사용된 소스만)
  - Step 3 부분 추출 draft UX: 재료는 있지만 step이 없을 때 "조리 과정을 직접 입력해주세요" 안내 + step 수동 추가 유도
  - 기존 step 편집/추가 UI를 활용 (신규 컴포넌트 불필요)
  - provider 미가용 시 description-only 결과 그대로 표시 (caption 미사용을 pretend하지 않음)

> Design Status가 `temporary`인 이유: 부분 추출 안내 문구와 extraction_methods 표기는 기존 YT_IMPORT 화면 내부의 경미한 상태 추가이며, 레이아웃 변경이나 신규 컴포넌트가 아니다.

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: 없음 (YT_IMPORT 내부 상태 추가, 화면 구조 변경 없음)
- Visual artifact: 없음 (기존 YT_IMPORT 화면 유지)
- Authority status: `not-required`
- Notes: transcript fallback은 백엔드 추출 경로 추가가 주 범위이며, FE 변경은 extraction_methods 표기와 부분 draft 안내 문구에 한정. 기존 YT_IMPORT Step 3의 step 수동 추가/편집 UI를 그대로 활용하므로 신규 화면, 레이아웃 변경, 컴포넌트 구조 변경 없음.

> design-generator / design-critic 생략 근거: 기존 confirmed `YT_IMPORT` 화면의 low-risk 내부 상태 추가. 새 화면, 레이아웃 재설계, anchor screen 수정 없음.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후)

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.1.md` — §2-4 YouTube Recipe Extraction Policy
- `docs/화면정의서-v1.5.8.md` — §10 YT_IMPORT Screen
- `docs/유저flow맵-v1.3.8.md` — §⑨ YouTube Recipe Registration Journey
- `docs/db설계-v1.3.7.md` — §4-2 youtube_extraction_sessions
- `docs/api문서-v1.2.11.md` — §6 YouTube Recipe Import
- `docs/workpacks/27-youtube-import-quality-uplift/README.md` — 선행 슬라이스
- `docs/workpacks/27-youtube-import-quality-uplift/live-smoke-expanded-2026-05-26.md` — 30 URL live smoke 결과

## QA / Test Data Plan

### Fixture Baseline
- 기존 slice 27 corpus 50건 유지 (regression 보호)
- 신규 transcript fixture 추가: provider-available / provider-unavailable / no-op-adapter 변형
  - 최소 10건: description에 재료 있지만 step 없는 영상의 fixture (live smoke 5건 partial blocked 케이스 기반)
  - 최소 5건: transcript에서 step 추출 가능한 fixture (provider adapter mock에 transcript text 주입)
  - 최소 3건: provider 미가용 fixture (adapter가 no-op 또는 에러 반환)
  - 최소 2건: 저품질 transcript fixture (step 추출 실패 → description-only fallback)

### 채점 하네스
- `pnpm test:youtube-corpus` — 기존 in-corpus F1 측정 (regression gate)
- 신규: transcript fallback coverage 측정 — provider-available fixture에서 step 추출 성공률
- 신규: partial draft completeness 측정 — 부분 추출 draft에서 사용자가 채워야 하는 필드 수
- 신규: no-provider path 검증 — adapter no-op 시 description-only 결과 정합성

### CI Safety
- 모든 quality gate는 fixture 기반 결정론 테스트로 CI에서 실행 가능
- YouTube Data API 호출 없음 (fixture의 transcript text 사용)
- TranscriptProvider adapter는 fixture mock으로 대체
- LLM 호출 없음

### Real DB Smoke
- `pnpm dev:demo` — local demo 환경에서 실제 YouTube URL 수동 테스트
- Manual live smoke: live smoke 5건 partial blocked 케이스 (재료 있지만 step 없음)로 transcript fallback 검증
  - Video IDs: `9fmd1LOTa-E`, `ehIHFCBZp4E`, `j0v1GCA3fxk`, `mOV2mP4DsQs`, `BRDUvwiXEQA`
- transcript provider 가용성 확인: Stage 2 feasibility 검증 결과에 따라 live smoke 범위 결정

### Seed / Migration
- corpus evidence 기반 `ingredients` / `ingredient_synonyms` seed migration (기존 패턴)
- transcript 파서용 step 추출 규칙 fixture 추가

### Blocker 조건
- `youtube_extraction_sessions` 테이블 부재
- `ingredients` / `ingredient_synonyms` 테이블 부재
- `cooking_methods` 테이블 부재
- corpus fixture 파일 부재 (tests/fixtures/youtube-corpus/)

## Key Rules

1. **Description-First 유지**: description 파싱이 항상 base path. transcript은 step 보충용 fallback.
2. **Transcript Fallback 조건**: description에서 재료 >= 1건 추출했지만 concrete step instruction == 0건일 때만 시도.
3. **No Registration-Ready Without Concrete Steps**: description과 transcript 모두에서 구체적 조리 텍스트가 없으면 registration-ready로 주장하지 않는다.
4. **extraction_methods 정직성**: `extraction_methods`에 `"caption"`은 compliant provider가 실제 step 텍스트를 제공하고 파서가 step을 추출한 경우에만 포함. 시도만 하고 실패한 경우 `["description"]`만 남긴다.
5. **Provider Adapter 경계**: transcript source는 `TranscriptProvider` 인터페이스 뒤에 추상화하여, source 교체/비활성화가 adapter 구현체 교체만으로 가능하게 한다.
6. **No-Provider 안전 경로**: compliant transcript provider가 없으면 adapter는 no-op으로 유지하고, 부분 추출 draft UX + explicit non-ready handling만 출하한다.
7. **Taxonomy Freeze Contract**: v1 canonical ingredient category는 legacy 7종 유지. 확장 금지.
8. **No LLM Fallback Default**: LLM 기반 추출은 feature-flag 후보로만 문서화. 기본 구현에 포함하지 않는다.
9. **API Shape 불변**: `POST /extract` 응답의 `ingredients[]` / `steps[]` shape 변경 금지.
10. **Session Contract 유지**: 24h TTL, ownership validation, RPC atomic registration 불변.
11. **Provider Graceful Degradation**: transcript provider 실패/미가용 시 description-only 결과 반환. 사용자에게 에러를 노출하지 않는다.
12. **외부 데이터 staging-only**: MFDS/KFRI 등 외부 데이터는 production 직적재 금지.
13. **Shared Source 사용**: ingredient category는 `lib/ingredient-categories.ts`, cooking method는 `lib/cooking-method-colors.ts` 위임.
14. **Corpus Evidence 기반**: 모든 파서 규칙 변경과 사전 시딩은 corpus fixture 증거로 정당화.

## Feasibility Risk

### YouTube official captions API 사용 제약

YouTube Data API의 `captions.list`와 `captions.download`는 **OAuth scope** (`youtube.force-ssl` 또는 `youtubepartner`)와 **영상 소유자 권한**이 필요하다. API key만으로는 임의의 공개 영상 자막을 가져올 수 없다. 따라서:

- 공식 `captions.list` → `captions.download` 경로는 현재 `.env.local` API key로 임의의 공개 요리 영상에 사용할 수 없다
- `captions.list` quota cost 50 + `captions.download` quota cost 200으로 extract 당 추가 250 unit
- Stage 2에서 검증할 대안: (1) `videos.list contentDetails.caption` 필드로 존재 여부만 확인 (추가 quota 0), (2) compliant third-party transcript library/service, (3) YouTube 비공식 `timedtext` endpoint — 아래 참조

### 비공식 transcript source (`timedtext` 등)

- YouTube의 비공식 `timedtext` API 또는 third-party 라이브러리(예: `youtube-transcript` npm 패키지)는 인증 없이 공개 영상 자막을 가져올 수 있을 수 있으나, **YouTube ToS 준수 여부, 안정성, rate limiting**이 검증되지 않았다
- 이 경로는 **Stage 2 feasibility investigation only**로 취급한다. production default로 채택하려면 제품/법률/정책 승인이 필요하다
- Stage 2 결과에 따라: (a) compliant source 확인 → adapter 구현체 연결, (b) 미확인 → adapter no-op + 부분 draft UX만 출하

## Contract Evolution Candidates (Optional)

### CE-1: `extraction_meta_json`에 transcript 가용성 필드 표준화

- **현재 계약**: `extraction_meta_json`은 자유 jsonb 필드로 provider_version, classification, warnings를 기록
- **제안 계약**: `extraction_meta_json`에 `transcript_available: boolean`, `transcript_language: string | null`, `transcript_provider: string | null` 필드를 표준화
- **기대 사용자 가치**: 추출 결과에서 transcript source 활용 여부를 투명하게 확인 가능
- **영향 문서**: `docs/db설계-v1.3.7.md` §4-2 extraction_meta_json, `docs/api문서-v1.2.11.md` §6-2 extract
- **승인 상태**: 미승인 — jsonb 내부 필드이므로 DDL 변경 없이 구현 가능하지만, 공식 문서 표준화가 필요한 경우 contract-evolution 경로 진행

> 이 후보는 승인 전까지 In Scope 계약에 포함하지 않는다. 구현 시 jsonb 내부 진단 정보로만 활용하고, 공식 응답 필드로 노출하지 않는다.

### CE-2: `POST /extract` 응답에 `partial_extraction` 필드 추가

- **현재 계약**: `blocking_issues[]` 배열로 부분 추출 상태를 간접 표현
- **제안 계약**: 응답 top-level에 `partial_extraction: boolean` 필드 추가
- **기대 사용자 가치**: 프론트엔드에서 부분 추출 상태를 명시적으로 판단하여 적절한 UX 안내 제공
- **영향 문서**: `docs/api문서-v1.2.11.md` §6-2 extract 응답 shape
- **승인 상태**: 미승인 — 공식 API response shape 변경이므로 contract-evolution 필요

> 승인 전까지 부분 추출 판단은 클라이언트에서 `blocking_issues`와 `steps` 길이로 유도한다.

### CE-3: YouTube official `captions.list` / `captions.download` 직접 사용

- **현재 계약**: `extraction_methods`에는 `description`만 기록 (MVP)
- **제안 계약**: OAuth scope 확보 후 `captions.list` → `captions.download`로 공식 API 경유 transcript 획득
- **기대 사용자 가치**: 안정적이고 ToS-compliant한 transcript source
- **전제 조건**: OAuth content-owner scope 확보 또는 YouTube Partner Program 가입, quota budget 승인 (extract당 추가 250 unit)
- **영향 문서**: `docs/api문서-v1.2.11.md` §6, YouTube Data API quota 정책
- **승인 상태**: 미승인 — OAuth scope / content-owner 권한 / quota budget 미확보

> 현재 `.env.local` API key로는 임의 공개 영상의 자막을 공식 API로 가져올 수 없다. 이 후보는 OAuth/권한 확보가 선행되어야 한다.

## Primary User Path
1. 사용자가 `MENU_ADD` → [유튜브 링크로 추가] 선택
2. YouTube URL 입력 → `POST /validate` → oEmbed 미리보기
3. [가져오기] → `POST /extract` → 설명란 파서가 재료 추출 → **재료는 있지만 step 없음 감지**
4. **TranscriptProvider adapter 자동 시도** → compliant source가 있으면 transcript에서 조리 과정 보충
5. 검수 화면: transcript에서 보충된 step 표시 + `extraction_methods: ["description", "caption"]`
6. (provider 미가용 또는 step 보충 실패 시) 부분 추출 안내 → "조리 과정을 직접 입력해주세요" + step 수동 추가
7. 필요 시 미등록 재료 등록/대체 → step 완성 → [레시피 등록] → `POST /register`
8. 플래너에 식사 추가

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 OMO metadata를 유지한다.

- [ ] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] TranscriptProvider adapter 인터페이스 설계 <!-- omo:id=delivery-provider-adapter;stage=2;scope=backend;review=3,6 -->
- [ ] Transcript source feasibility 검증 (compliant source 사용 가능 여부) <!-- omo:id=delivery-feasibility-check;stage=2;scope=backend;review=3,6 -->
- [ ] Transcript fallback 경로 구현 및 테스트 (또는 no-op adapter + 부분 draft 경로) <!-- omo:id=delivery-transcript-fallback;stage=2;scope=backend;review=3,6 -->
- [ ] `videos.list contentDetails.caption` 기반 capability 신호 구현 <!-- omo:id=delivery-caption-signal;stage=2;scope=backend;review=3,6 -->
- [ ] Transcript 텍스트에서 step 파싱 로직 (provider가 있는 경우) <!-- omo:id=delivery-transcript-step-parser;stage=2;scope=backend;review=3,6 -->
- [ ] extraction_methods 배열 정직성 보장 (실제 step 제공 시에만 caption 기록) <!-- omo:id=delivery-extraction-methods;stage=2;scope=backend;review=3,6 -->
- [ ] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [ ] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 (extraction_methods 표기 + 부분 draft 안내) <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [ ] Transcript fallback fixture coverage >= 목표치 <!-- omo:id=delivery-transcript-fixture-coverage;stage=2;scope=backend;review=3,6 -->
- [ ] 기존 slice 27 corpus regression 무위반 <!-- omo:id=delivery-corpus-regression;stage=2;scope=backend;review=3,6 -->
- [ ] Partial draft UX 안내 구현 <!-- omo:id=delivery-partial-draft-ux;stage=4;scope=frontend;review=5,6 -->
- [ ] No-provider path 검증 (adapter no-op 시 description-only + manual step UX 정상 동작) <!-- omo:id=delivery-no-provider-path;stage=2;scope=shared;review=3,6 -->
