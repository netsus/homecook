# Acceptance Checklist: service-brand-image-assets

> Stage 1 docs PR에서는 구현 항목을 체크하지 않는다. 구현 evidence가 생긴 뒤 역할 분리된 Stage 5/6/final authority가 다시 확인한다.

## Canonical Asset / Scope

- [x] 선택 source SHA-256이 `7ada6b0bcdd46a78a11b353c89e3506ac6288b31a20df321abe097b02738ffe4`와 일치한다 <!-- omo:id=brand-image-accept-source-hash;stage=4;scope=frontend;review=5,6 -->
- [x] runtime은 image-only PR #996의 선택 완료 export만 사용하고 screenshot·미선택 후보·따옴표/점/장식 변형을 사용하지 않는다 <!-- omo:id=brand-image-accept-selected-only;stage=4;scope=frontend;review=5,6 -->
- [x] 새 dependency/font/token/API/DB/schema/migration/seed/stored row/기술 식별자 변경이 없다 <!-- omo:id=brand-image-accept-scope;stage=4;scope=shared;review=6 -->
- [x] 기존 공식 버전, workpack, prototype, merged evidence를 수정하지 않는다 <!-- omo:id=brand-image-accept-history;stage=4;scope=shared;review=6 -->

## Header / Accessibility

- [x] mobile HOME은 공식 심볼 옆에 `무먹` 아래 `무엇을 먹든`을 유지한다 <!-- omo:id=brand-image-accept-home-mobile;stage=4;scope=frontend;review=5,6 -->
- [x] desktop HOME은 같은 조합을 사용하면서 nav 높이·tab·right slot·interaction을 보존한다 <!-- omo:id=brand-image-accept-home-desktop;stage=4;scope=frontend;review=5,6 -->
- [x] non-HOME AppHeader/WebTopNav는 공식 심볼 + `무먹`만 표시하고 정식명 보조 줄을 추가하지 않는다 <!-- omo:id=brand-image-accept-non-home;stage=4;scope=frontend;review=5,6 -->
- [x] 심볼은 정사각 비율과 선택 색상을 유지하고 320px에서 잘림·겹침·page overflow가 없다 <!-- omo:id=brand-image-accept-responsive;stage=4;scope=frontend;review=5,6 -->
- [x] 인접 텍스트가 있는 심볼은 장식 처리되어 link/heading accessible name이 중복 낭독되지 않는다 <!-- omo:id=brand-image-accept-a11y;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 HOME loading/empty/error/filter-active와 non-HOME auth/read-only/return-to-action이 유지된다 <!-- omo:id=brand-image-accept-state;stage=4;scope=frontend;review=5,6 -->

## Metadata / Install / Social

- [x] browser favicon이 canonical ICO/PNG export를 사용한다 <!-- omo:id=brand-image-accept-favicon;stage=4;scope=frontend;review=5,6 -->
- [x] metadata와 web manifest가 192/512 설치 아이콘과 180 Apple touch 아이콘을 올바른 size/type으로 연결한다 <!-- omo:id=brand-image-accept-install-icons;stage=4;scope=frontend;review=5,6 -->
- [x] root와 public static pages가 canonical 1200×630 OG/Twitter 이미지를 참조한다 <!-- omo:id=brand-image-accept-social;stage=4;scope=frontend;review=5,6 -->
- [x] 이전 orange dynamic social image generator가 runtime 기본값으로 남지 않는다 <!-- omo:id=brand-image-accept-old-social-removed;stage=4;scope=frontend;review=5,6 -->

## TDD / Verification

- [x] header·metadata·manifest 기대를 먼저 추가하고 구현 전 RED를 확인한다 <!-- omo:id=brand-image-accept-red;stage=4;scope=frontend;review=5,6 -->
- [x] component/static guard가 canonical 경로·hash·HOME/non-HOME 경계·접근성을 고정한다 <!-- omo:id=brand-image-accept-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] production build에서 favicon/manifest/OG/Twitter URL, content type, dimensions를 확인한다 <!-- omo:id=brand-image-accept-route-smoke;stage=4;scope=frontend;review=5,6 -->
- [x] lint, typecheck, product tests, build, smoke, accessibility, visual core가 통과한다 <!-- omo:id=brand-image-accept-gates;stage=4;scope=frontend;review=5,6 -->

## Authority / Evidence

- [x] 구현 전 390px/320px/1280 before screenshot을 새 workpack evidence 경로에 저장하고 이후 수정하지 않는다 <!-- omo:id=brand-image-accept-before;stage=4;scope=frontend;review=5,6 -->
- [x] 같은 viewport의 after screenshot, accessibility/geometry audit, visual verdict를 생성한다 <!-- omo:id=brand-image-accept-after;stage=4;scope=frontend;review=5,6 -->
- [x] authority report에 `> evidence:` block과 blocker/major/minor가 있고 unresolved blocker가 0이다 <!-- omo:id=brand-image-accept-authority;stage=4;scope=frontend;review=5,6 -->

## Manual Only

- 실제 배포 후 브라우저/홈 화면 추가 아이콘 cache 갱신 확인.
- 외부 공유 서비스 crawler cache 갱신 후 OG/Twitter 카드 표시 확인.
