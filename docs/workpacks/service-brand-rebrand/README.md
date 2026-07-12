# Slice: service-brand-rebrand

## Goal

사용자는 법적·SEO·최초 서비스 정의에서 정식명 `무엇을 먹든`을, AppBar·텍스트 워드마크·좁은 내비게이션에서 짧은명 `무먹`을 일관되게 본다. 기존 사용자 데이터와 기술 식별자는 그대로 유지하면서 신규·빈 nickname fallback과 system notification의 과거 브랜드 copy만 안전하게 호환한다.

## Approval And Ownership

- 사용자 승인: 2026-07-13. 고정 계약, Claude 미사용, 기존 Claude 담당 단계의 역할 분리된 새 Codex 세션 대체를 명시 승인했다.
- change type: `contract-evolution` + 후속 fullstack product slice.
- 역할 분리: Stage 1 docs owner, Stage 3 backend reviewer, Stage 4 frontend implementer, internal docs repair/final owner, authority-required final authority를 각각 별도 Codex 세션이 맡는다. Stage 1/4 작성·구현 세션은 자기 변경을 최종 승인하지 않는다. 이 slice 예외는 전역 workflow actor 규칙을 변경하지 않는다.
- 이 커밋은 docs 계약만 포함한다. 구현 코드, push, PR, merge는 수행하지 않는다.

## Branches

- 문서: `docs/service-brand-rebrand-contract`
- 백엔드: `feature/be-service-brand-rebrand`
- 프론트엔드: `feature/fe-service-brand-rebrand`

## In Scope

- 화면/copy:
  - 서비스 최초 정의·법적·SEO: `무엇을 먹든`
  - 텍스트 워드마크·AppBar·좁은 내비게이션: `무먹`
  - HOME: `무먹` AppBar, `무먹 둘러보기`, `무먹 가이드`와 접근성 이름, system source badge `무먹 추천`
  - ABOUT_SERVICE_GUIDE: `무먹 가이드`, `무엇을 먹든, 계획은 한곳에서`, `한 끼는 이렇게 이어져요`, `끼니 계획이 편해지는 이유`, `WHY IT WORKS`
  - MYPAGE/성장: `끼니 기록 / 끼니 활동 / 끼니 성장`, 조리 업적 `첫 요리 완성`
  - LOGIN/bootstrap: 신규 또는 trim 후 빈 nickname만 `무먹러` fallback
- API:
  - 신규·변경 endpoint/field 없음
  - 기존 gamification/notification read path에서 승인된 exact 브랜드 copy만 read-time canonicalization
  - 기존 `{ success, data, error }` envelope와 모든 request/response shape 유지
- 상태 전이: 도메인 상태 전이 없음. 표시 copy와 read-time 호환만 변경한다.
- DB 영향: schema/migration/row rewrite 없음. 기존 nickname과 notification stored row/payload를 보존한다.
- Schema Change:
  - [x] 없음 (기존 schema/row 보존)
  - [ ] 있음 → migration 필요
- 문서: 새 공식 문서 4종, DB v1.3.16 유지, SoT, roadmap, workflow-v2, HOME/ABOUT living design 계약 동기화

### Canonical Copy Matrix

| 기존 브랜드 copy | canonical copy |
| --- | --- |
| `집밥 가이드` | `무먹 가이드` |
| `집밥 둘러보기` | `무먹 둘러보기` |
| `레시피에서 끝나지 않는 집밥 계획` | `무엇을 먹든, 계획은 한곳에서` |
| `집밥은 이렇게 이어져요` | `한 끼는 이렇게 이어져요` |
| `집밥이 편해지는 이유` | `끼니 계획이 편해지는 이유` |
| `집밥 기록 / 집밥 활동 / 집밥 성장` | `끼니 기록 / 끼니 활동 / 끼니 성장` |
| 조리 업적 `첫 집밥 완성` | `첫 요리 완성` |
| HOME system source badge `집밥 추천` | `무먹 추천` (`system` key/shape 유지) |
| `WHY ZIPBAP` | `WHY IT WORKS` |

## Out of Scope

- 새 영문 서비스명, 새 dependency, 새 font/color/token
- DB migration, stored nickname/notification rewrite, endpoint/response field/status/enum 추가
- 이미지 로고, 마스코트, 새 brand asset 채택
- `homecook:*`, `HOMECOOK_*`, cookie/header/event/storage/package/repository/Supabase/OMO/stored key rename
- 사용자 작성 콘텐츠 또는 일반명사 `집밥`의 일괄 치환
- 과거 공식 문서 버전, merged workpack/PR evidence, prototype/reference/evidence artifact 소급 수정
- route, 정보 구조, interaction model, 도메인 상태 전이 변경

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `service-about-guide` | merged | [x] docs PR #978, FE PR #979 merge. 후속 구현 전 current-head conflict check |
| `auth-provider-memory-linking` | merged | [x] PR #967 merge. 후속 구현 전 callback/bootstrap current-head conflict check |
| service brand contract-evolution | docs | [x] 사용자 승인과 공식 문서 v1.7.12/v1.5.19/v1.3.19/v1.2.21 작성 |

