# Slice: service-about-guide

## Goal

처음 방문한 사용자는 로그인하지 않고도 집밥이 `레시피 찾기 → 식단 계획 → 장보기 → 요리 → 남은요리 활용`로 이어지는 서비스를 이해하고, 원하는 기능으로 바로 이동할 수 있다. 기존 사용자는 웹 공통 메뉴나 모바일 HOME에서 같은 `/about` 설명서와 FAQ를 찾으며, MYPAGE의 중복 도움말에 의존하지 않는다.

## Approval And Ownership

- 사용자 승인: 2026-07-12. `/about`, 웹 공통 5메뉴, HOME `집밥 둘러보기` guide+theme rail, MYPAGE 도움말 제거 구성을 승인했다.
- 공식 계약: contract-evolution PR #977 merged (`571cdf8e`).
- Stage 1 docs owner: 별도 Codex 세션. 사용자가 Claude 사용을 중단하고 기존 Claude 담당 단계를 새 Codex 세션으로 대체하도록 명시 승인했다.
- 역할 분리: Stage 1 docs 작성, internal docs gate repair/final owner, Stage 4 구현, Stage 5·6 review/final authority는 서로 다른 Codex 세션이 맡는다. 작성·구현 세션은 자기 변경을 최종 승인하지 않는다.

## Branches

- 문서: `docs/service-about-guide`
- 백엔드: N/A — API·DB·인증 변경이 없는 FE-only 슬라이스이므로 Stage 2/3을 건너뛴다.
- 프론트엔드: `feature/fe-service-about-guide`

## In Scope

- 화면:
  - 신규 `ABOUT_SERVICE_GUIDE` (`/about`): 서비스 소개, 5단계 사용 흐름, 핵심 기능, 기능별 가이드, FAQ, 문의/신뢰, HOME·플래너 CTA
  - `HOME` 모바일 anchor extension: `빠른 이동` 다음, `모든 레시피` 이전의 `집밥 둘러보기` rail과 첫 `집밥 가이드` Link
  - desktop web chrome: `PRIMARY_WEB_NAV_ITEMS` 기반 `홈 / 플래너 / 팬트리 / 마이페이지 / 집밥 가이드`
  - `MYPAGE`: desktop 임시 도움말 탭/FAQ 제거, legacy `/mypage?tab=help` → `/about#faq` 호환 이동
  - 법적 문서: 공통 전역 웹 내비게이션과 개인정보/약관 보조 내비게이션 책임 분리
- API: 신규·변경 없음. HOME이 이미 사용하는 recipe/theme API와 기존 플래너 인증 흐름을 그대로 소비한다.
- 상태 전이: 도메인 상태 전이 없음. 정적 가이드 진입/anchor 이동, HOME theme 상태별 rail 표현, legacy help redirect만 변경한다.
- DB 영향: 없음. 테이블 읽기·쓰기 없음.
- Schema Change:
  - [x] 없음 (DB 접근 없음)
  - [ ] 있음 → migration 필요
- SEO: `/about` metadata, canonical, OpenGraph, sitemap 공개 경로
- 테스트/증거: unit/component/E2E, keyboard/a11y, 320·390·1280 screenshot, HOME before/after authority evidence

## Out of Scope

- `함께 만드는 집밥` 커뮤니티/제안 게시판, 404 제보 공개 전환, 댓글·투표·신고·관리 기능
- 앱 하단 5번째 가이드 탭, 다섯 번째 빠른 이동 카드, 별도 HOME guide banner
- `/`를 마케팅 랜딩으로 교체하거나 인증 여부에 따라 서로 다른 HOME 제공
- 도움말 검색, CMS, MDX, 관리자 콘텐츠 편집기
- 행동 분석 이벤트, 신규 운영 이메일, 후기·사용자 수·절약률·만족도 같은 검증되지 않은 수치
- YouTube flag, 성장/업적, 태그, OAuth provider 기능 자체의 활성화나 설명 확대
- API endpoint/field/error, DB table/column/RLS, 인증/권한 계약 변경
- fixed Wave1 prototype refreeze, HOME rail 밖의 mobile exact-prototype 시각 변경, global token 교체

## Dependencies

| 선행 항목 | 상태 | 근거 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap | HOME 공개 탐색, 기존 로그인 게이트/return-to-action 기반 |
| `baemin-prototype-home-parity` | merged | HOME exact-reference-ready 모바일 baseline |
| `desktop-mypage-parity` | merged | 기존 desktop/mobile MYPAGE 책임 경계 |
| service guide contract-evolution | merged | PR #977, 공식 요구사항·화면정의서·유저플로우·SoT 갱신 |

## Backend First Contract

이 슬라이스는 backend 구현이 없다.

