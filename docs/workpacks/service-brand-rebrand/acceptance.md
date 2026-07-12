# Acceptance Checklist: service-brand-rebrand

> 구현 evidence가 생긴 뒤에만 체크한다. `Manual Only`를 제외한 각 항목은 OMO metadata를 유지하며 Stage 1 문서 작성, Stage 2/4 구현, Stage 3/5/6 review/final authority 세션을 분리한다.

## Happy Path

- [ ] 법적·SEO·서비스 최초 정의에서 정식명 `무엇을 먹든`을 표시한다 <!-- omo:id=brand-accept-official-name;stage=4;scope=frontend;review=5,6 -->
- [ ] AppBar·텍스트 워드마크·좁은 내비게이션에서 짧은명 `무먹`을 표시한다 <!-- omo:id=brand-accept-short-name;stage=4;scope=frontend;review=5,6 -->
- [x] 신규·빈 nickname은 `무먹러`, 기존 저장 nickname은 원래 값으로 표시된다 <!-- omo:id=brand-accept-nickname-policy;stage=2;scope=shared;review=3,6 -->
- [x] 과거 system notification은 DB rewrite 없이 canonical copy로 표시된다 <!-- omo:id=brand-accept-notification-read-time;stage=2;scope=backend;review=3,6 -->

## Canonical Copy

- [ ] `집밥 가이드`의 현재 브랜드 surface는 `무먹 가이드`다 <!-- omo:id=brand-accept-copy-guide;stage=4;scope=frontend;review=5,6 -->
- [ ] `집밥 둘러보기`의 현재 브랜드 surface는 `무먹 둘러보기`다 <!-- omo:id=brand-accept-copy-discovery;stage=4;scope=frontend;review=5,6 -->
- [ ] hero는 `무엇을 먹든, 계획은 한곳에서`다 <!-- omo:id=brand-accept-copy-hero;stage=4;scope=frontend;review=5,6 -->
- [ ] how-to heading은 `한 끼는 이렇게 이어져요`다 <!-- omo:id=brand-accept-copy-howto;stage=4;scope=frontend;review=5,6 -->
- [ ] features heading은 `끼니 계획이 편해지는 이유`다 <!-- omo:id=brand-accept-copy-features;stage=4;scope=frontend;review=5,6 -->
- [ ] 성장 label은 `끼니 기록 / 끼니 활동 / 끼니 성장`이다 <!-- omo:id=brand-accept-copy-growth;stage=4;scope=frontend;review=5,6 -->
- [x] 조리 업적 label은 `첫 요리 완성`이다 <!-- omo:id=brand-accept-copy-first-cook;stage=2;scope=shared;review=3,6 -->
- [ ] HOME system source badge는 `무먹 추천`을 표시하고 `system` key/API shape는 유지한다 <!-- omo:id=brand-accept-copy-system-source-badge;stage=4;scope=shared;review=6 -->
- [ ] 설명 섹션 영문 label은 `WHY IT WORKS`이며 새 영문 서비스명으로 사용하지 않는다 <!-- omo:id=brand-accept-copy-why;stage=4;scope=frontend;review=5,6 -->

## Nickname / Notification Policy

- [x] `null`/누락/whitespace-only 신규 nickname만 `무먹러` fallback 대상이다 <!-- omo:id=brand-accept-nickname-empty-only;stage=2;scope=backend;review=3,6 -->
- [x] 기존 비어 있지 않은 nickname은 `집밥러` 같은 과거 값도 그대로 보존한다 <!-- omo:id=brand-accept-nickname-existing;stage=2;scope=backend;review=3,6 -->
- [x] exact legacy system copy 4종만 read-time mapping하고 mapping 밖 문자열은 바꾸지 않는다 <!-- omo:id=brand-accept-notification-exact-map;stage=2;scope=backend;review=3,6 -->
- [x] notification 조회 반복은 멱등하며 stored row/payload가 변경되지 않는다 <!-- omo:id=brand-accept-notification-idempotent;stage=2;scope=backend;review=3,6 -->
- [x] nickname·사용자 작성 콘텐츠·일반명사 `집밥`에는 notification mapping을 적용하지 않는다 <!-- omo:id=brand-accept-no-user-content-map;stage=2;scope=shared;review=3,6 -->

## State / Policy

- [ ] loading 상태의 브랜드 copy와 기존 skeleton 동작이 함께 유지된다 <!-- omo:id=brand-accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태의 브랜드 copy와 기존 recovery CTA가 함께 유지된다 <!-- omo:id=brand-accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태의 브랜드 copy와 기존 error/retry 의미가 함께 유지된다 <!-- omo:id=brand-accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] read-only 화면은 copy 변경 후에도 쓰기 action을 새로 만들지 않는다 <!-- omo:id=brand-accept-read-only;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized/login gate와 return-to-action 계약이 유지된다 <!-- omo:id=brand-accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 도메인 상태 전이·권한·소유권·멱등성 규칙이 바뀌지 않는다 <!-- omo:id=brand-accept-domain-policy;stage=2;scope=shared;review=3,6 -->

## API / DB / Compatibility Guard

- [x] 신규 endpoint, request/response field, enum, status, error code가 없다 <!-- omo:id=brand-accept-no-api-shape;stage=2;scope=backend;review=3,6 -->
- [x] DB schema/migration/backfill/rewrite가 없다 <!-- omo:id=brand-accept-no-db-change;stage=2;scope=backend;review=3,6 -->
- [x] `{ success, data, error }` envelope와 기존 field type이 유지된다 <!-- omo:id=brand-accept-envelope-types;stage=2;scope=backend;review=3,6 -->
- [ ] `homecook:*`, `HOMECOOK_*`, cookie/header/event/storage key가 바뀌지 않는다 <!-- omo:id=brand-accept-runtime-identifiers;stage=4;scope=shared;review=6 -->
- [ ] package/repository/Supabase/OMO/stored key가 바뀌지 않는다 <!-- omo:id=brand-accept-system-identifiers;stage=4;scope=shared;review=6 -->
- [ ] 새 dependency, 영문 브랜드, 이미지 로고, 마스코트가 없다 <!-- omo:id=brand-accept-no-new-assets-deps;stage=4;scope=shared;review=6 -->