> 선행 merge gate는 충족했다. 후속 Stage 2/4는 현재 head에서 두 선행 변경과 충돌이 없음을 확인한 뒤 시작한다.

## Backend First Contract

- request/path/query: 신규 항목 없음. 기존 callback, `GET /users/me`, `GET /users/me/gamification`, `GET /users/me/gamification/archive` 계약을 유지한다.
- response: 필드/타입/envelope는 바꾸지 않는다. system notification의 저장 copy가 exact legacy mapping과 일치할 때만 반환 직전에 canonical copy로 바꾼다.
- exact read-time mapping: `집밥 기록`→`끼니 기록`, `집밥 활동`→`끼니 활동`, `집밥 성장`→`끼니 성장`, `첫 집밥 완성`→`첫 요리 완성`.
- nickname: 신규 bootstrap의 원본 nickname이 없거나 trim 후 빈 값일 때만 `무먹러`; 기존 비어 있지 않은 `public.users.nickname`은 pass-through한다.
- 권한/소유권: 기존 auth/owner guard를 유지한다. canonicalization은 권한 판정 전후 의미를 바꾸지 않는다.
- 멱등성: 반복 조회 결과는 같은 canonical copy이며 DB write가 발생하지 않는다.
- errors: 401/403/404/409/422 의미와 shape를 변경하지 않는다. 새 브랜드 전용 error를 만들지 않는다.

## Frontend Delivery Mode

- 기존 화면과 route를 유지하고 copy source를 재사용 가능한 상수/기존 패턴으로 갱신한다.
- `loading / empty / error / read-only / unauthorized` 상태의 동작·레이아웃은 그대로 유지하며 각 상태에서 노출되는 브랜드 copy만 canonical 계약을 따른다.
- 기존 로그인 gate와 return-to-action을 보존한다.
- HOME은 direct modification이므로 anchor-extension으로 취급한다. copy 변경 밖의 geometry/material/interaction 수정은 금지한다.

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `HOME`
- Reused design artifacts: `ui/designs/HOME.md`, `ui/designs/ABOUT.md`
- New generator/critic: copy-only 기존 화면 변경이므로 생략. HOME은 screenshot authority evidence로 검증한다.
- Before evidence plan:
  - `ui/designs/evidence/service-brand-rebrand/HOME-before-390.png`
  - `ui/designs/evidence/service-brand-rebrand/HOME-before-320.png`
- Stage 4 after evidence plan:
  - `ui/designs/evidence/service-brand-rebrand/HOME-after-390.png`
  - `ui/designs/evidence/service-brand-rebrand/HOME-after-320.png`
  - `ui/designs/evidence/service-brand-rebrand/HOME-guide-only-after-320.png`
  - `ui/designs/evidence/service-brand-rebrand/ABOUT-after-1280.png`
- Authority report: `ui/designs/authority/HOME-service-brand-rebrand-authority.md`
- Authority status: `required`
- Notes: AppBar/rail copy 외 HOME fixed prototype geometry/token/material/interaction은 기존 authority를 유지한다. before artifact는 구현 전에 캡처하고 수정하지 않는다.

## Design Status

- [x] 임시 UI (temporary) — Stage 1 브랜드 계약 잠금, 후속 구현 전
- [ ] 리뷰 대기 (pending-review) — Stage 4 구현/evidence 완료
- [ ] 확정 (confirmed) — Stage 5와 독립 final authority에서 blocker 0
- [ ] N/A — FE 화면 없음

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.12.md`
- `docs/화면정의서-v1.5.19.md`
- `docs/유저flow맵-v1.3.19.md`
- `docs/db설계-v1.3.16.md`
- `docs/api문서-v1.2.21.md`
- `docs/workpacks/service-about-guide/README.md`
- `docs/workpacks/service-about-guide/acceptance.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `ui/designs/HOME.md`
- `ui/designs/ABOUT.md`

## QA / Test Data Plan

### Fixture baseline

- 신규/빈/기존 nickname 3종: `null|undefined`, whitespace-only, 기존 사용자 지정 nickname.
- system notification exact legacy copy 4종과 mapping 비대상 사용자 콘텐츠/일반명사 `집밥` fixture.
- HOME/ABOUT/app shell의 desktop 1280, mobile 390, narrow 320 상태와 HOME theme loading/empty/error/filter-active fixture를 재사용한다.

### Stage 2 implementation evidence `2026-07-13`

- nickname fallback/보존: `tests/user-bootstrap.test.ts`, callback 회귀 `tests/auth-callback.test.ts`.
- notification exact mapping/substring 보존/반복 조회 불변: `tests/user-gamification-brand-compatibility.test.ts`.
- gamification 조리 업적 copy와 archive/read-model 회귀: `tests/user-gamification-definitions.test.ts`, `tests/user-gamification-archive-helper.test.ts`, `tests/user-gamification-route.test.ts`.
- PR #967/#978/#979 merge commit은 기준 HEAD `38ed28862af2ac0cf4021ec7d06b790e408a99f7`의 ancestor이며, DB migration/seed/API route/type 변경 파일은 없다.

### Real browser / environment