- request/response: 신규 API 요청과 `{ success, data, error }` 응답 계약 없음
- 기존 계약: HOME recipe/theme API, 플래너 인증·return-to-action, `getLegalInfo()`를 변경 없이 사용한다.
- 권한: `/about`은 비로그인 공개다. 가이드 자체에는 보호 액션이 없고, `/planner` CTA는 기존 플래너 인증 흐름을 그대로 따른다.
- 401/403/409/422: 신규 처리 없음. 기존 API error 의미를 UI에서 재해석하지 않는다.
- 404: `/about` route 배포 회귀가 없어야 하며 잘못된 URL의 기존 전역 Not Found 계약은 변경하지 않는다.
- 멱등성: 정적 콘텐츠 조회, anchor 이동, HOME Link는 서버 쓰기가 없으므로 반복 실행해도 데이터 변화가 없다.
- legacy 호환: `/mypage?tab=help`는 MYPAGE 데이터/인증 초기화 전에 `/about#faq`로 이동한다. 다른 query/restore 계약은 유지한다.

## Frontend Delivery Mode

- Design Status는 `temporary`에서 시작하고, 신규 ABOUT 화면과 HOME anchor extension 모두 Stage 4 visual evidence 및 독립 authority review를 거친다.
- `loading`: `/about`은 정적 콘텐츠라 page-level loading이 없다. HOME theme loading에서는 guide placeholder 뒤 theme placeholders를 표시한다.
- `empty`: `/about` 고정 콘텐츠는 empty가 되지 않는다. 운영 이메일이 없으면 가짜 `mailto:` 대신 안전한 대체 안내를 표시한다. HOME theme empty는 guide-only rail을 유지한다.
- `error`: `/about`은 API error에 의존하지 않는다. HOME theme error는 guide-only rail을 유지하고, recipe error와 rail을 함께 안전하게 표현한다.
- `read-only`: 가이드 본문과 FAQ는 정보 조회용이다. accordion open/close 외 데이터 수정 UI가 없다.
- `unauthorized`: `/about`과 HOME guide Link는 비로그인 공개라 로그인 게이트를 띄우지 않는다. 플래너 CTA만 기존 인증 흐름을 사용한다.
- keyboard/a11y: FAQ/기능 가이드 accordion은 실제 `button`, `aria-expanded`, `aria-controls`, focus-visible, 올바른 heading outline을 가진다.

## Design Authority

- UI risk: `anchor-extension` (신규 `ABOUT_SERVICE_GUIDE` + `HOME` anchor extension)
- Anchor screen dependency: `HOME`
- Design generator artifacts:
  - `ui/designs/ABOUT.md`
  - `ui/designs/HOME.md`의 `2026-07-12 Service Guide Rail Supersession Addendum`
- Design critic artifacts:
  - `ui/designs/critiques/ABOUT-critique.md`
  - `ui/designs/critiques/HOME-service-about-guide-critique.md`
- `automation-spec.json`의 단일 generic `generator_artifact` / `critic_artifact`는 신규 화면 `ABOUT_SERVICE_GUIDE`의 canonical artifact를 가리킨다. 같은 spec의 `required_screens`에는 `ABOUT_SERVICE_GUIDE`와 `HOME`을 모두 두며, HOME anchor extension의 보조 generator/critic은 위 `ui/designs/HOME.md`와 `ui/designs/critiques/HOME-service-about-guide-critique.md`가 소유한다.
- Existing before evidence (Stage 1에서 현재 baseline으로 재캡처·잠금하며, Stage 4는 원본을 보존하고 after evidence를 별도 생성):
  - `ui/designs/evidence/service-about-guide/HOME-before-390.png`
  - `ui/designs/evidence/service-about-guide/HOME-before-320.png`
  - `ui/designs/evidence/service-about-guide/MYPAGE-help-before-1280.png`
  - `ui/designs/evidence/service-about-guide/WEB-NAV-before-1280.png`
- Stage 4 required after evidence:
  - ABOUT: 1280px desktop, 390px mobile, 320px narrow, FAQ open/focus state
  - HOME: before/after 390px + 320px, initial rail, theme loading, theme empty/error guide-only, filter-active rail hidden, rail→recipe transition
  - web nav: 1280px 일반 화면·법적 문서, active `/about`
  - legacy: `/mypage?tab=help` redirect evidence
- Authority reports:
  - `ui/designs/authority/ABOUT_SERVICE_GUIDE-authority.md`
  - `ui/designs/authority/HOME-service-about-guide-authority.md`
- Authority status: `required`

## Design Status

