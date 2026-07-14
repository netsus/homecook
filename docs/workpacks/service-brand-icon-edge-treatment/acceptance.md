# Acceptance Checklist: service-brand-icon-edge-treatment

> Stage 1 docs PR에서는 구현 항목을 체크하지 않는다. 구현 evidence가 생긴 뒤 독립 Stage 5/6 review가 다시 확인한다.

## Canonical Asset / Scope

- [ ] 선택 source SHA-256이 `7ada6b0bcdd46a78a11b353c89e3506ac6288b31a20df321abe097b02738ffe4`와 일치한다 <!-- omo:id=brand-icon-edge-accept-source;stage=4;scope=frontend;review=5,6 -->
- [ ] source/header/OG/Twitter·가로형·흑백 자산이 README Preservation Baseline의 고정 SHA-256과 일치한다 <!-- omo:id=brand-icon-edge-accept-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] screenshot·미선택 후보·임시 생성 후보가 runtime에 포함되지 않는다 <!-- omo:id=brand-icon-edge-accept-selected-only;stage=4;scope=frontend;review=5,6 -->
- [ ] 새 dependency/API/DB/schema/migration/seed/route/interaction/접근성 이름 변경이 없다 <!-- omo:id=brand-icon-edge-accept-scope;stage=4;scope=shared;review=6 -->
- [ ] 과거 공식 버전, workpack, prototype, merged evidence를 수정하지 않는다 <!-- omo:id=brand-icon-edge-accept-history;stage=4;scope=shared;review=6 -->

## Favicon

- [ ] favicon 16/32/48/64 PNG의 네 corner alpha가 `0`이다 <!-- omo:id=brand-icon-edge-accept-favicon-alpha;stage=4;scope=frontend;review=5,6 -->
- [ ] favicon의 반투명 경계에 near-white matte·halo가 없다 <!-- omo:id=brand-icon-edge-accept-favicon-halo;stage=4;scope=frontend;review=5,6 -->
- [ ] ICO가 16/32/48/64 frame을 포함하고 각 frame corner가 투명하다 <!-- omo:id=brand-icon-edge-accept-ico;stage=4;scope=frontend;review=5,6 -->
- [ ] 16/32px 어두운 tab 합성에서 `무먹` 글자 형태와 가독성이 유지된다 <!-- omo:id=brand-icon-edge-accept-favicon-visual;stage=4;scope=frontend;review=5,6 -->

## Install / PWA / Apple

- [ ] 180/192/256/512/1024 설치용 PNG의 네 corner가 불투명 브랜드 파란 계열이고 near-white가 아니다 <!-- omo:id=brand-icon-edge-accept-install-corners;stage=4;scope=frontend;review=5,6 -->
- [ ] 설치용 아이콘은 캔버스 전체가 파란 배경이며 흰색 외곽 또는 선제 rounded mask가 없다 <!-- omo:id=brand-icon-edge-accept-full-bleed;stage=4;scope=frontend;review=5,6 -->
- [ ] manifest 192 항목이 `/brand/app-icon-192.png`를 참조하고 header 심볼 경로를 재사용하지 않는다 <!-- omo:id=brand-icon-edge-accept-manifest-192;stage=4;scope=frontend;review=5,6 -->
- [ ] document 일반 icon metadata에는 투명 favicon 후보만 있고 `mumeok-symbol-192.png`와 설치 아이콘 후보가 없다 <!-- omo:id=brand-icon-edge-accept-document-icons;stage=4;scope=frontend;review=5,6 -->
- [ ] manifest 192/512와 Apple touch 180의 size/type metadata가 정확하다 <!-- omo:id=brand-icon-edge-accept-metadata;stage=4;scope=frontend;review=5,6 -->
- [ ] source target-size baseline의 border-connected matte + 2px 전이대 밖 보호 core가 새 favicon/install export와 pixel-for-pixel 동일하다 <!-- omo:id=brand-icon-edge-accept-protected-core;stage=4;scope=frontend;review=5,6 -->

## TDD / Verification

- [ ] 현재 흰 corner와 192 경로 재사용을 검출하는 테스트를 먼저 추가하고 RED를 확인한다 <!-- omo:id=brand-icon-edge-accept-red;stage=4;scope=frontend;review=5,6 -->
- [ ] pixel/hash/static guard와 production route smoke가 GREEN이다 <!-- omo:id=brand-icon-edge-accept-green;stage=4;scope=frontend;review=5,6 -->
- [ ] `/favicon.ico`, favicon PNG, app-icon-192/512, Apple touch 전용 production HTTP smoke가 통과한다 <!-- omo:id=brand-icon-edge-accept-http-smoke;stage=4;scope=frontend;review=5,6 -->
- [ ] lint, typecheck, 관련 Vitest, build와 정적 asset smoke가 통과한다 <!-- omo:id=brand-icon-edge-accept-gates;stage=4;scope=frontend;review=5,6 -->
- [ ] before/after contact sheet와 visual verdict에 unresolved blocker/major가 없다 <!-- omo:id=brand-icon-edge-accept-visual;stage=4;scope=frontend;review=5,6 -->
- [ ] 독립 reviewer가 source/glyph 보존과 pixel contract를 확인한다 <!-- omo:id=brand-icon-edge-accept-review;stage=4;scope=frontend;review=5,6 -->

## Manual Only

- 실제 배포 후 browser favicon cache 갱신 확인.
- 실제 iOS/Android/PWA 홈 화면 추가 뒤 OS별 mask 결과 확인.