## Historical / Content Preservation

- [ ] 기존 공식 버전 파일을 수정하지 않고 새 공식 버전 4종만 current SoT로 승격한다 <!-- omo:id=brand-accept-official-history;stage=4;scope=shared;review=6 -->
- [ ] merged workpack/PR evidence와 prototype/reference/evidence 파일을 수정하거나 rename하지 않는다 <!-- omo:id=brand-accept-evidence-history;stage=4;scope=shared;review=6 -->
- [ ] 사용자 콘텐츠와 일반명사 `집밥`을 global search/replace하지 않는다 <!-- omo:id=brand-accept-generic-jipbap;stage=4;scope=shared;review=6 -->

## HOME Anchor Extension / Design Authority

- [ ] HOME 변경을 `anchor-extension`과 authority-required로 유지한다 <!-- omo:id=brand-accept-home-risk;stage=4;scope=frontend;review=5,6 -->
- [ ] 구현 전에 HOME 390px/320px before screenshot을 캡처하고 원본을 보존한다 <!-- omo:id=brand-accept-home-before;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME 390px/320px after와 guide-only evidence를 생성한다 <!-- omo:id=brand-accept-home-after;stage=4;scope=frontend;review=5,6 -->
- [ ] AppBar `무먹`, rail `무먹 둘러보기`, guide `무먹 가이드`와 접근성 이름이 일치한다 <!-- omo:id=brand-accept-home-copy-a11y;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px에서 잘림·부자연스러운 줄바꿈·터치 타겟 축소·page-level overflow가 없다 <!-- omo:id=brand-accept-home-narrow;stage=4;scope=frontend;review=5,6 -->
- [ ] rail geometry/peek/guide-only/filter state와 Link/button semantics가 기존 계약을 유지한다 <!-- omo:id=brand-accept-home-behavior;stage=4;scope=frontend;review=5,6 -->
- [ ] copy 밖 HOME app shell/geometry/token/material/interaction 차이는 0이다 <!-- omo:id=brand-accept-home-narrow-diff;stage=4;scope=frontend;review=5,6 -->
- [ ] authority report에 `> evidence:`가 있고 unresolved blocker가 0이다 <!-- omo:id=brand-accept-authority-report;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] 신규 null/빈 nickname과 기존 저장 nickname fixture가 준비된다 <!-- omo:id=brand-accept-fixture-nickname;stage=2;scope=shared;review=3,6 -->
- [x] exact legacy notification copy와 사용자 콘텐츠 보존 fixture가 준비된다 <!-- omo:id=brand-accept-fixture-notification;stage=2;scope=shared;review=3,6 -->
- [x] 신규 DB seed/bootstrap/system row가 필요하지 않음을 확인한다 <!-- omo:id=brand-accept-no-bootstrap;stage=2;scope=shared;review=3,6 -->
- [x] `auth-provider-memory-linking` PR #967과 `service-about-guide` docs #978/FE #979 merge 증거가 일치하고 후속 구현 current-head conflict가 0이다 <!-- omo:id=brand-accept-dependency-gate;stage=2;scope=shared;review=3,6 -->

## Automation Split

### Vitest

- [x] nickname fallback/existing-value 보존과 notification exact mapping을 unit test로 고정한다 <!-- omo:id=brand-accept-vitest-backend;stage=2;scope=backend;review=3,6 -->
- [ ] brand copy matrix, nav/AppBar, HOME/ABOUT/MYPAGE surface를 unit/component test로 고정한다 <!-- omo:id=brand-accept-vitest-frontend;stage=4;scope=frontend;review=5,6 -->
- [ ] technical identifier와 historical artifact 변경 금지 source guard를 둔다 <!-- omo:id=brand-accept-vitest-guards;stage=4;scope=shared;review=6 -->

### Playwright

- [ ] desktop SEO/nav→ABOUT와 mobile HOME→guide 흐름에서 canonical copy를 검증한다 <!-- omo:id=brand-accept-playwright-guide;stage=4;scope=frontend;review=5,6 -->
- [ ] 390/320 HOME AppBar/rail copy, overflow, theme empty/error/filter-active 회귀를 검증한다 <!-- omo:id=brand-accept-playwright-home;stage=4;scope=frontend;review=5,6 -->
- [ ] LOGIN/MYPAGE의 신규 fallback·기존 nickname·성장 copy 표시를 검증한다 <!-- omo:id=brand-accept-playwright-account;stage=4;scope=frontend;review=5,6 -->

### Manual QA

- verifier: Stage 4 구현과 다른 Codex browser/evidence 또는 Stage 5 review 세션
- environment: desktop 1280px, mobile 390px, narrow 320px, fixture/demo
- scenarios: 법적/SEO 최초 정의, HOME/AppBar/rail, ABOUT, LOGIN 신규/기존 nickname, MYPAGE 성장/알림, 사용자 콘텐츠 보존

### Manual Only

- 사용자 최종 브랜드 copy/taste 확인
- 배포 preview의 실제 metadata/OpenGraph/social preview 확인
- 운영 DB의 기존 nickname/notification row가 rewrite되지 않았다는 read-only 표본 확인