- [ ] 임시 UI (temporary) — Stage 1 설계 잠금, Stage 4 구현 전
- [ ] 리뷰 대기 (pending-review) — Stage 4 구현 완료, 독립 authority precheck 대기
- [x] 확정 (confirmed) — Stage 5 및 별도 Codex final authority 통과 후
- [ ] N/A — BE-only 슬라이스

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.11.md` §1-1, §1-1-a, §1-9
- `docs/화면정의서-v1.5.18.md` §1 HOME, §1-a ABOUT_SERVICE_GUIDE
- `docs/유저flow맵-v1.3.18.md` §①-a 서비스 가이드 여정
- `docs/db설계-v1.3.16.md` — 변경 없음 확인
- `docs/api문서-v1.2.20.md` — 변경 없음 확인
- `.omx/plans/about-service-guide-implementation-plan-20260712.md`
- `docs/design/design-tokens.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `docs/engineering/product-design-authority.md`
- `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`
- `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`

## QA / Test Data Plan

### Fixture baseline

- HOME recipe/theme fixture: recipe 6개 이상, theme 2개 이상, theme empty/error/loading fault, 검색/재료/태그 filter active 상태
- `/about`: API fixture 없이 정적 콘텐츠 렌더. `getLegalInfo()`의 이메일 있음/없음 두 상태를 unit test로 고정한다.
- MYPAGE: auth override 이전 legacy redirect와 기존 saved/recipebooks/shopping/leftovers/eaten/preferences 회귀를 구분한다.

### Real browser / environment

- Stage 4에서 `pnpm dev:demo` 또는 동등한 fixture browser 환경으로 `/about`, HOME, MYPAGE legacy URL, legal routes를 확인한다.
- hosted DB smoke는 필요하지 않다. 이 슬라이스는 DB/API/schema/auth를 변경하거나 새 table/bootstrap row에 의존하지 않는다.
- seed/reset: 기존 demo fixture reset 경로를 사용하고 신규 seed를 추가하지 않는다.
- bootstrap/system row: 해당 없음.

### Blocker conditions

- 공식 문서와 workpack copy/route/section order가 충돌함
- ABOUT 320px에서 CTA/텍스트 잘림, page-level horizontal scroll, 44px 미만 touch target 발생
- HOME rail outer height가 220px를 넘거나 카드 높이가 136~144px 범위를 벗어나 recipe entry를 과도하게 미룸
- 320px에서 next-card peek가 없거나 localized rail이 page-level overflow를 만듦
- guide Link와 theme filter button의 semantic role/accessible name이 섞임
- theme empty/error에서 guide 카드가 사라짐, 또는 filter active에서 rail이 남음
- HOME fixed prototype을 승인 범위 밖에서 변경하거나 global token을 교체함
- `/mypage?tab=help`가 로그인/MYPAGE 초기화로 먼저 진입하거나 FAQ anchor를 잃음
- community/404 공개 기능이 scope에 섞임
- required visual evidence/authority report 누락 또는 authority blocker 잔존

## Key Rules

1. **단일 설명서**: 사용자-facing 서비스 설명과 FAQ는 `/about`이 소유한다. MYPAGE에 중복 도움말 콘텐츠를 남기지 않는다.
2. **웹 메뉴 단일 소스**: 일반 웹 화면의 primary nav는 `PRIMARY_WEB_NAV_ITEMS`를 사용한다. local 5-item 복제 배열을 만들지 않는다.
3. **플랫폼별 내비게이션 분리**: desktop web은 `집밥 가이드`를 포함한 5메뉴, mobile bottom tab은 기존 4탭을 유지한다.
4. **HOME 순서**: initial mobile HOME은 `빠른 이동 → 집밥 둘러보기 → 모든 레시피`다. guide card는 rail의 첫 항목이고 뒤의 theme order/filter 동작은 보존한다.
5. **rail geometry**: outer height `≤220px`, guide/theme card `136~144px`, 같은 geometry, 320px next-card peek, localized horizontal scroll, page overflow 0을 결과 기준으로 한다.
6. **상태 독립성**: guide Link는 theme API 성공에 의존하지 않는다. theme empty/error에는 guide-only rail, theme loading에는 guide placeholder+theme placeholders, search/재료/태그 filter active에는 quick links와 rail을 숨긴다.
7. **혼합 role 접근성**: guide는 `Link[href="/about#how-to"]`, theme은 `button[aria-pressed]`다. 한 rail에서 역할·이름·focus style을 명확히 구분한다.
8. **HOME exact prototype의 좁은 supersession**: 2026-07-12 사용자 승인 addendum는 기존 HOME fixed prototype/exact-reference-ready 기준 중 **rail 위치, `집밥 둘러보기` heading, 첫 guide card, guide-only fallback, compact rail geometry에 한해서만** supersede한다. app bar, hero/search/tag/quick links, recipe cards, bottom tabs, token/type/material과 rail 밖 geometry는 기존 exact prototype authority를 유지한다. fixed prototype을 refreeze하지 않으며, authority ledger에서 이 좁은 차이는 공식 기능 계약 필수 차이로 분류한다.
9. **desktop 분리**: desktop HOME에는 guide card rail을 추가하지 않고 공통 top nav로만 접근한다.
10. **정직한 콘텐츠**: 조건부/미출시 기능, 검증되지 않은 수치, 가짜 운영 이메일을 마케팅 문구로 노출하지 않는다.
11. **회귀 우선**: nav cleanup과 MYPAGE dead code 삭제는 먼저 회귀 테스트를 실패시키고 최소 구현으로 green을 만든 뒤 수행한다.