- Stage 4에서 fixture browser 또는 `pnpm dev:demo`로 HOME/ABOUT/LOGIN/MYPAGE와 법적/SEO surface를 확인한다.
- DB migration/seed/reset은 없다. hosted DB smoke는 기존 stored nickname과 notification payload가 rewrite되지 않았음을 read-only로 확인할 수 있을 때만 수행한다.
- bootstrap system row 수와 도메인 데이터는 기존 계약을 그대로 유지한다.

### Blocker conditions

- fixed copy 불일치 또는 정식명/짧은명 사용 위치 혼동
- 기존 nickname·notification row rewrite, 사용자 콘텐츠/일반명사 global replacement
- 기술 식별자 rename, API/DB shape 변화, 새 dependency/영문 브랜드/이미지 로고·마스코트 추가
- 과거 공식 문서/prototype/evidence 수정
- HOME 390/320 before/after 또는 authority report 누락, copy 밖 geometry/material/interaction drift
- 선행 `service-about-guide`/`auth-provider-memory-linking` 변경과 current-head 충돌

## Key Rules

1. 정식명은 `무엇을 먹든`, 짧은 UI 이름은 `무먹`이다.
2. fallback `무먹러`는 신규·빈 nickname에만 적용한다. 기존 저장 nickname은 절대 브랜드 치환하지 않는다.
3. notification canonicalization은 system-owned exact legacy copy에만 적용하고 DB rewrite나 substring/global replacement를 하지 않는다.
4. 사용자 콘텐츠와 일반명사 `집밥`을 보존한다.
5. 기술 식별자와 과거 공식 버전/evidence/prototype을 보존한다.
6. API/DB shape와 도메인 상태 전이는 변하지 않는다.
7. HOME은 anchor-extension authority evidence가 없으면 confirmed로 전환하지 않는다.
8. 텍스트 워드마크만 범위이며 새 영문 브랜드·로고·마스코트·dependency는 금지한다.

## Contract Evolution Candidates

없음. 이 문서의 브랜드 계약은 사용자가 명시적으로 승인했으며 추가 후보를 In Scope에 넣지 않는다.

## Primary User Paths

### 신규 사용자

1. 사용자가 `무엇을 먹든` SEO/공개 서비스 정의를 통해 진입한다.
2. HOME AppBar의 `무먹`과 `무먹 둘러보기`에서 `무먹 가이드`를 연다.
3. nickname이 없거나 빈 값이면 `무먹러`로 시작하고 기존 로그인/return-to-action 흐름을 계속한다.

### 기존 사용자

1. 기존 저장 nickname으로 로그인한다.
2. nickname은 그대로 표시되고 AppBar/내비게이션 브랜드 copy만 `무먹`으로 바뀐다.
3. 과거 system notification은 저장 row 변경 없이 새 canonical copy로 표시된다.

### 가이드/성장

1. `/about`에서 `무엇을 먹든, 계획은 한곳에서`와 새 섹션 copy를 확인한다.
2. MYPAGE에서 `끼니 기록/활동/성장`과 `첫 요리 완성`을 본다.
3. HOME/ABOUT/MYPAGE의 route, 상태, interaction은 기존과 동일하게 동작한다.

## Delivery Checklist

- [x] 신규·빈 nickname `무먹러` fallback과 기존 nickname 보존 구현 <!-- omo:id=brand-delivery-nickname-fallback;stage=2;scope=backend;review=3,6 -->
- [x] system notification exact-copy read-time canonicalization 구현 <!-- omo:id=brand-delivery-notification-canonicalization;stage=2;scope=backend;review=3,6 -->
- [x] notification/nickname DB rewrite 및 API shape 변화 없음 검증 <!-- omo:id=brand-delivery-backend-scope-guard;stage=2;scope=shared;review=3,6 -->
- [ ] AppBar/wordmark/nav의 정식명·짧은명 surface 분리 구현 <!-- omo:id=brand-delivery-shell-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME/ABOUT/MYPAGE 고정 copy matrix 구현 <!-- omo:id=brand-delivery-fixed-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] 사용자 콘텐츠·일반명사 `집밥` 보존 source guard 구현 <!-- omo:id=brand-delivery-content-preservation;stage=4;scope=shared;review=6 -->
- [ ] 기술 식별자와 과거 official/evidence/prototype 보존 검사 <!-- omo:id=brand-delivery-identifier-history-guard;stage=4;scope=shared;review=6 -->
- [ ] 기존 loading/empty/error/read-only/unauthorized 상태 회귀 점검 <!-- omo:id=brand-delivery-state-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] unit/component/Playwright 자동화 범위 분리 <!-- omo:id=brand-delivery-test-split;stage=4;scope=shared;review=6 -->
- [ ] HOME 390/320 before/after와 guide-only evidence 생성 <!-- omo:id=brand-delivery-home-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME authority report blocker 0 확인 <!-- omo:id=brand-delivery-authority-closeout;stage=4;scope=frontend;review=5,6 -->
- [ ] API/DB/dependency/logo/mascot out-of-scope guard 최종 확인 <!-- omo:id=brand-delivery-final-scope-guard;stage=4;scope=shared;review=6 -->