## Contract Evolution Candidates

없음. 2026-07-12 사용자 승인 계약은 PR #977에서 공식 문서와 SoT에 반영·병합되었다. 추가 제품 계약은 이 슬라이스 In Scope에 넣지 않는다.

## Primary User Paths

### Desktop web

1. 사용자가 일반 웹 화면의 `집밥 가이드` 메뉴를 선택한다.
2. `/about`에서 핵심 가치, 5단계 흐름, 기능별 가이드 또는 FAQ를 확인한다.
3. `레시피 둘러보기`로 HOME에 가거나 `플래너 시작하기`로 기존 인증 흐름에 진입한다.

### Mobile HOME

1. 사용자가 HOME initial state에서 `빠른 이동` 다음 `집밥 둘러보기` rail을 본다.
2. 첫 `집밥 가이드` Link를 눌러 `/about#how-to`로 이동한다.
3. mobile app bar back 또는 HOME CTA로 복귀한다.

### Legacy help

1. 사용자가 `/mypage?tab=help`를 직접 방문한다.
2. 인증/MYPAGE 데이터 초기화 전에 `/about#faq`로 이동한다.
3. FAQ accordion을 keyboard/touch로 확인한다.

## Delivery Checklist

> FE-only 슬라이스다. Stage 2/3은 건너뛰고 Stage 1 docs merge + internal docs gate pass 후 별도 Codex Stage 4 세션이 구현한다.

- [x] `/about` 정적 콘텐츠 모델과 공개 route 구현 <!-- omo:id=delivery-about-route-content;stage=4;scope=frontend;review=5,6 -->
- [x] ABOUT desktop/mobile shell, anchor, CTA, accordion 구현 <!-- omo:id=delivery-about-responsive-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `PRIMARY_WEB_NAV_ITEMS` 5메뉴와 web/mobile nav 타입 경계 고정 <!-- omo:id=delivery-web-nav-single-source;stage=4;scope=shared;review=5,6 -->
- [x] 일반 웹 화면 local primary nav 복제 제거와 legal 보조 nav 분리 <!-- omo:id=delivery-web-nav-cleanup;stage=4;scope=frontend;review=5,6 -->
- [x] HOME `집밥 둘러보기` rail 위치·guide Link·theme button 동작 구현 <!-- omo:id=delivery-home-discovery-rail;stage=4;scope=frontend;review=5,6 -->
- [x] HOME loading/empty/error/filter state와 guide 독립성 고정 <!-- omo:id=delivery-home-rail-states;stage=4;scope=frontend;review=5,6 -->
- [x] rail ≤220px, card 136~144px, 320px peek, page overflow 0 검증 <!-- omo:id=delivery-home-rail-geometry;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE 도움말 surface/dead CSS 제거와 legacy redirect 구현 <!-- omo:id=delivery-mypage-help-retirement;stage=4;scope=frontend;review=5,6 -->
- [x] `/about` metadata/canonical/OpenGraph/sitemap 공개 계약 구현 <!-- omo:id=delivery-about-seo;stage=4;scope=frontend;review=5,6 -->
- [x] Vitest/Playwright/a11y/keyboard 회귀 자동화 <!-- omo:id=delivery-test-automation;stage=4;scope=frontend;review=5,6 -->
- [x] exploratory QA + qa eval 결과 기록 <!-- omo:id=delivery-exploratory-qa;stage=4;scope=frontend;review=5,6 -->
- [x] ABOUT 320/390/1280 및 HOME before/after 320/390 evidence 생성 <!-- omo:id=delivery-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] ABOUT/HOME 독립 authority report blocker 0 확인 <!-- omo:id=delivery-authority-closeout;stage=4;scope=frontend;review=5,6 -->
- [x] API/DB/auth/global token/community 범위 무변경 확인 <!-- omo:id=delivery-scope-guard;stage=4;scope=shared;review=6 -->
